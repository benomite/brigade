// Surveille un sous-processus — un cook — et l'arrête s'il dépasse ses
// plafonds, s'il se tait trop longtemps, ou si on le lui demande. Mécanique
// pure : aucun journal ici, et rien qui soit propre à `claude` au-delà de la
// forme de son flux.
import { spawn } from "./sans-invite.ts";
import { closeSync, createWriteStream, openSync, readFileSync, readSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { lecteurDActivite, type Activite } from "./activite.ts";
import type { Readable } from "node:stream";
import type { MotifArret, Plafonds } from "./events/guardrails.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import { lignesMasquees } from "./lignes-masquees.ts";
import { ecrireAtomique, type ConsigneDuRelais, type FinDuRelais } from "./relais.ts";

export type Arret = { reason: MotifArret; limit: number | null; observed: number | null };

// Ce qu'un cook a consommé qui se compte : ses tours et ses jetons. Rend le
// plafond qu'il dépasse, ou null. Le même jugement pour tous les cooks — celui
// que le superviseur lit dans son flux, celui dont une station distante
// rapporte la mesure.
export function depassement(plafonds: Plafonds, mesure: { turns: number; tokens: number }): Arret | null {
  if (mesure.turns > plafonds.turns) return { reason: "turns", limit: plafonds.turns, observed: mesure.turns };
  if (mesure.tokens > plafonds.tokens) return { reason: "tokens", limit: plafonds.tokens, observed: mesure.tokens };
  return null;
}

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
  // Ce que le cook fait en ce moment, d'après son flux — absent quand celui
  // qui le surveille ne le lit pas.
  activite?(): Activite | null;
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

  // Ce qu'il fait se lit dans ce qu'il dit, et sort masqué comme le flux.
  const lecteur = lecteurDActivite({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    masquer: (texte) => masquerIdentifiants(options.masquer?.(texte) ?? texte).texte,
  });

  const lignes = createInterface({ input: enfant.stdout });
  let fluxLu = false;
  lignes.once("close", () => {
    fluxLu = true;
  });
  lignes.on("line", (ligne) => {
    veiller();
    compter(ligne);
    lecteur.lire(ligne);
    const depasse = depassement(plafonds, { turns, tokens });
    if (depasse) arreter(depasse);
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
    activite: () => lecteur.activite(),
    arreter: (motif = { reason: "stop", limit: null, observed: null }) => arreter(motif),
    abandonner() {
      if (!mort) signaler("SIGKILL");
    },
    fin,
  };
}

// --- Le cook porté par un relais : il survit au runtime ----------------------
//
// Le relais (`relais.ts`) lance le cook, écrit son flux brut masqué, l'arrête
// quand on le lui demande et écrit sa fin. Le runtime ne tient plus le cook :
// il lit ces fichiers. S'il s'en va, le cook continue ; le runtime qui démarre
// après lui reprend la lecture au début du flux — les tours et les jetons se
// recomptent — et le suit comme le sien.

// Où vivent les fichiers d'un cook relayé, à côté de son flux brut.
export type FichiersDuRelais = {
  flux: string;
  // Le pid du relais et l'heure du lancement, écrits par le runtime qui l'a lancé.
  relais: string;
  // Le pid du cook, écrit par le relais.
  pid: string;
  // La fin du cook, écrite par le relais.
  fin: string;
};

export const fichiersDuRelais = (flux: string): FichiersDuRelais => {
  const racine = flux.replace(/\.jsonl$/, "");
  return { flux, relais: `${racine}.relais.json`, pid: `${racine}.cook.pid`, fin: `${racine}.fin.json` };
};

// Ce que le runtime qui lance le relais écrit de lui.
export type TraceDuRelais = { pid: number; debut: number; run: string };

export function lireTrace(fichiers: FichiersDuRelais): TraceDuRelais | null {
  try {
    const lue = JSON.parse(readFileSync(fichiers.relais, "utf8")) as Partial<TraceDuRelais>;
    if (!Number.isSafeInteger(lue.pid) || !Number.isFinite(lue.debut) || typeof lue.run !== "string") return null;
    return lue as TraceDuRelais;
  } catch {
    return null;
  }
}

export function lireFinDuRelais(fichiers: FichiersDuRelais): FinDuRelais | null {
  try {
    return JSON.parse(readFileSync(fichiers.fin, "utf8")) as FinDuRelais;
  } catch {
    return null;
  }
}

// Le relais de ce run vit-il encore ? Un pid peut avoir été rendu puis repris
// par un autre process : là où le système dit la ligne de commande d'un pid,
// elle doit nommer ce run.
export function relaisVivant(trace: TraceDuRelais): boolean {
  try {
    process.kill(trace.pid, 0);
  } catch {
    // Mort, ou EPERM : le pid vit, mais n'est plus à nous — ce n'est pas
    // notre relais.
    return false;
  }
  try {
    return readFileSync(`/proc/${trace.pid}/cmdline`, "utf8").split("\0").includes(trace.run);
  } catch {
    // Pas de /proc (macOS) : le pid vivant fait foi.
    return true;
  }
}

const RELAIS = join(import.meta.dirname, "relais.ts");
// Le flux d'un cook relayé est relu à cette cadence.
const LECTURE_MS = 50;

export type OptionsRelais = Omit<OptionsSupervision, "masquer"> & {
  run: string;
  // Les secrets que le cook reçoit, par nom : le relais masque leurs valeurs.
  secrets: Record<string, string>;
};

// Lance un cook par un relais. Le runtime écrit la trace du relais avant de
// rendre la main : un runtime qui meurt juste après la laisse au suivant.
export function superviserParRelais(options: OptionsRelais): Supervise & { lacher(): void } {
  const fichiers = fichiersDuRelais(options.flux);
  const debut = Date.now();
  const relais = spawn(process.execPath, [RELAIS, options.run], {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
    // Celui du runtime : le relais ne lit rien de son environnement, et le
    // cook reçoit le sien par la consigne.
    env: process.env,
  });
  relais.stdin?.on("error", () => {});
  const consigne: ConsigneDuRelais = {
    commande: options.commande,
    args: options.args,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: options.env ?? process.env,
    flux: options.flux,
    pid: fichiers.pid,
    fin: fichiers.fin,
    secrets: options.secrets,
    graceMs: options.graceMs,
    ...(options.attenteMax === undefined ? {} : { attenteMax: options.attenteMax }),
  };
  relais.stdin?.end(`${JSON.stringify(consigne)}\n`);
  if (relais.pid !== undefined) ecrireAtomique(fichiers.relais, JSON.stringify({ pid: relais.pid, debut, run: options.run } satisfies TraceDuRelais));
  // Le runtime n'attend pas son relais pour s'en aller.
  relais.unref();
  let sorti = false;
  const suivi = suivre(options, fichiers, { pid: relais.pid ?? null, debut, sorti: () => sorti });
  relais.once("exit", () => {
    sorti = true;
    suivi.regarder();
  });
  relais.once("error", () => {
    sorti = true;
    suivi.regarder();
  });
  return suivi;
}

// Un cook relayé peut-il être suivi : son relais a laissé sa trace, et il vit
// encore ou a écrit la fin du cook.
export function relaisASuivre(flux: string): boolean {
  const fichiers = fichiersDuRelais(flux);
  const trace = lireTrace(fichiers);
  return trace !== null && (lireFinDuRelais(fichiers) !== null || relaisVivant(trace));
}

// Demande au relais d'un cook d'arrêter celui-ci, sans le suivre : il
// transmet, et tue passé la grâce.
export function arreterParLeRelais(flux: string): void {
  const trace = lireTrace(fichiersDuRelais(flux));
  if (trace === null || !relaisVivant(trace)) return;
  try {
    process.kill(trace.pid, "SIGTERM");
  } catch {
    // Parti entre-temps.
  }
}

// Reprend le suivi d'un cook qu'un runtime précédent a lancé par un relais.
// Rend null si rien ne permet de le suivre : ni relais vivant, ni fin écrite.
export function suivreLeRelais(options: Pick<OptionsRelais, "plafonds" | "graceMs" | "flux" | "surArret">): (Supervise & { lacher(): void }) | null {
  const fichiers = fichiersDuRelais(options.flux);
  const trace = lireTrace(fichiers);
  if (trace === null || !relaisASuivre(options.flux)) return null;
  return suivre(options, fichiers, { pid: trace.pid, debut: trace.debut, sorti: () => !relaisVivant(trace) });
}

// Le suivi d'un cook relayé, qu'il vienne d'être lancé ou qu'il soit repris :
// le flux se lit depuis son début, les plafonds se jugent comme pour un cook
// tenu, et la fin est celle que le relais écrit. Un relais mort sans l'avoir
// écrite — tué avec son cook — rend une fin par signal.
function suivre(
  options: Pick<OptionsRelais, "plafonds" | "graceMs" | "surArret">,
  fichiers: FichiersDuRelais,
  relais: { pid: number | null; debut: number; sorti: () => boolean },
): Supervise & { lacher(): void; regarder(): void } {
  const { plafonds } = options;
  const ecoule = () => Math.max(0, Date.now() - relais.debut);
  let mort = false;
  let lache = false;

  let arret: Arret | null = null;
  const signalerAuRelais = () => {
    if (mort || relais.pid === null) return;
    try {
      process.kill(relais.pid, "SIGTERM");
    } catch {
      // Le relais n'est plus là : sa fin dira la suite.
    }
  };
  const arreter = (motif: Arret) => {
    if (arret || mort || lache) return;
    arret = motif;
    try {
      options.surArret?.(motif);
    } catch {
      // Le motif n'a pas pu être noté : le cook est arrêté quand même.
    } finally {
      signalerAuRelais();
    }
  };

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
    const usage = nombre(message.usage?.input_tokens) + nombre(message.usage?.output_tokens) + nombre(message.usage?.cache_creation_input_tokens);
    if (!usages.has(id)) turns += 1;
    tokens += usage - (usages.get(id) ?? 0);
    usages.set(id, usage);
  };
  // Le flux est déjà masqué : le lecteur n'a rien de plus à cacher.
  const lecteur = lecteurDActivite();

  // La durée court depuis le lancement, pas depuis la reprise : un cook repris
  // n'a pas un plafond neuf.
  const duree = setTimeout(() => arreter({ reason: "duration", limit: plafonds.durationMs, observed: ecoule() }), Math.max(0, plafonds.durationMs - ecoule()));
  let inactivite: NodeJS.Timeout | undefined;
  const veiller = () => {
    clearTimeout(inactivite);
    const depuis = performance.now();
    inactivite = setTimeout(() => arreter({ reason: "idle", limit: plafonds.idleMs, observed: Math.round(performance.now() - depuis) }), plafonds.idleMs);
  };
  veiller();

  // Ce qui a déjà été lu du flux, et la ligne commencée qui attend sa fin.
  let lu = 0;
  let reste = "";
  const decodeur = new TextDecoder();
  const traiter = (ligne: string) => {
    veiller();
    compter(ligne);
    lecteur.lire(ligne);
    const depasse = depassement(plafonds, { turns, tokens });
    if (depasse) arreter(depasse);
  };
  const lire = (jusquAuBout: boolean) => {
    let descripteur: number;
    try {
      descripteur = openSync(fichiers.flux, "r");
    } catch {
      return;
    }
    try {
      const tampon = Buffer.alloc(1 << 16);
      for (;;) {
        const n = readSync(descripteur, tampon, 0, tampon.length, lu);
        if (n === 0) break;
        lu += n;
        reste += decodeur.decode(tampon.subarray(0, n), { stream: true });
        const lignes = reste.split("\n");
        reste = lignes.pop() ?? "";
        for (const ligne of lignes) traiter(ligne);
      }
    } finally {
      closeSync(descripteur);
    }
    if (jusquAuBout && reste !== "") {
      traiter(reste);
      reste = "";
    }
  };

  let resoudre: (fin: Fin) => void = () => {};
  const fin = new Promise<Fin>((r) => {
    resoudre = r;
  });
  const conclure = (lue: Pick<Fin, "code" | "signal" | "erreur"> & { masques?: number }) => {
    if (mort || lache) return;
    lire(true);
    mort = true;
    clearTimeout(duree);
    clearTimeout(inactivite);
    clearInterval(lecture);
    resoudre({
      code: lue.code,
      signal: lue.signal,
      turns,
      tokens,
      durationMs: ecoule(),
      arret,
      erreur: lue.erreur,
      ...(lue.masques ? { masques: lue.masques } : {}),
    });
  };
  const regarder = () => {
    if (mort || lache) return;
    lire(false);
    const ecrite = lireFinDuRelais(fichiers);
    if (ecrite) return conclure(ecrite);
    if (!relais.sorti()) return;
    // Le relais est mort sans écrire de fin — tué avec son cook. Ce qui
    // resterait du groupe du cook part avec lui.
    if (lireFinDuRelais(fichiers)) return regarder();
    try {
      const pid = Number(readFileSync(fichiers.pid, "utf8"));
      if (Number.isSafeInteger(pid) && pid > 0) process.kill(-pid, "SIGKILL");
    } catch {
      // Pas de cook connu, ou plus de groupe.
    }
    conclure({ code: null, signal: "SIGKILL", erreur: null });
  };
  const lecture = setInterval(regarder, LECTURE_MS);
  regarder();

  return {
    pid: relais.pid ?? undefined,
    mesure: () => ({ turns, tokens }),
    activite: () => lecteur.activite(),
    arreter: (motif = { reason: "stop", limit: null, observed: null }) => arreter(motif),
    // Le runtime s'en va : un cook relayé ne meurt pas avec lui. Le suivi
    // s'arrête, rien n'est signalé, et la fin rendue n'est qu'un « interrompu
    // ici » — le runtime suivant la lira pour de vrai.
    abandonner: () => {},
    lacher() {
      if (mort || lache) return;
      lache = true;
      clearTimeout(duree);
      clearTimeout(inactivite);
      clearInterval(lecture);
      resoudre({ code: null, signal: null, turns, tokens, durationMs: ecoule(), arret, erreur: null });
    },
    regarder,
    fin,
  };
}
