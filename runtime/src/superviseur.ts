// Surveille un sous-processus — un cook — et l'arrête s'il dépasse ses
// plafonds, s'il se tait trop longtemps, ou si on le lui demande. Mécanique
// pure : aucun journal ici, et rien qui soit propre à `claude` au-delà de la
// forme de son flux.
import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { MotifArret, Plafonds } from "./evenements/garde-fous.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import { lignesMasquees } from "./lignes-masquees.ts";

export type Arret = { reason: MotifArret; limit: number | null; observed: number | null };

export type Fin = {
  // Code de sortie, ou null si le process est mort d'un signal ou n'a jamais
  // démarré.
  code: number | null;
  signal: string | null;
  turns: number;
  tokens: number;
  durationMs: number;
  // Le garde-fou qui a arrêté le cook, ou null s'il s'est terminé seul.
  arret: Arret | null;
  // Le process n'a pas pu être lancé.
  erreur: string | null;
  // Combien de fois ce qui a la forme d'identifiants de Claude a été masqué
  // dans ce qu'il a dit, flux et sortie d'erreur. Absent : jamais.
  masques?: number;
};

export type OptionsSupervision = {
  commande: string;
  args: string[];
  cwd?: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  plafonds: Plafonds;
  // Délai laissé au cook entre SIGTERM et SIGKILL.
  graceMs: number;
  // Fichier où s'écrit le flux brut ; la sortie d'erreur va dans `<flux>.stderr`.
  flux: string;
  // Appelé avec le motif avant que le signal parte.
  surArret?: (arret: Arret) => void;
  // Ce qui passe sur chaque ligne avant qu'elle ne s'écrive, flux et sortie
  // d'erreur : le masque des secrets du projet. Avec ou sans lui, ce qui a la
  // forme d'identifiants de Claude y est masqué. Les plafonds, eux, se
  // comptent sur ce que le cook a dit.
  masquer?: (texte: string) => string;
  // Ce qu'une sortie sans saut de ligne peut faire attendre en mémoire, en
  // octets, avant d'être écrite sans lui. Par défaut, `ATTENTE_MAX`.
  attenteMax?: number;
};

export type Supervise = {
  pid: number | undefined;
  // Ce que le cook a consommé jusqu'ici.
  mesure(): { turns: number; tokens: number };
  // Arrête le cook : sans motif, c'est la commande « stop ». Sans effet sur un
  // cook déjà arrêté.
  arreter(motif?: Arret): void;
  // Tue le cook sur-le-champ, sans motif : le runtime s'en va.
  abandonner(): void;
  fin: Promise<Fin>;
};

const nombre = (valeur: unknown) => (typeof valeur === "number" ? valeur : 0);

export function superviser(options: OptionsSupervision): Supervise {
  const { plafonds } = options;
  const debut = performance.now();
  const ecoule = () => Math.round(performance.now() - debut);

  // `detached` : le cook est chef de son propre groupe de process, et un
  // signal envoyé au groupe atteint aussi ce qu'il a lancé.
  const enfant = spawn(options.commande, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fichiers = [createWriteStream(options.flux, { flags: "a" }), createWriteStream(`${options.flux}.stderr`, { flags: "a" })] as const;
  // Un flux brut qui ne peut pas s'écrire (disque plein, runs/ supprimé) ne
  // doit ni tuer le runtime ni désarmer les garde-fous : rien de ce qui sert à
  // l'état n'y vit. D'où l'écouteur plutôt que `pipe`, qui mettrait le tube en
  // pause à la première erreur du fichier — plafonds aveugles, cook bloqué.
  //
  // Le fichier s'écrit masqué — les secrets du projet par leur valeur, les
  // identifiants de Claude par leur forme —, donc ligne à ligne : une valeur
  // coupée entre deux morceaux du tube ne lui échappe pas. Ce qui n'a pas
  // encore son saut de ligne attend le suivant, la fin, ou d'avoir rempli
  // `attenteMax`. Tout ce que le runtime garde ou publie d'un cook se relit
  // dans ce fichier : rien n'en sort qui n'y soit déjà masqué.
  let masques = 0;
  const masquer = (texte: string) => {
    const lu = masquerIdentifiants(options.masquer?.(texte) ?? texte);
    masques += lu.masques;
    return lu.texte;
  };
  // Rend de quoi finir le fichier : ce qui attendait encore y est écrit.
  const garder = (tube: Readable, fichier: WriteStream) => {
    fichier.on("error", () => {});
    const lignes = lignesMasquees(
      masquer,
      (texte) => {
        if (fichier.writable) fichier.write(texte);
      },
      options.attenteMax,
    );
    const finir = () => {
      lignes.vider();
      fichier.end();
    };
    tube.on("data", (morceau: Buffer) => lignes.recevoir(morceau));
    tube.on("end", finir);
    return finir;
  };
  const finir = [garder(enfant.stdout, fichiers[0]), garder(enfant.stderr, fichiers[1])];

  let mort = false;
  const signaler = (signal: NodeJS.Signals) => {
    if (enfant.pid === undefined) return;
    try {
      process.kill(-enfant.pid, signal);
    } catch {
      // Le groupe n'existe plus : il n'y a plus personne à arrêter.
    }
  };

  let arret: Arret | null = null;
  let grace: NodeJS.Timeout | undefined;
  const arreter = (motif: Arret) => {
    if (arret || mort) return;
    arret = motif;
    try {
      options.surArret?.(motif);
    } catch {
      // Le motif n'a pas pu être noté : le cook est arrêté quand même, c'est
      // le garde-fou qui prime.
    } finally {
      signaler("SIGTERM");
      grace = setTimeout(() => signaler("SIGKILL"), options.graceMs);
    }
  };

  // Un tour = un message de l'assistant. `claude` livre un même message en
  // plusieurs lignes (une par bloc de contenu) qui répètent son usage : on le
  // reconnaît à son identifiant, et seul son dernier usage compte.
  let turns = 0;
  let tokens = 0;
  const usages = new Map<string, number>();
  const compter = (ligne: string) => {
    let evenement;
    try {
      evenement = JSON.parse(ligne);
    } catch {
      return;
    }
    if (evenement?.type !== "assistant") return;
    const message = evenement.message ?? {};
    const id = typeof message.id === "string" ? message.id : `sans-id-${usages.size}`;
    // Les lectures de cache ne comptent pas : elles gonflent le total d'un
    // ordre de grandeur sans refléter le travail du cook.
    const usage = nombre(message.usage?.input_tokens) + nombre(message.usage?.output_tokens) + nombre(message.usage?.cache_creation_input_tokens);
    if (!usages.has(id)) turns += 1;
    tokens += usage - (usages.get(id) ?? 0);
    usages.set(id, usage);
  };

  const duree = setTimeout(
    () => arreter({ reason: "duration", limit: plafonds.durationMs, observed: ecoule() }),
    plafonds.durationMs,
  );
  let inactivite: NodeJS.Timeout | undefined;
  const veiller = () => {
    clearTimeout(inactivite);
    const depuis = performance.now();
    inactivite = setTimeout(
      () => arreter({ reason: "idle", limit: plafonds.idleMs, observed: Math.round(performance.now() - depuis) }),
      plafonds.idleMs,
    );
  };
  veiller();

  const lignes = createInterface({ input: enfant.stdout });
  let fluxLu = false;
  lignes.once("close", () => {
    fluxLu = true;
  });
  lignes.on("line", (ligne) => {
    veiller();
    compter(ligne);
    if (turns > plafonds.turns) arreter({ reason: "turns", limit: plafonds.turns, observed: turns });
    else if (tokens > plafonds.tokens) arreter({ reason: "tokens", limit: plafonds.tokens, observed: tokens });
  });

  const fin = new Promise<Fin>((resoudre) => {
    const conclure = (code: number | null, signal: string | null, erreur: string | null) => {
      if (mort) return;
      mort = true;
      clearTimeout(duree);
      clearTimeout(inactivite);
      clearTimeout(grace);
      // Rien ne survit à son cook : ce qui reste du groupe (un petit-enfant
      // sourd à SIGTERM, un serveur laissé en fond) est tué maintenant. Après
      // ce point, plus aucun signal ne part — le numéro du groupe peut être
      // réattribué à un inconnu.
      signaler("SIGKILL");

      // La fin n'est rendue qu'une fois le flux lu jusqu'au bout et écrit.
      let attendus = 3;
      let filet: NodeJS.Timeout | undefined;
      const rendre = () => {
        clearTimeout(filet);
        resoudre({ code, signal, turns, tokens, durationMs: ecoule(), arret, erreur, ...(masques === 0 ? {} : { masques }) });
      };
      const unDeMoins = () => {
        attendus -= 1;
        if (attendus === 0) rendre();
      };
      // Un process échappé du groupe peut garder les tubes ouverts : on ne
      // l'attend pas indéfiniment. Les tubes ne finiront pas ; ce qu'ils ont
      // livré, si — une dernière ligne sans saut de ligne comprise —, et la
      // fin attend encore que les fichiers l'aient écrit.
      filet = setTimeout(() => {
        enfant.stdout.destroy();
        enfant.stderr.destroy();
        lignes.close();
        for (const fichier of finir) fichier();
      }, options.graceMs);
      if (fluxLu) unDeMoins();
      else lignes.once("close", unDeMoins);
      for (const fichier of fichiers) {
        if (fichier.closed) unDeMoins();
        else fichier.once("close", unDeMoins);
      }
    };
    enfant.once("error", (erreur) => conclure(null, null, erreur.message));
    enfant.once("exit", (code, signal) => conclure(code, signal, null));
  });

  return {
    pid: enfant.pid,
    mesure: () => ({ turns, tokens }),
    arreter: (motif = { reason: "stop", limit: null, observed: null }) => arreter(motif),
    abandonner() {
      if (!mort) signaler("SIGKILL");
    },
    fin,
  };
}
