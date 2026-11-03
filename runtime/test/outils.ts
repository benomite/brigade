// Outils communs aux tests. Aucun test ne lit BRIGADE_STATE_DIR : chacun crée
// son répertoire d'état temporaire, détruit à la fin du test.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { Sortie, type Appel, type Commande } from "../src/appel.ts";
import { signalerLArbre } from "../src/arbre.ts";
import type { Fait } from "../src/evenements.ts";
import { DECISIONS } from "../src/decisions.ts";
import { masquerIdentifiants } from "../src/identifiants.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "../src/journal.ts";
import type { Projection } from "../src/projection.ts";

// La doublure de `claude` : son scénario se choisit par la variable FAUX_CLAUDE.
export const FAUX_CLAUDE = join(import.meta.dirname, "aides/faux-claude.sh");

// À donner en `NODE_OPTIONS: \`--import=${SANS_RESEAU}\`` à un process lancé par
// un test : toute connexion HTTP qu'il ouvre y est refusée, sans toucher un port.
export const SANS_RESEAU = pathToFileURL(join(import.meta.dirname, "aides/sans-reseau.ts")).href;

// La doublure de `bwrap` : ne cloisonne rien, note ce qu'on lui a demandé.
export const FAUX_BWRAP = join(import.meta.dirname, "aides/faux-bwrap.sh");

// Les arguments de chaque lancement que la doublure de `bwrap` a noté dans le
// répertoire FAUX_BWRAP_TEMOIN, sans ordre.
export function lancementsDuFauxBwrap(temoin: string): string[][] {
  return readdirSync(temoin).map((nom) => readFileSync(join(temoin, nom), "utf8").split("\0").slice(0, -1));
}

export type LancementDuFauxClaude = { args: string[]; cwd: string; env: Record<string, string> };

// Les lancements de la doublure qu'un répertoire FAUX_CLAUDE_TEMOIN a notés,
// dans l'ordre. Un nom en cours d'inscription n'en est pas encore un.
export function lancementsDuFauxClaude(temoin: string): LancementDuFauxClaude[] {
  const ordre = join(temoin, "ordre");
  if (!existsSync(ordre)) return [];
  const noms = readFileSync(ordre, "utf8").split("\n").slice(0, -1);
  return noms.map((nom) => {
    // Le répertoire, le nombre d'arguments, les arguments, puis l'environnement
    // — un nom, une valeur —, chacun terminé par un octet nul.
    const [cwd = "", nombre = "0", ...suite] = readFileSync(join(temoin, nom), "utf8").split("\0").slice(0, -1);
    const variables = suite.slice(Number(nombre));
    const env: Record<string, string> = {};
    for (let i = 0; i < variables.length; i += 2) env[variables[i] ?? ""] = variables[i + 1] ?? "";
    return { args: suite.slice(0, Number(nombre)), cwd, env };
  });
}

// Le cache de compilation de Node, quand la suite en a un. Tout process Node
// qu'un test lance doit le recevoir, même dans un environnement fait de rien :
// sans lui, chaque process d'essai repaie la lecture de tout son TypeScript —
// une demi-seconde de processeur par commande du runtime, trois fois ce qu'elle
// coûte avec.
export const CACHE_DE_COMPILATION: Record<string, string> = process.env.NODE_COMPILE_CACHE ? { NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE } : {};

// Le proxy de l'environnement, que la porte d'un projet pose à ses cooks — et
// donc à leurs gates (`reseau.ts`) : chaque process Node qui hérite de
// `NODE_USE_ENV_PROXY` charge tout le client HTTP de Node avant sa première
// ligne, cinquante millisecondes de processeur pour rien. Aucun test ne sort
// sur le réseau : les process que le runtime lance depuis le test (relais,
// gates, commandes) n'en héritent pas. Un test qui éprouve le proxy le pose
// lui-même.
delete process.env.NODE_USE_ENV_PROXY;

// Sous Windows, ce sans quoi un process ne démarre pas toujours — `SystemRoot`,
// où vivent les bibliothèques du système — ni n'a de répertoire temporaire.
// Rien du compte : ni son répertoire, ni sa configuration.
const DE_WINDOWS = ["SystemRoot", "windir", "SystemDrive", "ComSpec", "PATHEXT", "TEMP", "TMP"];
const ENV_DE_WINDOWS: Record<string, string> =
  process.platform === "win32" ? Object.fromEntries(DE_WINDOWS.flatMap((nom) => (process.env[nom] === undefined ? [] : [[nom, process.env[nom] as string]]))) : {};

// L'environnement minimal d'un process lancé par un test : rien du shell du
// dev n'y passe, sauf le cache de compilation de Node — et, sous Windows, ce
// sans quoi un process n'y démarre pas.
export const ENV_ENFANT: Record<string, string> = {
  ...ENV_DE_WINDOWS,
  PATH: process.env.PATH ?? "",
  ...CACHE_DE_COMPILATION,
  // Le tour des gates est celui de la box : un test qui les joue ne doit pas
  // faire la queue derrière les gates réelles d'un autre worktree, ni derrière
  // ses voisins. Les tests du tour posent leur propre verrou.
  BRIGADE_GATES_VERROU: "aucun",
};

// La fin d'un test : ce qui doit être arrêté l'est avant que les répertoires
// disparaissent, quel que soit l'ordre dans lequel le test les a demandés — un
// process encore vivant y réécrirait et les ferait renaître.
const fins = new WeakMap<TestContext, { arrets: Array<() => unknown>; repertoires: string[] }>();

function finDe(t: TestContext) {
  let fin = fins.get(t);
  if (fin === undefined) {
    const courante: { arrets: Array<() => unknown>; repertoires: string[] } = { arrets: [], repertoires: [] };
    fin = courante;
    fins.set(t, courante);
    t.after(async () => {
      for (const arreter of courante.arrets) await arreter();
      // La suppression passe après les crochets de fin que le test a posés
      // lui-même — un `t.after(() => journal.fermer())` écrit après
      // `repertoireTemporaire` : sous Windows, un fichier encore ouvert ne
      // s'efface pas (EPERM). Un crochet posé pendant les crochets de fin
      // passe après eux.
      t.after(async () => {
        // Un cook qu'on vient de tuer peut encore finir d'écrire son flux : la
        // suppression se reprend (jusqu'à cinq secondes : sous Windows, un process tué
        // tient ses fichiers un moment, EPERM) au lieu d'échouer sur un répertoire redevenu plein —
        // un crochet de fin qui échoue ferait sauter les suivants. Elle se reprend sans
        // bloquer : `rmSync` attend ses reprises en tenant le process, et les tests du
        // fichier qui tournent à côté voient leur horloge filer sans pouvoir rien observer.
        for (const repertoire of courante.repertoires) await rm(repertoire, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
      });
    });
  }
  return fin;
}

// Enregistre ce qui doit être arrêté à la fin du test, avant la suppression de ses répertoires.
export function aArreter(t: TestContext, arreter: () => unknown): void {
  finDe(t).arrets.push(arreter);
}

// Les cooks relayés d'un répertoire d'état survivent au runtime qui les a
// lancés : la fin du test les tue, relais et groupe du cook, par leurs pids.
// Sous Windows, l'arbre d'un cook se lit par PowerShell, deux fois au moins
// par cook : lu sans attendre, il tiendrait le process du fichier plusieurs
// secondes par cook, et les tests qui tournent à côté verraient leurs
// `jusqua` expirer sans avoir rien pu observer.
export async function tuerLesRelais(repertoire: string): Promise<void> {
  const runs = join(repertoire, "runs");
  if (!existsSync(runs)) return;
  const tuer = (pid: number) => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Déjà parti.
    }
  };
  for (const fichier of readdirSync(runs)) {
    if (!fichier.endsWith(".relais.json")) continue;
    const racine = join(runs, fichier.slice(0, -".relais.json".length));
    // Sa fin écrite, le relais a déjà tué le groupe de son cook : son numéro
    // peut être celui d'un autre.
    if (existsSync(`${racine}.fin.json`)) continue;
    try {
      const relais = Number(JSON.parse(readFileSync(`${racine}.relais.json`, "utf8")).pid);
      if (!vivant(relais)) continue;
      // Le relais d'abord : tué après son cook, il aurait le temps de le voir
      // mourir et d'écrire sa fin — le runtime suivant reprendrait alors un
      // cook fini au lieu de noter son interruption.
      tuer(relais);
      // Sa fin écrite juste avant sa mort, le groupe du cook est déjà tué.
      if (existsSync(`${racine}.fin.json`)) continue;
      // Tout l'arbre du cook : son groupe, ou sous Windows ce que la table des process en dit.
      if (existsSync(`${racine}.cook.pid`)) await signalerLArbre(Number(readFileSync(`${racine}.cook.pid`, "utf8")), "SIGKILL");
    } catch {
      // Un fichier illisible : rien à tuer.
    }
  }
}

// La suite de scénarios d'une doublure de `claude` (FAUX_CLAUDE_SUITE), neuve :
// aucune de ses lignes n'est prise.
export function ecrireSuite(fichier: string, scenarios: string[]): void {
  rmSync(`${fichier}.prises`, { recursive: true, force: true });
  mkdirSync(`${fichier}.prises`);
  writeFileSync(fichier, scenarios.join("\n"));
}

// Ce qu'un fichier de tests garde pour tous ses tests — un gabarit, un clone —
// ne part qu'avec son process.
const gardes: Array<() => void> = [];
const lacher = () => {
  for (const jeter of gardes.splice(0)) jeter();
};
process.on("exit", lacher);

// Un répertoire que tous les tests du fichier se partagent. `oublier` : ce que
// le fichier doit oublier de lui une fois qu'il n'existe plus.
export function repertoireDuFichier(prefixe: string, oublier: () => void = () => {}): string {
  const repertoire = mkdtempSync(join(tmpdir(), prefixe));
  gardes.push(() => {
    rmSync(repertoire, { recursive: true, force: true });
    oublier();
  });
  return repertoire;
}

// Donne au fichier de tests un répertoire temporaire à lui, et rend de quoi
// vérifier qu'il n'y laisse rien : la suite est rejouée à chaque arrêt, et ce
// qu'elle y sème s'y accumule. À appeler avant le premier test ; la vérification
// est le dernier test du fichier — elle lâche d'abord ce que le fichier gardait
// pour tous.
export function temporaireDuFichier(): () => void {
  const prive = mkdtempSync(join(tmpdir(), "brigade-test-propre-"));
  process.env.TMPDIR = prive;
  process.on("exit", () => rmSync(prive, { recursive: true, force: true }));
  return () => {
    lacher();
    assert.deepEqual(readdirSync(prive), []);
  };
}

export function repertoireTemporaire(t: TestContext): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-"));
  finDe(t).repertoires.push(repertoire);
  return repertoire;
}

// Un fait d'un domaine que le runtime ne connaît pas encore (rail, pass…) : le
// journal doit le porter sans le comprendre.
export function faitInconnu(type: string, payload: Record<string, unknown> = {}): Fait {
  return { type, payload } as unknown as Fait;
}

// Le jour que lit un test qui compare une valeur écrite par le runtime : la même
// constante que l'horloge, pour que changer l'un ne casse pas l'autre.
export const JOUR_HORLOGE = "2026-10-08";

// Le jour de l'horloge décalé de quelques jours (négatif : avant), au format AAAA-MM-JJ.
export function jourDecale(jours: number): string {
  return new Date(Date.parse(JOUR_HORLOGE) + jours * 86_400_000).toISOString().slice(0, 10);
}

// Horloge qui avance d'une seconde à chaque lecture, pour des horodatages
// distincts et prévisibles.
export function horloge(depart = `${JOUR_HORLOGE}T10:00:00.000Z`): () => Date {
  let instant = Date.parse(depart);
  return () => {
    const date = new Date(instant);
    instant += 1000;
    return date;
  };
}

// L'état complet des projections : le contenu de chacune de leurs tables.
export function photographier(journal: Journal, projections: Projection[]): Record<string, unknown[]> {
  const photo: Record<string, unknown[]> = {};
  for (const projection of projections) {
    for (const table of projection.tables) {
      photo[`${projection.nom}/${table}`] = journal.base.lire(`SELECT * FROM ${table} ORDER BY rowid`);
    }
  }
  return photo;
}

export type Enfant = {
  process: ChildProcess;
  sortie: () => string;
  // Résout dès que la sortie (stdout + stderr) contient `texte`.
  attendre: (texte: string) => Promise<void>;
  // Résout à la mort du process, avec son code de sortie (null s'il est mort d'un signal).
  fin: Promise<number | null>;
};

// Un journal neuf, schéma posé, sans un événement : fabriqué une fois par
// process, puis copié là où un test en veut un — poser tout le schéma à chaque
// lancement coûte deux fois plus que d'ouvrir celui-ci.
let octetsDuJournalVide: Buffer | undefined;
function journalVide(): Buffer {
  if (octetsDuJournalVide === undefined) {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-journal-vide-"));
    try {
      ouvrirJournal(repertoire).fermer();
      octetsDuJournalVide = readFileSync(cheminJournal(repertoire));
    } finally {
      rmSync(repertoire, { recursive: true, force: true });
    }
  }
  return octetsDuJournalVide;
}

// Pose ce journal vide dans un répertoire d'état qui n'en a pas encore : ce
// qu'un runtime qui démarre y trouve alors, c'est le schéma qu'il aurait posé.
export function poserJournalVide(repertoire: string): void {
  if (!existsSync(cheminJournal(repertoire))) writeFileSync(cheminJournal(repertoire), journalVide());
}

// Les décisions du chef n'ont plus que le journal pour support : ce qu'un test
// donne par variable à un runtime, le chef l'a posé au journal avant son
// démarrage — tel quel, valeur illisible comprise, que le runtime refusera.
// Ce que le journal porte déjà n'est pas écrasé, et la variable reste alors à
// l'environnement : le runtime l'ignore et le dit.
// `BRIGADE_TEST_SANS_DECISIONS=1` laisse les variables où elles sont.
// Un runtime démarré dans le process du test y passe aussi.
export function decisionsAuJournal(fichier: string, env: Record<string, string>): Record<string, string> {
  const { BRIGADE_TEST_SANS_DECISIONS: sans, ...reste } = env;
  const decisions = DECISIONS.filter((nom) => (reste[nom] ?? "") !== "");
  const etat = reste.BRIGADE_STATE_DIR;
  if (sans === "1" || !fichier.endsWith("main.ts") || decisions.length === 0 || !etat || !existsSync(etat)) return reste;
  poserJournalVide(etat);
  const journal = ouvrirJournal(etat);
  try {
    const posees = new Set(journal.tout().filter((e) => e.type === "decision.set").map((e) => String(e.payload.name)));
    for (const nom of decisions) {
      if (posees.has(nom)) continue;
      journal.ajouter({ project: reste.BRIGADE_PROJECT ?? "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name: nom, value: reste[nom] ?? "", previous: null } });
      delete reste[nom];
    }
  } finally {
    journal.fermer();
  }
  return reste;
}

// Ce que le runtime n'a rien écrit : un journal absent, ou qui ne porte que les
// décisions du chef.
export function rienEcritParLeRuntime(repertoire: string): boolean {
  if (!existsSync(join(repertoire, "log.db"))) return true;
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  try {
    return journal.tout().every((e) => e.type === "decision.set");
  } finally {
    journal.fermer();
  }
}

// Lance un fichier TypeScript dans un vrai process Node, tué à la fin du test
// s'il vit encore. L'environnement est celui qu'on lui donne, plus ENV_ENFANT :
// un BRIGADE_STATE_DIR posé dans le shell du dev ne lui parvient jamais.
export function lancer(t: TestContext, fichier: string, args: string[] = [], env: Record<string, string> = {}): Enfant {
  const enfant = spawn(process.execPath, [fichier, ...args], {
    env: { ...ENV_ENFANT, ...decisionsAuJournal(fichier, env) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let sortie = "";
  const attentes: Array<() => void> = [];
  const noter = (morceau: Buffer) => {
    sortie += morceau.toString();
    for (const verifier of attentes) verifier();
  };
  enfant.stdout.on("data", noter);
  enfant.stderr.on("data", noter);
  const fin = new Promise<number | null>((resoudre) => enfant.on("close", (code) => resoudre(code)));
  aArreter(t, async () => {
    enfant.kill("SIGKILL");
    await fin;
  });
  return {
    process: enfant,
    sortie: () => sortie,
    fin,
    attendre: (texte) =>
      new Promise<void>((resoudre, rejeter) => {
        const verifier = () => {
          if (sortie.includes(texte)) resoudre();
        };
        attentes.push(verifier);
        verifier();
        void fin.then(() => {
          if (!sortie.includes(texte)) rejeter(new Error(`process terminé sans « ${texte} » : ${sortie}`));
        });
      }),
  };
}

// Joue une commande du chef dans le process du test : les arguments et
// l'environnement qu'on lui donne, les lignes et le code qu'elle rendrait à son
// propre process — sans le Node qui démarre, trente millisecondes de processeur
// à chaque fois. Ce qui tient au process lui-même (le lancement par son fichier,
// un signal, un voisin qui tient le journal) se prouve avec `lancer`.
export function appeler(commande: Commande, args: string[] = [], env: Record<string, string> = {}): Pick<Enfant, "sortie"> & { fin: Promise<number> } {
  let sortie = "";
  const ecrire = (ligne: string) => void (sortie += `${ligne}\n`);
  const jouer = async () => {
    try {
      await commande({ args, env, dire: ecrire, redire: ecrire });
      return 0;
    } catch (erreur) {
      if (erreur instanceof Sortie) return erreur.code;
      throw erreur;
    }
  };
  return { sortie: () => sortie, fin: jouer() };
}

// Ce que les modules d'un runtime démarré dans le process du test disent sur
// la console, sans passer par son `dire`, revient à ce runtime : chaque
// démarrage a son contexte, dont héritent ses minuteries et ses process. La
// console n'est détournée qu'au premier démarrage.
const consoleDuRuntime = new AsyncLocalStorage<(ligne: string) => void>();
let consoleDetournee = false;
function detournerLaConsole(): void {
  if (consoleDetournee) return;
  consoleDetournee = true;
  for (const methode of ["log", "info", "warn", "error"] as const) {
    const ecrire = console[methode].bind(console);
    console[methode] = (...valeurs: unknown[]) => {
      const noter = consoleDuRuntime.getStore();
      if (noter) noter(format(...valeurs));
      else ecrire(...valeurs);
    };
  }
}

export type RuntimeIci = Pick<Enfant, "sortie" | "attendre"> & {
  // Ce que le process rendrait : le code de son refus de démarrer, sinon 0
  // une fois arrêté sans erreur, comme sur un signal.
  fin: Promise<number>;
  arreter: (signal: NodeJS.Signals) => void;
};

// Démarre le runtime dans le process du test — `demarrerLeRuntime`, que le
// test passe : ce fichier ne charge pas tout le runtime —, sur l'environnement
// qu'on lui donne plus ENV_ENFANT, les décisions posées au journal comme
// `lancer` les pose. Ses lignes sont masquées comme sa console masque celles du
// process. Démarré, il est arrêté à la fin du test. Sans le Node qui démarre,
// une demi-seconde de processeur à chaque fois ; ce qui tient au process (le
// démarrage par son fichier, la sortie du process, un vrai signal, un verrou
// qu'un autre tient) se prouve avec `lancer`.
export function demarrerIci(
  t: TestContext,
  demarrer: (appel: Omit<Appel, "args">) => { arreter(signal: NodeJS.Signals): void },
  env: Record<string, string> = {},
): RuntimeIci {
  detournerLaConsole();
  let sortie = "";
  const ecrire = (ligne: string) => void (sortie += `${masquerIdentifiants(ligne).texte}\n`);
  let demarre: { arreter(signal: NodeJS.Signals): void };
  try {
    demarre = consoleDuRuntime.run(ecrire, () => demarrer({ env: { ...ENV_ENFANT, ...decisionsAuJournal("main.ts", env) }, dire: ecrire, redire: ecrire }));
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    // Refusé, il ne dira plus rien.
    const attendre = async (texte: string) => {
      if (!sortie.includes(texte)) throw new Error(`refus de démarrer sans « ${texte} » : ${sortie}`);
    };
    return { sortie: () => sortie, attendre, fin: Promise.resolve(erreur.code), arreter: () => {} };
  }
  const { promise: fin, resolve: finir, reject: echouer } = Promise.withResolvers<number>();
  let arrete = false;
  const arreter = (signal: NodeJS.Signals) => {
    if (arrete) return;
    arrete = true;
    try {
      consoleDuRuntime.run(ecrire, () => demarre.arreter(signal));
      finir(0);
    } catch (erreur) {
      echouer(erreur);
    }
  };
  aArreter(t, async () => {
    arreter("SIGTERM");
    await fin;
  });
  return { sortie: () => sortie, attendre: (texte) => jusqua(() => sortie.includes(texte)), fin, arreter };
}

// Un port libre à l'instant où il est tiré — et rien de plus : sous Linux, un
// port fermé peut être redonné aussitôt à un voisin qui écoute sur le port 0.
async function portFermeALInstant(): Promise<number> {
  const [port = 0] = await portsFermesALInstant(1);
  return port;
}

// Plusieurs ports libres à l'instant où ils sont tirés, tous différents : ils
// sont tenus ensemble avant d'être fermés. Qui y lance un process doit savoir
// se rejouer si un voisin a repris l'un d'eux entre-temps.
export async function portsFermesALInstant(combien: number): Promise<number[]> {
  const libres = Array.from({ length: combien }, () => createServer());
  const ports = await Promise.all(libres.map((libre) => new Promise<number>((resoudre) => libre.listen(0, "127.0.0.1", () => resoudre((libre.address() as AddressInfo).port)))));
  await Promise.all(libres.map((libre) => new Promise((fini) => libre.close(fini))));
  return ports;
}

// Ce que dit un process lancé sur un port qu'un autre tient : le refus de
// l'arbitre, ou l'erreur du système telle que la porte la laisse remonter.
const PORT_PRIS = /EADDRINUSE|est déjà pris|is already taken/;

// Lance un process qui doit écouter sur un port posé par le chef — connu, donc,
// avant le lancement. Le port est tiré puis fermé ; s'il a été repris entre-temps,
// le process le dit en mourant, et un autre port est tiré. La reprise se compte
// en essais, pas en temps. Rend le process ouvert et le port qu'il tient.
export async function lancerSurPortPose(
  t: TestContext,
  fichier: string,
  options: {
    env: (port: number) => Record<string, string>;
    // Ce que le process écrit une fois à l'écoute sur ce port.
    ouvert: (port: number) => string;
    essais?: number;
    // Pour un test de cet outil : choisir les ports tirés.
    tirer?: (tirer: () => Promise<number>) => Promise<number>;
  },
): Promise<{ enfant: Enfant; port: number }> {
  const { essais = 5, tirer = (tirer) => tirer() } = options;
  for (let essai = 1; ; essai++) {
    const port = await tirer(portFermeALInstant);
    const enfant = lancer(t, fichier, [], options.env(port));
    try {
      await enfant.attendre(options.ouvert(port));
      return { enfant, port };
    } catch (erreur) {
      if (!PORT_PRIS.test(enfant.sortie())) throw erreur;
      if (essai === essais) throw new Error(`aucun port tenu en ${essais} essais, le dernier sur ${port} : ${enfant.sortie()}`);
    }
  }
}

export const DEPOT = "acme/brigade";
export const CHEMIN_TICKETS = `repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`;

// Une issue telle que l'API de GitHub la rend.
export function issueGitHub(
  number: number,
  options: { title?: string; labels?: string[]; state?: "open" | "closed"; created_at?: string; updated_at?: string; pull_request?: object } = {},
) {
  return {
    number,
    title: `Ticket ${number}`,
    state: "open",
    created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
    updated_at: "2026-10-08T09:00:00Z",
    html_url: `https://github.com/${DEPOT}/issues/${number}`,
    ...options,
    labels: (options.labels ?? ["fire"]).map((name) => ({ name })),
  };
}

type ReponseGh = { statut?: number; etag?: string; suivant?: string; corps: unknown };

export type FauxGh = {
  // Le chemin du binaire, pour BRIGADE_GH_BIN.
  bin: string;
  repondre(chemin: string, reponse: ReponseGh): void;
  // La liste des tickets, l'issue de chacun, et ses commentaires — aucun, tant
  // que `commentaires` n'en a pas dicté.
  issues(liste: ReturnType<typeof issueGitHub>[], etag?: string): void;
  // Les commentaires d'une issue, tous posés par le propriétaire du dépôt.
  commentaires(numero: number, ...corps: string[]): void;
  // Les arguments de chaque appel reçu, dans l'ordre.
  appels(): string[][];
  // Le jeton (`GH_TOKEN`) sous lequel chaque appel a été fait, ou null.
  jetons(): Array<string | null>;
};

// La doublure de `gh`, appelée par un lien posé dans le répertoire du test.
const FAUX_GH = join(import.meta.dirname, "aides/faux-gh.sh");

// Un faux `gh` : il rejoue les réponses qu'on lui dicte, et note ses appels.
// Tant qu'on ne lui a rien dicté, il échoue comme un `gh` sans réseau.
// Un lien vers la doublure, pas une copie : macOS fait attendre un tiers de
// seconde la première exécution de tout exécutable fraîchement écrit.
export function fauxGh(t: TestContext): FauxGh {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  symlinkSync(FAUX_GH, bin);
  mkdirSync(join(repertoire, "appels"));
  // Chaque réponse dictée a son rang, et son fichier : la doublure n'a qu'à le
  // rendre. Un chemin redicté garde sa place parmi les autres.
  const reponses = new Map<string, { rang: number; statut: number; etag: string }>();
  let rang = 0;
  const repondre = (chemin: string, reponse: ReponseGh) => {
    const statut = reponse.statut ?? 200;
    const entetes = ["Content-Type: application/json"];
    if (reponse.etag) entetes.push(`Etag: ${reponse.etag}`);
    if (reponse.suivant) entetes.push(`Link: <${reponse.suivant}>; rel="next"`);
    writeFileSync(join(repertoire, `reponse.${++rang}`), [`HTTP/2.0 ${statut}`, ...entetes, "", JSON.stringify(reponse.corps)].join("\r\n"));
    reponses.set(chemin, { rang, statut, etag: reponse.etag ?? "" });
    // Écriture atomique : le faux `gh` peut lire pendant qu'on dicte.
    const lignes = [...reponses].map(([dicte, r]) => `${[r.rang, r.statut, r.etag, dicte].join("\x1f")}\n`);
    writeFileSync(join(repertoire, "reponses.tmp"), lignes.join(""));
    renameSync(join(repertoire, "reponses.tmp"), join(repertoire, "reponses"));
  };
  // Un appel et son jeton se lisent ensemble. Un nom en cours d'inscription
  // n'est pas encore un appel.
  const notes = (): Array<{ args: string[]; jeton: string | null }> => {
    const ordre = join(repertoire, "appels/ordre");
    if (!existsSync(ordre)) return [];
    return readFileSync(ordre, "utf8").split("\n").slice(0, -1).map((nom) => {
      const [porte, jeton = "", ...args] = readFileSync(join(repertoire, "appels", nom), "utf8").split("\0").slice(0, -1);
      return { args, jeton: porte === "1" ? jeton : null };
    });
  };
  const commentaires = (numero: number) => `repos/${DEPOT}/issues/${numero}/comments?per_page=100`;
  return {
    bin,
    repondre,
    issues(liste, etag) {
      for (const issue of liste) {
        repondre(`repos/${DEPOT}/issues/${issue.number}`, { corps: issue });
        if (!reponses.has(commentaires(issue.number))) repondre(commentaires(issue.number), { corps: [] });
      }
      repondre(CHEMIN_TICKETS, { etag, corps: liste });
    },
    commentaires(numero, ...corps) {
      repondre(commentaires(numero), { corps: corps.map((body) => ({ body, author_association: "OWNER", user: { login: "chef" } })) });
    },
    appels() {
      return notes().map((note) => note.args);
    },
    jetons() {
      return notes().map((note) => note.jeton);
    },
  };
}

// Attend qu'une condition devienne vraie, sans dormir plus que nécessaire.
// Le délai n'est pas une attente : il ne sert qu'à ce qu'un test cassé finisse
// par le dire. Il est donc large — sur une machine où d'autres suites tournent
// au même moment, ce qui prend une demi-seconde en prend facilement dix.
// Sondée toutes les 20 ms : bien des conditions rouvrent et relisent tout un
// journal, et toutes les 5 ms c'était le gros du processeur de leur fichier.
// Sous Windows le runner du CI est de deux à trois fois plus lent et sa charge varie d'un run à l'autre :
// à 60 s, des tests différents de reparation, arbitrage, station ou reprise-du-renommage attendaient en
// vain, chacun une fois, sur la base comme sur les PR (#2080), et le même commit repassait vert.
// Sous Linux la CI joue les gates avec toute la suite à la fois (charge 8 sur 4 cœurs) : machine.test.ts
// attendait 69 s pour 60 s permises. Le plafond par test est de 120 s : l'attente reste en dessous.
const DELAI_PAR_DEFAUT_MS = process.platform === "win32" ? 180_000 : 100_000;
export async function jusqua(condition: () => boolean, delaiMs = DELAI_PAR_DEFAUT_MS): Promise<void> {
  const limite = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > limite) throw new Error("condition jamais remplie");
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
}

// Sonde un process. Seul ESRCH dit « mort » — un pid qu'on n'a pas su lire
// (`undefined`, 0 : `kill(0, 0)` sonde le groupe du test et réussit toujours) ou
// pas le droit de sonder (EPERM) est une erreur, pas une réponse.
export function vivant(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) throw new Error(`pid illisible : ${pid}`);
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw erreur;
  }
}

// Le pid du dernier process lancé en arrière-plan (`$!`), à écrire dans un script
// bash que joue le runtime. Sous Git Bash, `$!` est un pid MSYS, que Node ne
// connaît pas : le pid Windows du même process est dans `/proc/$!/winpid`. Ailleurs
// ce fichier n'existe pas et `$!` est déjà le bon pid.
export const PID_DU_FOND = '$(cat /proc/$!/winpid 2>/dev/null || echo $!)';

// Attend la mort d'un process : un signal envoyé n'est pas un process mort, il
// meurt un instant plus tard.
export async function mort(pid: number): Promise<void> {
  vivant(pid);
  await jusqua(() => !vivant(pid));
}

// L'environnement de `git` dans les tests : ni la configuration du poste (une
// signature de commits obligatoire ferait tout échouer), ni son identité. La
// sienne (aides/git) ne fait qu'alléger : aucune maintenance lancée derrière un
// commit ou un rapatriement, et un dépôt neuf sans les crochets d'exemple, que
// chaque test copierait puis supprimerait.
export const ENV_GIT = {
  ...ENV_ENFANT,
  GIT_CONFIG_GLOBAL: join(import.meta.dirname, "aides/git/config"),
  GIT_TEMPLATE_DIR: join(import.meta.dirname, "aides/git/modele"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "cook",
  GIT_AUTHOR_EMAIL: "cook@brigade.test",
  GIT_COMMITTER_NAME: "cook",
  GIT_COMMITTER_EMAIL: "cook@brigade.test",
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV_GIT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export const BASE = "v2";

// Le dépôt d'un projet — une origine nue dont la branche de base porte un
// commit, et un clone — fabriqué une fois par fichier de tests : chaque test en
// reçoit une copie, et copier des fichiers coûte bien moins que rejouer `git`.
// Il n'est pas gardé d'une passe à l'autre : un gabarit commun à toute la
// machine serait un chemin que deux worktrees se partagent, et celui dont la
// forme a changé casserait les tests de l'autre.
const ORIGINE_DU_GABARIT = "@ORIGINE@";
let gabarit: string | undefined;
function gabaritDeDepot(): string {
  if (gabarit !== undefined) return gabarit;
  const racine = repertoireDuFichier("brigade-test-gabarit-", () => void (gabarit = undefined));
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  mkdirSync(clone);
  git(clone, "init", "-q", `--initial-branch=${BASE}`);
  writeFileSync(join(clone, "LISEZMOI"), "le projet\n");
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "amorce");
  git(racine, "clone", "-q", "--bare", clone, origine);
  git(clone, "remote", "add", "origin", ORIGINE_DU_GABARIT);
  git(clone, "update-ref", `refs/remotes/origin/${BASE}`, "HEAD");
  return (gabarit = racine);
}

// Le dépôt d'un projet, sans réseau : une origine nue et le clone réservé à la
// station, propres au test.
export function depotGit(t: TestContext): { origine: string; clone: string } {
  const modele = gabaritDeDepot();
  const racine = repertoireTemporaire(t);
  cpSync(modele, racine, { recursive: true });
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  // Le gabarit ne connaît pas l'adresse de l'origine de ce test. Écrite avec
  // des barres obliques : dans la configuration de git, la contre-oblique d'un
  // chemin de Windows serait un échappement, et le fichier illisible.
  const config = join(clone, ".git/config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(ORIGINE_DU_GABARIT, origine.replaceAll("\\", "/")));
  return { origine, clone };
}

// Ajoute un commit dans un arbre de travail, comme le ferait un cook.
export function commiter(arbre: string, fichier = "travail.txt"): void {
  writeFileSync(join(arbre, fichier), `${fichier}\n`);
  git(arbre, "add", ".");
  git(arbre, "commit", "-q", "-m", `ajoute ${fichier}`);
}

// La station jouée dans le process du test : ses lignes, son pid — celui du
// test —, ce que ses signaux y font, et sa fin : le code de son refus, ou 0
// quand tout ce qui s'écrit de son arrêt l'est.
export type StationIci = Pick<Enfant, "sortie" | "attendre"> & {
  pid: number;
  signaler: (signal: "SIGTERM" | "SIGINT" | "SIGHUP") => void;
  fin: Promise<number>;
};

let stationIci = false;

// Joue la station (`demarrerLaStation`, chargée au premier appel : ce fichier
// ne charge pas tout le runtime) dans le process du test, sur l'environnement
// qu'on lui donne plus ENV_ENFANT, comme `lancer` — sans le Node qui démarre ni
// les trois cents modules qu'il relit, près d'une seconde de processeur à
// chaque fois. Une seule à la fois par process : elle y pose le compteur
// d'appels à GitHub du process (`installerLimite`), et ses tests se jouent l'un
// après l'autre. Le `gh` de son environnement, que son canal lance avec celui
// du process, reçoit le sien par une enveloppe. Arrêtée à la fin du test si elle
// tourne encore, puis rendue. Ce qui tient au process (le démarrage par son
// fichier, un signal reçu, sa sortie) se prouve avec `lancer`.
export function jouerLaStation(t: TestContext, env: Record<string, string> = {}): StationIci {
  if (stationIci) throw new Error("une station joue déjà dans ce process : ses tests se jouent l'un après l'autre");
  stationIci = true;
  let sortie = "";
  const attentes = new Set<() => void>();
  const ecrire = (ligne: string) => {
    sortie += `${ligne}\n`;
    for (const verifier of attentes) verifier();
  };
  const sienne: Record<string, string> = { ...ENV_ENFANT, ...env };
  if (process.platform !== "win32" && sienne.BRIGADE_GH_BIN) {
    const enveloppe = join(repertoireTemporaire(t), "gh");
    const cite = (mot: string) => `'${mot.replaceAll("'", `'\\''`)}'`;
    writeFileSync(enveloppe, ["#!/bin/sh", ...Object.entries(sienne).map(([nom, valeur]) => `export ${nom}=${cite(valeur)}`), `exec ${cite(sienne.BRIGADE_GH_BIN)} "$@"`, ""].join("\n"), { mode: 0o755 });
    sienne.BRIGADE_GH_BIN = enveloppe;
  }
  let demarree: import("../src/station/main.ts").StationDemarree | null = null;
  let arretee = false;
  let enAttente: "SIGTERM" | "SIGINT" | "SIGHUP" | null = null;
  let finir: (code: number) => void = () => {};
  const fin = new Promise<number>((resoudre) => (finir = resoudre));
  const rendre = (code: number) => {
    demarree?.rendre();
    stationIci = false;
    finir(code);
  };
  const echec = (erreur: unknown) => {
    ecrire(erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur));
    return 1;
  };
  const signaler = (signal: "SIGTERM" | "SIGINT" | "SIGHUP") => {
    if (demarree === null) return void (enAttente ??= signal);
    if (signal === "SIGHUP") return demarree.relire();
    if (arretee) return;
    arretee = true;
    void demarree.arreter(signal).then(() => 0, echec).then(rendre);
  };
  const demarrage = (async () => {
    const { demarrerLaStation } = await import("../src/station/main.ts");
    try {
      await demarrerLaStation(sienne, {
        sortie: { dire: ecrire, redire: ecrire },
        branche: (station) => {
          demarree = station;
          if (enAttente !== null) signaler(enAttente);
        },
      });
    } catch (erreur) {
      rendre(erreur instanceof Sortie ? erreur.code : echec(erreur));
    }
  })();
  aArreter(t, async () => {
    await demarrage;
    signaler("SIGTERM");
    await fin;
  });
  return {
    sortie: () => sortie,
    pid: process.pid,
    signaler,
    fin,
    attendre: (texte) =>
      new Promise<void>((resoudre, rejeter) => {
        const verifier = () => {
          if (sortie.includes(texte)) resoudre();
        };
        attentes.add(verifier);
        verifier();
        void fin.then(() => {
          if (!sortie.includes(texte)) rejeter(new Error(`station finie sans « ${texte} » : ${sortie}`));
        });
      }),
  };
}
