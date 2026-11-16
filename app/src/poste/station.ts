// La station de l'ordinateur, tenue par un process : installer l'app, c'est installer la station de la
// machine. Elle est lancée comme le système lance celle d'un serveur — le même point d'entrée
// (runtime/src/station/main.ts), le même répertoire tenu (`BRIGADE_STATION_DIR`), la même
// configuration des projets, la même présence sur GitHub —, et rien d'autre ne change. Ce qui la tient
// est la station de fond (station-fond/hote.ts, #3630), qui ne dépend pas de l'app.
//
// - **Elle vit avec ce qui la tient.** Son entrée fermée — l'hôte arrêté, ou tué —, elle s'arrête
//   comme sur un SIGTERM (poste/enveloppe.ts) : ses projets s'arrêtent, et GitHub porte l'heure de
//   son arrêt. Morte d'elle-même, elle est relancée cinq secondes plus tard. Refusée au démarrage (code 2 : une autre
//   station tenait encore le répertoire, comme à la mise à jour à chaud), elle est retentée d'elle-même, avec un délai
//   qui double jusqu'à cinq minutes (#3701) : jamais « jusqu'au redémarrage de l'app ».
// - **Elle s'appaire.** La station affiche son code dans son journal, comme sur un serveur ; ce qui la
//   tient le lit et le fait taper par le geste du champ de la home (stations/stations.ts, par l'app :
//   station-fond/fond.ts). Refusé — GitHub ne montre pas encore son gist —, il est retapé à chaque
//   essai, tant qu'il est le code affiché.
// - **Une seule par machine et par compte.** Le répertoire de la station porte le pid du process qui
//   la tient (`app.pid`) : un second ne lance pas une deuxième station, et le dit.
//
// Ce que la station dit passe par `dire` : le journal de la station de fond.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { uptime } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { arreterLaSurvivante, laisserSurvivre, reprendreLaSurvivante } from "../mise-a-jour-fond/survie.ts";
import type { Appairage } from "../stations/stations.ts";

// Ce que la station écrit quand elle attend d'être appairée — sa ligne, sur un serveur comme ici.
const CODE_AFFICHE = /tape ce code dans l'app : ([0-9A-Z]{4}-[0-9A-Z]{4})/;
// Le code de sortie d'une station qui refuse de démarrer.
const REFUS = 2;
// Le plus long délai entre deux essais d'une station qui refuse de démarrer.
const REFUS_MAX_MS = 300_000;
// Pendant la première minute d'échecs, le délai ne grandit pas : une mise à jour à chaud démarre dans la minute.
const REFUS_PLAT_MS = 60_000;
const dureeDite = (ms: number) => (ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);
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
  // Combien de temps les essais d'une station refusée restent à `relanceMs`, avant que leur délai ne double (60 s).
  platMs?: number;
  reessaiMs?: number;
  // Le temps laissé à la station pour s'arrêter, avant qu'elle soit tuée.
  gardeMs?: number;
  // Joué avant chaque lancement du process de la station : ce qu'elle doit sentir de sa configuration
  // (station-embarquee-cuisine-unique.ts). Il ne lève pas ; la station part quand il a fini.
  avantLancement?: () => Promise<void>;
  // La station vient de se lancer, ou de s'arrêter : `tourne()` a changé.
  surChangement?: () => void;
};

export type StationLocale = {
  etat(): EtatStationLocale;
  // Un process de station tourne-t-il pour cet ordinateur ? Pas entre sa mort et sa relance, ni
  // refusée ou arrêtée ; tenue par une autre app, oui : c'est elle qui la fait tourner.
  tourne(): boolean;
  // Ferme son entrée et attend qu'elle se soit arrêtée. `laisser` : l'app se ferme pour sa mise à jour, la
  // station et ses cooks continuent (mise-a-jour-fond/survie.ts).
  arreter(options?: { laisser?: boolean }): Promise<void>;
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

// La marque `tenue` nomme-t-elle encore le process `lu` ? Il vit, et elle a été écrite depuis le démarrage du système :
// celle d'avant un redémarrage, ou une coupure, nomme un pid que le système a pu redonner à un tout autre process. La
// marge couvre l'arrondi de `uptime()`, en secondes.
function marqueVivante(tenue: string, lu: number): boolean {
  if (!Number.isInteger(lu) || lu <= 0 || !vivant(lu)) return false;
  try {
    return statSync(tenue).mtimeMs >= Date.now() - uptime() * 1000 - 2_000;
  } catch {
    return false;
  }
}

// Prend la station de ce répertoire pour le process `pid`, ou rend le pid de celui qui la tient déjà. Une marque laissée
// par un process mort, ou d'avant le démarrage du système, ne tient plus rien : elle est reprise.
export function prendreLaStation(racine: string, pid: number): number | undefined {
  const tenue = join(racine, TENUE_PAR);
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
    if (marqueVivante(tenue, lu)) return lu;
    // Un process parti sans rendre la station : sa marque ne tient plus rien.
    rmSync(tenue, { force: true });
  }
  return undefined;
}

// Le pid du process vivant qui tient la station de ce répertoire, sans la prendre : aucun quand la marque manque, ne se
// lit pas, nomme un process mort, ou date d'avant le démarrage du système.
export function tenantDeLaStation(racine: string): number | undefined {
  const tenue = join(racine, TENUE_PAR);
  try {
    const lu = Number.parseInt(readFileSync(tenue, "utf8"), 10);
    return marqueVivante(tenue, lu) ? lu : undefined;
  } catch {
    return undefined;
  }
}

// Rend la station de ce répertoire, si c'est bien le process `pid` qui la tient : celle d'un autre n'est pas touchée.
export function rendreLaStation(racine: string, pid: number): void {
  const tenue = join(racine, TENUE_PAR);
  try {
    if (Number.parseInt(readFileSync(tenue, "utf8"), 10) === pid) rmSync(tenue, { force: true });
  } catch {
    // Déjà rendue.
  }
}

// Le délai avant le `essai`-ième nouvel essai d'une station refusée : `relanceMs` tant que `platMs` n'est pas écoulé — une
// mise à jour à chaud démarre dans la minute —, puis il double d'un essai à l'autre, jusqu'à `REFUS_MAX_MS`.
function delaiDuReessai(essai: number, relanceMs: number, platMs: number): number {
  const plats = Math.ceil(platMs / relanceMs);
  if (essai <= plats) return relanceMs;
  return Math.min(relanceMs * 2 ** (essai - plats), Math.max(REFUS_MAX_MS, relanceMs));
}

export function tenirStationLocale(options: OptionsStationLocale): StationLocale {
  const { racine, dire } = options;
  const pid = options.pid ?? process.pid;
  const relanceMs = options.relanceMs ?? 5_000;
  const reessaiMs = options.reessaiMs ?? 30_000;
  let etat: EtatStationLocale = "arretee";
  let enfant: ChildProcess | undefined;
  let fin: Promise<void> = Promise.resolve();
  let minuteur: NodeJS.Timeout | undefined;
  let arretee = false;
  let tenant: number | undefined;
  // Le pid d'une station qu'une app fermée pour sa mise à jour a laissée en route, et que celle-ci a reprise.
  let reprise: number | undefined;
  // Le code que la station affiche, tant qu'il n'est pas appairé.
  let code: string | null = null;
  let derniere = "";
  let lances = 0;
  // Les démarrages refusés ou impossibles qui se suivent : le délai du suivant double.
  let plats = 0;
  const platMs = options.platMs ?? REFUS_PLAT_MS;
  let essais = 0;
  const delaiApresEchec = () => delaiDuReessai(++essais, relanceMs, platMs);
  const repartir = () => {
    essais = 0;
  };
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

  const prendre = () => prendreLaStation(racine, pid);
  const rendre = () => rendreLaStation(racine, pid);

  const tourne = () => enfant !== undefined || reprise !== undefined || etat === "tenue-ailleurs";
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
      const delai = delaiApresEchec();
      etat = "refusee";
      signaler();
      dire(`brigade: this computer's station is not launched — its directory ${racine} cannot be written: ${message(erreur)}; trying again in ${dureeDite(delai)}`);
      return plusTard(lancer, delai);
    }
    if (autre !== undefined) {
      if (tenant !== autre) dire(`brigade: this computer's station is run by another app (pid ${autre}) — this one takes it over when that one closes`);
      tenant = autre;
      etat = "tenue-ailleurs";
      signaler();
      return plusTard(lancer, reessaiMs);
    }
    tenant = undefined;
    const marquee = existsSync(join(racine, "survit-a-l-app"));
    const survivante = reprendreLaSurvivante(racine);
    if (survivante !== undefined) return reprendre(survivante);
    if (marquee) dire("brigade: a station was left running for the app update but could not be confirmed as the station — not taken back, a new one starts");
    if (options.avantLancement === undefined) return demarrer();
    // La marque de l'app est posée : une seconde app n'ouvre pas la station pendant ce temps.
    void options.avantLancement().catch(() => {}).then(() => {
      if (!arretee) demarrer();
    });
  };

  // La station que la mise à jour de l'app a laissée en route est reprise telle quelle : une seconde ne
  // s'ouvre pas à côté. Morte d'elle-même, elle est relancée comme les autres.
  const reprendre = (survivante: number) => {
    reprise = survivante;
    etat = lances++ === 0 ? "demarree" : "relancee";
    signaler();
    dire(`brigade: this computer's station kept running while the app updated (pid ${survivante}) — the app took it back`);
    const veiller = () => {
      if (arretee || reprise !== survivante) return;
      try {
        process.kill(survivante, 0);
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code !== "EPERM") {
          reprise = undefined;
          signaler();
          dire(`brigade: this computer's station stopped — relaunched in ${Math.round(relanceMs / 1000)} s`);
          return plusTard(lancer, relanceMs);
        }
      }
      plusTard(veiller, 2_000);
    };
    plusTard(veiller, 2_000);
  };

  const demarrer = () => {
    const lance = spawn(options.node, [ENVELOPPE, options.principal], {
      // Sous Windows, une app sans console qui lance `node` lui en ouvrirait une : elle reste cachée.
      windowsHide: true,
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
      let delai = relanceMs;
      const lancee = Date.now();
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
        plusTard(lancer, delai);
      };
      const echouer = (pourquoi: string) => {
        // Une station qui a tourné longtemps avant de refuser repart de zéro.
        if (Date.now() - lancee > REFUS_PLAT_MS) repartir();
          delai = delaiApresEchec();
        finir(`brigade: this computer's station ${pourquoi}; trying again in ${dureeDite(delai)}`, false);
      };
      lance.once("error", (erreur) => echouer(`could not be launched — ${message(erreur)} (\`${options.node}\`)`));
      lance.once("close", (sortie, signal) => {
        if (sortie === REFUS) return echouer(`refused to start — ${derniere}`);
        repartir();
        finir(`brigade: this computer's station stopped (${signal ?? `code ${sortie}`}) — relaunched in ${Math.round(relanceMs / 1000)} s`, true);
      });
    });
  };

  lancer();

  return {
    etat: () => etat,
    tourne,
    async arreter(arret) {
      if (arretee) return fin;
      arretee = true;
      clearTimeout(minuteur);
      for (const lever of [...attentes]) lever();
      if (arret?.laisser === true) {
        // L'app se ferme pour sa mise à jour : la station et ses cooks continuent, la marque la garde en vie.
        if (enfant !== undefined || reprise !== undefined) laisserSurvivre(racine);
        etat = "arretee";
        reprise = undefined;
        signaler();
        return rendre();
      }
      const survivante = reprise;
      if (survivante !== undefined) {
        reprise = undefined;
        await arreterLaSurvivante(survivante, options.gardeMs ?? 30_000);
        etat = "arretee";
        signaler();
        return rendre();
      }
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
