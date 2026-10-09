// Outils communs aux tests. Aucun test ne lit BRIGADE_STATE_DIR : chacun crée
// son répertoire d'état temporaire, détruit à la fin du test.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Journal } from "../src/journal.ts";
import type { Projection } from "../src/projection.ts";

// La doublure de `claude` : son scénario se choisit par la variable FAUX_CLAUDE.
export const FAUX_CLAUDE = join(import.meta.dirname, "aides/faux-claude.sh");

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

// L'environnement minimal d'un process lancé par un test : rien du shell du
// dev n'y passe, sauf le cache de compilation de Node quand la suite en a un —
// sans lui, chaque process d'essai repaie la lecture de son TypeScript.
export const ENV_ENFANT: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  ...(process.env.NODE_COMPILE_CACHE ? { NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE } : {}),
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
      // Un cook qu'on vient de tuer peut encore finir d'écrire son flux : la
      // suppression se reprend au lieu d'échouer sur un répertoire redevenu plein —
      // un crochet de fin qui échoue ferait sauter les suivants.
      for (const repertoire of courante.repertoires) rmSync(repertoire, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
    });
  }
  return fin;
}

// Enregistre ce qui doit être arrêté à la fin du test, avant la suppression de ses répertoires.
export function aArreter(t: TestContext, arreter: () => unknown): void {
  finDe(t).arrets.push(arreter);
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

// Lance un fichier TypeScript dans un vrai process Node, tué à la fin du test
// s'il vit encore. L'environnement est celui qu'on lui donne, plus ENV_ENFANT :
// un BRIGADE_STATE_DIR posé dans le shell du dev ne lui parvient jamais.
export function lancer(t: TestContext, fichier: string, args: string[] = [], env: Record<string, string> = {}): Enfant {
  const enfant = spawn(process.execPath, [fichier, ...args], {
    env: { ...ENV_ENFANT, ...env },
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

export const DEPOT = "benomite/brigade";
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
};

// La doublure de `gh`, appelée par un lien posé dans le répertoire du test.
const FAUX_GH = join(import.meta.dirname, "aides/faux-gh.ts");

// Un faux `gh` : il rejoue les réponses qu'on lui dicte, et note ses appels.
// Tant qu'on ne lui a rien dicté, il échoue comme un `gh` sans réseau.
// Un lien vers la doublure, pas une copie : macOS fait attendre un tiers de
// seconde la première exécution de tout exécutable fraîchement écrit.
export function fauxGh(t: TestContext): FauxGh {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  symlinkSync(FAUX_GH, bin);
  const reponses: Record<string, ReponseGh> = {};
  const repondre = (chemin: string, reponse: ReponseGh) => {
    reponses[chemin] = reponse;
    // Écriture atomique : le faux `gh` peut lire pendant qu'on dicte.
    writeFileSync(join(repertoire, "reponses.tmp"), JSON.stringify(reponses));
    renameSync(join(repertoire, "reponses.tmp"), join(repertoire, "reponses.json"));
  };
  const commentaires = (numero: number) => `repos/${DEPOT}/issues/${numero}/comments?per_page=100`;
  return {
    bin,
    repondre,
    issues(liste, etag) {
      for (const issue of liste) {
        repondre(`repos/${DEPOT}/issues/${issue.number}`, { corps: issue });
        if (!(commentaires(issue.number) in reponses)) repondre(commentaires(issue.number), { corps: [] });
      }
      repondre(CHEMIN_TICKETS, { etag, corps: liste });
    },
    commentaires(numero, ...corps) {
      repondre(commentaires(numero), { corps: corps.map((body) => ({ body, author_association: "OWNER", user: { login: "chef" } })) });
    },
    appels() {
      const fichier = join(repertoire, "appels.jsonl");
      if (!existsSync(fichier)) return [];
      // Créé mais pas encore écrit : le faux `gh` est en train de noter son premier appel.
      return readFileSync(fichier, "utf8").split("\n").filter(Boolean).map((ligne) => JSON.parse(ligne) as string[]);
    },
  };
}

// Attend qu'une condition devienne vraie, sans dormir plus que nécessaire.
// Le délai n'est pas une attente : il ne sert qu'à ce qu'un test cassé finisse
// par le dire. Il est donc large — sur une machine où d'autres suites tournent
// au même moment, ce qui prend une demi-seconde en prend facilement dix.
export async function jusqua(condition: () => boolean, delaiMs = 60_000): Promise<void> {
  const limite = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > limite) throw new Error("condition jamais remplie");
    await new Promise((resoudre) => setTimeout(resoudre, 5));
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

// Attend la mort d'un process : un signal envoyé n'est pas un process mort, il
// meurt un instant plus tard.
export async function mort(pid: number): Promise<void> {
  vivant(pid);
  await jusqua(() => !vivant(pid));
}

// L'environnement de `git` dans les tests : ni la configuration du poste (une
// signature de commits obligatoire ferait tout échouer), ni son identité.
export const ENV_GIT = {
  ...ENV_ENFANT,
  GIT_CONFIG_GLOBAL: "/dev/null",
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
  // Le gabarit ne connaît pas l'adresse de l'origine de ce test.
  const config = join(clone, ".git/config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(ORIGINE_DU_GABARIT, origine));
  return { origine, clone };
}

// Ajoute un commit dans un arbre de travail, comme le ferait un cook.
export function commiter(arbre: string, fichier = "travail.txt"): void {
  writeFileSync(join(arbre, fichier), `${fichier}\n`);
  git(arbre, "add", ".");
  git(arbre, "commit", "-q", "-m", `ajoute ${fichier}`);
}
