// La station de l'ordinateur, tenue par l'app : installer l'app, c'est installer la station de la
// machine. L'app la lance comme le système lance celle d'un serveur — le même point d'entrée
// (runtime/src/station/main.ts), le même répertoire tenu (`BRIGADE_STATION_DIR`), la même
// configuration des projets, la même présence sur GitHub —, et rien d'autre ne change.
//
// - **Elle vit avec l'app.** L'app ouverte, la station tourne ; l'app fermée, ou tuée, son entrée
//   se ferme et elle s'arrête comme sur un SIGTERM (poste/enveloppe.ts) : ses projets s'arrêtent,
//   et GitHub porte l'heure de son arrêt. Morte d'elle-même, elle est relancée cinq secondes plus
//   tard — sauf si elle a refusé de démarrer (code 2) : réessayer ne changerait rien. C'est ce que
//   fait systemd pour celle d'un serveur.
// - **Elle s'appaire seule.** La station affiche son code dans son journal, comme sur un serveur ;
//   l'app, qui le lit, le tape à la place du chef, par le geste du champ de la home
//   (stations/stations.ts). Refusé — GitHub ne montre pas encore son gist —, il est retapé toutes
//   les trente secondes, tant qu'il est le code affiché.
// - **Une seule par machine et par compte.** Le répertoire de la station porte le pid de l'app qui
//   la tient (`app.pid`) : une deuxième app ouverte ne lance pas une deuxième station, et le dit ;
//   elle la reprend si la première se ferme.
//
// Ce que la station dit s'écrit tel quel dans le terminal qui a lancé l'app.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import type { Appairage } from "../stations/stations.ts";

// Ce que la station écrit quand elle attend d'être appairée — sa ligne, sur un serveur comme ici.
const CODE_AFFICHE = /tape ce code dans l'app : ([0-9A-Z]{4}-[0-9A-Z]{4})/;
// Le code de sortie d'une station qui refuse de démarrer.
const REFUS = 2;
export const TENUE_PAR = "app.pid";
const ENVELOPPE = join(import.meta.dirname, "enveloppe.ts");

export type EtatStationLocale = "demarree" | "relancee" | "tenue-ailleurs" | "refusee" | "arretee";

export type OptionsStationLocale = {
  // Le `node` qui la joue, et son point d'entrée.
  node: string;
  principal: string;
  // Son répertoire : `BRIGADE_STATION_DIR`.
  racine: string;
  // L'environnement de l'app, que la station hérite — et chacun de ses projets.
  env: Record<string, string | undefined>;
  dire: (ligne: string) => void;
  // Le geste du chef qui tape un code sur la home.
  appairer: (code: string) => Promise<Appairage>;
  // Le pid de l'app qui la tient.
  pid?: number;
  relanceMs?: number;
  reessaiMs?: number;
  // Le temps laissé à la station pour s'arrêter, avant qu'elle soit tuée.
  gardeMs?: number;
  // La station vient de se lancer, ou de s'arrêter : `tourne()` a changé.
  surChangement?: () => void;
};

export type StationLocale = {
  etat(): EtatStationLocale;
  // Un process de station tourne-t-il pour cet ordinateur ? Pas entre sa mort et sa relance, ni
  // refusée ou arrêtée ; tenue par une autre app, oui : c'est elle qui la fait tourner.
  tourne(): boolean;
  // Ferme son entrée et attend qu'elle se soit arrêtée.
  arreter(): Promise<void>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Un pid vivant, ou que le système refuse de sonder : un autre compte l'a, il n'est pas mort.
function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function tenirStationLocale(options: OptionsStationLocale): StationLocale {
  const { racine, dire } = options;
  const pid = options.pid ?? process.pid;
  const relanceMs = options.relanceMs ?? 5_000;
  const reessaiMs = options.reessaiMs ?? 30_000;
  const tenue = join(racine, TENUE_PAR);
  let etat: EtatStationLocale = "arretee";
  let enfant: ChildProcess | undefined;
  let fin: Promise<void> = Promise.resolve();
  let minuteur: NodeJS.Timeout | undefined;
  let arretee = false;
  let tenant: number | undefined;
  // Le code que la station affiche, tant qu'il n'est pas appairé.
  let code: string | null = null;
  let derniere = "";
  let lances = 0;
  // Les attentes en cours entre deux essais d'appairage : l'arrêt les lève.
  const attentes = new Set<() => void>();
  const attendre = (ms: number) =>
    new Promise<void>((resoudre) => {
      const lever = () => {
        clearTimeout(minuterie);
        attentes.delete(lever);
        resoudre();
      };
      const minuterie = setTimeout(lever, ms);
      attentes.add(lever);
    });

  // Prend la station pour cette app, ou rend le pid de l'app qui la tient déjà.
  const prendre = (): number | undefined => {
    mkdirSync(racine, { recursive: true });
    for (let essai = 0; essai < 2; essai++) {
      try {
        writeFileSync(tenue, `${pid}\n`, { flag: "wx" });
        return undefined;
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code !== "EEXIST") throw erreur;
      }
      const lu = Number.parseInt(readFileSync(tenue, "utf8"), 10);
      if (lu === pid) return undefined;
      if (Number.isInteger(lu) && lu > 0 && vivant(lu)) return lu;
      // Une app partie sans rendre la station : sa marque ne tient plus rien.
      rmSync(tenue, { force: true });
    }
    return undefined;
  };
  const rendre = () => {
    try {
      if (Number.parseInt(readFileSync(tenue, "utf8"), 10) === pid) rmSync(tenue, { force: true });
    } catch {
      // Déjà rendue.
    }
  };

  const tourne = () => enfant !== undefined || etat === "tenue-ailleurs";
  let dit = false;
  // Dit le changement de `tourne()`, une seule fois par changement.
  const signaler = () => {
    const maintenant = tourne();
    if (maintenant === dit) return;
    dit = maintenant;
    // Après la lecture en cours : `tenirStationLocale` lance la station avant de rendre la main.
    if (options.surChangement !== undefined) queueMicrotask(options.surChangement);
  };

  const plusTard = (faire: () => void, ms: number) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(faire, ms);
  };

  const appairer = async (affiche: string) => {
    code = affiche;
    let ditRefus = "";
    while (!arretee && code === affiche) {
      const rendu = await options.appairer(affiche);
      if ("appairee" in rendu) {
        if (code === affiche) code = null;
        dire(`brigade: this computer's station is paired with the app, as “${rendu.appairee}” — it shows in Stations`);
        return;
      }
      if (rendu.refus !== ditRefus) dire(`brigade: this computer's station is not paired yet — ${rendu.refus}; the app tries again every ${Math.round(reessaiMs / 1000)} s`);
      ditRefus = rendu.refus;
      await attendre(reessaiMs);
    }
  };

  const lancer = () => {
    if (arretee) return;
    let autre: number | undefined;
    try {
      autre = prendre();
    } catch (erreur) {
      // Un répertoire qu'on ne peut pas écrire : l'app s'ouvre quand même, sans sa station.
      etat = "refusee";
      signaler();
      return dire(`brigade: this computer's station is not launched — its directory ${racine} cannot be written: ${message(erreur)}`);
    }
    if (autre !== undefined) {
      if (tenant !== autre) dire(`brigade: this computer's station is run by another app (pid ${autre}) — this one takes it over when that one closes`);
      tenant = autre;
      etat = "tenue-ailleurs";
      signaler();
      return plusTard(lancer, reessaiMs);
    }
    tenant = undefined;
    const lance = spawn(options.node, [ENVELOPPE, options.principal], {
      // Le dossier du runtime, comme pour le service d'un serveur.
      cwd: dirname(dirname(dirname(options.principal))),
      env: { ...options.env, BRIGADE_STATION_DIR: racine },
      stdio: ["pipe", "pipe", "pipe"],
    });
    enfant = lance;
    etat = lances++ === 0 ? "demarree" : "relancee";
    signaler();
    for (const flux of [lance.stdout, lance.stderr]) {
      createInterface({ input: flux }).on("line", (ligne) => {
        dire(ligne);
        if (ligne.trim() !== "") derniere = ligne;
        const [, affiche] = CODE_AFFICHE.exec(ligne) ?? [];
        if (affiche !== undefined && affiche !== code) void appairer(affiche);
      });
    }
    lance.stdin.on("error", () => {});
    fin = new Promise((resoudre) => {
      let fini = false;
      const finir = (dit: string | undefined, relancer: boolean) => {
        if (fini) return;
        fini = true;
        enfant = undefined;
        code = null;
        signaler();
        resoudre();
        if (arretee) return;
        if (dit !== undefined) dire(dit);
        if (relancer) return plusTard(lancer, relanceMs);
        etat = "refusee";
        rendre();
      };
      lance.once("error", (erreur) => finir(`brigade: this computer's station could not be launched — ${message(erreur)} (\`${options.node}\`); it is not launched again until the app restarts`, false));
      lance.once("close", (sortie, signal) => {
        if (sortie === REFUS) return finir(`brigade: this computer's station refused to start — ${derniere}; it is not launched again until the app restarts`, false);
        finir(`brigade: this computer's station stopped (${signal ?? `code ${sortie}`}) — relaunched in ${Math.round(relanceMs / 1000)} s`, true);
      });
    });
  };

  lancer();

  return {
    etat: () => etat,
    tourne,
    async arreter() {
      if (arretee) return fin;
      arretee = true;
      clearTimeout(minuteur);
      for (const lever of [...attentes]) lever();
      const enCours = enfant;
      if (enCours !== undefined) {
        enCours.stdin?.end();
        const garde = setTimeout(() => enCours.kill("SIGKILL"), options.gardeMs ?? 30_000);
        await fin;
        clearTimeout(garde);
      }
      etat = "arretee";
      signaler();
      rendre();
    },
  };
}
