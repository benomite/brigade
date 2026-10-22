// La copie locale d'un projet, quand le chef l'ouvre depuis un ordinateur où
// il n'a rien cloné (#1429) : les projets qu'une station appairée porte se
// lisent sur GitHub (`appairage/stations-du-chef.ts`), avec leur dépôt — en
// ouvrir un ne demande plus de dossier au chef.
//
// L'ouverture cherche d'abord une copie qui existe déjà : le dossier que
// l'appelant connaît (celui du fichier des projets de l'app, s'il y en a un),
// puis celui que l'app gère pour ce projet. Une copie, c'est un clone dont
// l'origine est le dépôt du projet : elle est reprise telle quelle, rien n'est
// recloné. Sans copie, le dépôt est cloné dans le dossier géré par l'app, par
// le `gh` de l'ordinateur — qui s'authentifie seul —, en HTTPS, à côté de sa
// place puis renommé : un clone interrompu ne laisse rien là où l'ouverture
// suivante chercherait une copie.
//
// Le dossier géré : `<racine>/<nom du projet>`, où la racine est
// `BRIGADE_PROJECTS_DIR`, à défaut `~/.local/share/brigade/projects` — à côté
// de l'atelier de la station (`station/configuration.ts`), hors de
// `~/.config/brigade`, qu'aucun cook ni second du bac à sable ne lit.
//
// Le clone dit où il en est (`progres`) : une phrase par étape, et le
// pourcentage que git écrit en recevant le dépôt. Il rend toujours l'un de
// deux états, et ne lève pas :
//   - `open` : le projet est ouvert — `folder`, sa copie, et `cloned`, vrai
//     quand elle vient d'être clonée ;
//   - `failed` : la copie n'a pas pu être faite — `cause` (stable :
//     `git-missing`, `gh-missing`, `sign-in-required`, `access-denied`,
//     `repository-missing`, `network`, `timeout`, `folder-taken`, `invalid`,
//     `unknown`), `reason`, une phrase qui la nomme, `link` quand une page la
//     lève, `action` quand l'app peut la lever (se connecter à GitHub), et
//     `detail`, ce que gh et git ont dit, pour qui le demande.
//
// L'app l'importe (`ouvrirLaCopieLocale`), ou lance la commande :
//
//   node runtime/src/projets/copie-locale.ts <owner>/<repo> [--name <nom>] [--folder <dossier>]
//
// qui écrit chaque étape en une ligne JSON (`{"progress":…}`), puis l'état en
// une dernière — code 0 quand le projet est ouvert, 1 sinon.
// `BRIGADE_GH_BIN` et `BRIGADE_GIT_BIN` nomment le `gh` et le `git`.
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { connexionGitHub, type Connexion } from "../appairage/stations-du-chef.ts";
import { execFile, spawn } from "../sans-invite.ts";
import { ligneDeGit } from "./acces.ts";
import { enqueter, type Enquete } from "./echec-du-clone.ts";
import { adresseHttps } from "./preparer.ts";

export type CauseDEchec = "git-missing" | "gh-missing" | "sign-in-required" | "access-denied" | "repository-missing" | "network" | "timeout" | "folder-taken" | "invalid" | "unknown";

export type CopieLocale =
  | { state: "open"; project: string; repository: string; folder: string; cloned: boolean }
  | { state: "failed"; project: string; repository: string; cause: CauseDEchec; reason: string; link?: string; action?: Connexion; detail?: string };

// Une étape de l'ouverture, en une phrase. `percent` : où en est git, pendant
// qu'il reçoit le dépôt.
export type Progres = { stage: "looking" | "reusing" | "cloning"; sentence: string; folder?: string; percent?: number };

export type OptionsDOuverture = {
  // `<owner>/<repo>`.
  repository: string;
  // Le nom du projet, celui de son dossier géré ; à défaut, le nom du dépôt.
  project?: string;
  // Une copie que l'appelant connaît déjà.
  folder?: string;
  // La racine des dossiers gérés par l'app ; à défaut, `racineDesCopies`.
  root?: string;
  gh?: string;
  git?: string;
  env?: NodeJS.ProcessEnv;
  delaiMs?: number;
  progres?: (etape: Progres) => void;
};

export const COPIES_SOUS_LE_COMPTE = join(".local", "share", "brigade", "projects");

// La racine des copies que l'app gère.
export function racineDesCopies(env: NodeJS.ProcessEnv = process.env, maison = homedir()): string {
  return env.BRIGADE_PROJECTS_DIR || join(maison, COPIES_SOUS_LE_COMPTE);
}

const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const NOM = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const DELAI_MS = 30 * 60_000;
const DETAIL_MAX = 2000;
const PAGE_GIT = "https://git-scm.com/downloads";
const PAGE_GH = "https://cli.github.com";

const SANS_GIT = /unable to find git executable|git: (command )?not found|executable file not found.*git/i;
const NON_CONNECTE = /gh auth login|not logged in|authentication required|requires authentication|bad credentials|could not read (username|password)|terminal prompts disabled|authentication failed|invalid username or password|returned error: 401|http 401/i;
const RESEAU = /could not resolve host|could not resolve hostname|failed to connect|couldn't connect|connection (timed out|refused|reset|closed)|operation timed out|network is unreachable|temporary failure in name resolution|early eof|returned error: 5\d\d|error connecting to|dial tcp|i\/o timeout|no such host|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i;
const INTERDIT = /returned error: 403|permission to .* denied|access denied|http 403|saml|single sign-on/i;
const INTROUVABLE = /repository not found|could not resolve to a repository|does not appear to be a git repository|returned error: 404|not found/i;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Vrai si cette adresse d'origine désigne ce dépôt : HTTPS, ssh, ou un chemin
// qui finit par `<owner>/<repo>(.git)`.
export function origineDu(depot: string, adresse: string): boolean {
  const [proprio = "", nom = ""] = depot.toLowerCase().split("/");
  const nette = adresse.trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/, "");
  return nette.endsWith(`/${proprio}/${nom}`) || nette.endsWith(`:${proprio}/${nom}`);
}

type Rendu = { ok: true; sortie: string } | { ok: false; code: unknown; erreurs: string };

function lancerGit(git: string, args: string[], env: NodeJS.ProcessEnv): Promise<Rendu> {
  return new Promise((resoudre) => {
    const enfant = execFile(git, args, { env, timeout: 60_000, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre({ ok: true, sortie: String(sortie).trim() });
      resoudre({ ok: false, code: erreur.code, erreurs: String(erreurs).trim() || erreur.message });
    });
    enfant.stdin?.end();
  });
}

const estUnDossier = (chemin: string) => {
  try {
    return statSync(chemin).isDirectory();
  } catch {
    return false;
  }
};

const vide = (chemin: string) => {
  try {
    return readdirSync(chemin).length === 0;
  } catch {
    return false;
  }
};

// Ce que tient ce dossier : rien, une copie du dépôt, ou autre chose — et quoi.
async function lireLeDossier(git: string, dossier: string, depot: string, env: NodeJS.ProcessEnv): Promise<{ tient: "rien" } | { tient: "copie" } | { tient: "autre"; quoi: string }> {
  if (!existsSync(dossier)) return { tient: "rien" };
  if (!estUnDossier(dossier)) return { tient: "autre", quoi: "a file" };
  if (vide(dossier)) return { tient: "rien" };
  if (!existsSync(join(dossier, ".git"))) return { tient: "autre", quoi: "files that are not a git clone" };
  const origine = await lancerGit(git, ["-C", dossier, "remote", "get-url", "origin"], env);
  if (!origine.ok) return { tient: "autre", quoi: "a git clone with no origin" };
  return origineDu(depot, origine.sortie) ? { tient: "copie" } : { tient: "autre", quoi: `a clone of ${origine.sortie}` };
}

type Clone = { ok: true } | { ok: false; absent: boolean; expire: boolean; erreurs: string };

// Le pourcentage que git écrit en recevant le dépôt (`--progress`), ligne par
// ligne — les siennes finissent par un retour chariot.
const RECU = /Receiving objects:\s+(\d{1,3})%/;

function clonerA(gh: string, depot: string, aCote: string, env: NodeJS.ProcessEnv, delaiMs: number, recu: (pourcent: number) => void): Promise<Clone> {
  return new Promise((resoudre) => {
    let erreurs = "";
    let reste = "";
    let expire = false;
    let fini = false;
    const finir = (rendu: Clone) => {
      if (fini) return;
      fini = true;
      clearTimeout(garde);
      resoudre(rendu);
    };
    const enfant = spawn(gh, ["repo", "clone", adresseHttps(depot), aCote, "--", "--progress"], { env, stdio: ["ignore", "ignore", "pipe"] });
    const garde = setTimeout(() => {
      expire = true;
      enfant.kill();
    }, delaiMs);
    enfant.stderr?.setEncoding("utf8");
    enfant.stderr?.on("data", (morceau: string) => {
      if (erreurs.length < 64 * 1024) erreurs += morceau;
      const lignes = (reste + morceau).split(/[\r\n]/);
      reste = lignes.pop() ?? "";
      for (const ligne of lignes) {
        const lu = RECU.exec(ligne);
        if (lu !== null) recu(Number(lu[1]));
      }
    });
    enfant.on("error", (erreur: NodeJS.ErrnoException) => finir({ ok: false, absent: erreur.code === "ENOENT", expire: false, erreurs: erreur.message }));
    enfant.on("close", (code) => finir(code === 0 && !expire ? { ok: true } : { ok: false, absent: false, expire, erreurs }));
  });
}

// Ce que git écrit de sa progression n'est pas une raison : la sortie gardée
// n'en a pas.
const sansProgression = (erreurs: string) =>
  erreurs
    .split(/[\r\n]/)
    .filter((ligne) => !/^(remote: )?(Counting|Compressing|Receiving|Resolving|Enumerating|Total|Updating files|Cloning into)/i.test(ligne.trim()))
    .join("\n")
    .trim();

type Echec = Omit<Extract<CopieLocale, { state: "failed" }>, "state" | "project" | "repository">;

// Ce qu'un clone en échec veut dire, en une cause et une phrase. Pur.
export function lireLEchec(depot: string, erreurs: string, enquete: Enquete): Echec {
  const detail = erreurs.slice(0, DETAIL_MAX);
  const qui = enquete.compte ?? "this computer's GitHub account";
  const proprio = depot.split("/")[0] ?? depot;
  if (SANS_GIT.test(erreurs)) return { cause: "git-missing", reason: `Git is not installed on this computer, so ${depot} cannot be cloned: install it, then open the project again.`, link: PAGE_GIT, detail };
  if (RESEAU.test(erreurs)) return { cause: "network", reason: `GitHub cannot be reached from this computer, so ${depot} could not be cloned: check its network connection, then open the project again.`, detail };
  if (INTERDIT.test(erreurs)) return { cause: "access-denied", reason: `GitHub denies ${qui} access to ${depot}, so it cannot be cloned: ask an owner of ${depot} to give ${qui} read access.`, link: `https://github.com/${depot}`, detail };
  if (NON_CONNECTE.test(erreurs)) return { cause: "sign-in-required", reason: `This computer is not signed in to GitHub, so ${depot} cannot be cloned.`, detail };
  if (INTROUVABLE.test(erreurs)) {
    if (enquete.proprietaire === false) return { cause: "repository-missing", reason: `${depot} cannot be cloned because it does not exist: GitHub has no account or organization named ${proprio}.`, detail };
    return { cause: "access-denied", reason: `GitHub denies ${qui} access to ${depot}, so it cannot be cloned: either ${qui} is not one of its collaborators, or it no longer exists under this name.`, link: `https://github.com/${depot}`, detail };
  }
  return { cause: "unknown", reason: `Git could not clone ${depot}: ${ligneDeGit(erreurs).replace(/[.\s]+$/, "")}.`, detail };
}

// Ouvre la copie locale du projet : la reprend, ou la clone. Ne lève pas : un
// échec est un état.
export async function ouvrirLaCopieLocale(options: OptionsDOuverture): Promise<CopieLocale> {
  const { repository } = options;
  const project = options.project ?? repository.split("/")[1] ?? repository;
  const gh = options.gh ?? "gh";
  const git = options.git ?? "git";
  const base = options.env ?? process.env;
  const env = { ...base, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" };
  const dire = options.progres ?? (() => {});
  const echouer = (echec: Echec): CopieLocale => ({ state: "failed", project, repository, ...echec });

  if (!DEPOT.test(repository) || [".", ".."].includes(repository.split("/")[1] ?? "") || repository.endsWith(".git")) {
    return echouer({ cause: "invalid", reason: `“${repository}” is not a GitHub repository written as <owner>/<name>, so there is nothing to clone.` });
  }
  if (!NOM.test(project) || project === "." || project === "..") {
    return echouer({ cause: "invalid", reason: `“${project}” cannot name a folder, so ${repository} has nowhere to be cloned.` });
  }
  const racine = resolve(options.root ?? racineDesCopies(base));
  const dossier = join(racine, project);

  dire({ stage: "looking", sentence: `Looking for a local copy of ${repository}.` });
  const version = await lancerGit(git, ["--version"], env);
  if (!version.ok && version.code === "ENOENT") {
    return echouer({ cause: "git-missing", reason: `Git is not installed on this computer, so ${repository} cannot be cloned: install it, then open the project again.`, link: PAGE_GIT, detail: version.erreurs });
  }

  // La copie que l'appelant connaît, puis celle du dossier géré.
  const connue = options.folder !== undefined && isAbsolute(options.folder) ? resolve(options.folder) : null;
  if (connue !== null && connue !== dossier && (await lireLeDossier(git, connue, repository, env)).tient === "copie") {
    dire({ stage: "reusing", sentence: `Opening the local copy of ${repository} in ${connue}.`, folder: connue });
    return { state: "open", project, repository, folder: connue, cloned: false };
  }
  const tenu = await lireLeDossier(git, dossier, repository, env);
  if (tenu.tient === "copie") {
    dire({ stage: "reusing", sentence: `Opening the local copy of ${repository} in ${dossier}.`, folder: dossier });
    return { state: "open", project, repository, folder: dossier, cloned: false };
  }
  if (tenu.tient === "autre") {
    return echouer({ cause: "folder-taken", reason: `${dossier} already holds ${tenu.quoi}, so ${repository} is not cloned over it: move that folder away, then open the project again.` });
  }

  const aCote = `${dossier}.clonage`;
  try {
    rmSync(aCote, { recursive: true, force: true });
    mkdirSync(dirname(dossier), { recursive: true });
  } catch (erreur) {
    return echouer({ cause: "folder-taken", reason: `${repository} cannot be cloned because brigade cannot write in ${racine}: ${message(erreur)}.`, detail: message(erreur) });
  }
  dire({ stage: "cloning", sentence: `Cloning ${repository} into ${dossier}.`, folder: dossier });
  let dernier = -1;
  const delaiMs = options.delaiMs ?? DELAI_MS;
  const clone = await clonerA(gh, repository, aCote, env, delaiMs, (pourcent) => {
    if (pourcent === dernier) return;
    dernier = pourcent;
    dire({ stage: "cloning", sentence: `Cloning ${repository} into ${dossier} — ${pourcent}%.`, folder: dossier, percent: pourcent });
  });
  if (!clone.ok) {
    rmSync(aCote, { recursive: true, force: true });
    if (clone.absent) {
      return echouer({ cause: "gh-missing", reason: `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade clones ${repository} through it: install it, then open the project again.`, link: PAGE_GH, detail: clone.erreurs });
    }
    if (clone.expire) {
      return echouer({ cause: "timeout", reason: `The clone of ${repository} did not finish within ${Math.round(delaiMs / 60_000)} min, so it was stopped: open the project again once the network is faster.`, detail: sansProgression(clone.erreurs).slice(0, DETAIL_MAX) });
    }
    const erreurs = sansProgression(clone.erreurs);
    // GitHub dit « introuvable » d'un dépôt qu'on ne voit pas comme d'un dépôt
    // qui n'existe pas : le `gh` dit lequel.
    const enquete = INTROUVABLE.test(erreurs) || INTERDIT.test(erreurs) ? await enqueter({ gh, depot: repository, env: base }) : { compte: null, jeton: null, proprietaire: null };
    const echec = lireLEchec(repository, erreurs, enquete);
    return echouer(echec.cause === "sign-in-required" ? { ...echec, action: connexionGitHub(gh) } : echec);
  }
  try {
    if (existsSync(dossier)) rmdirSync(dossier);
    renameSync(aCote, dossier);
  } catch (erreur) {
    rmSync(aCote, { recursive: true, force: true });
    return echouer({ cause: "folder-taken", reason: `${repository} was cloned but could not be put in ${dossier}: ${message(erreur)}.`, detail: message(erreur) });
  }
  return { state: "open", project, repository, folder: dossier, cloned: true };
}

const valeurDe = (args: string[], nom: string) => {
  const rang = args.indexOf(nom);
  return rang >= 0 ? args[rang + 1] : undefined;
};

export async function principal(appel: Appel): Promise<void> {
  const [repository = ""] = appel.args.filter((arg, rang) => !arg.startsWith("--") && !appel.args[rang - 1]?.startsWith("--"));
  const project = valeurDe(appel.args, "--name");
  const folder = valeurDe(appel.args, "--folder");
  const etat = await ouvrirLaCopieLocale({
    repository,
    ...(project === undefined ? {} : { project }),
    ...(folder === undefined ? {} : { folder }),
    gh: appel.env.BRIGADE_GH_BIN || "gh",
    git: appel.env.BRIGADE_GIT_BIN || "git",
    env: appel.env,
    progres: (etape) => appel.dire(JSON.stringify({ progress: etape })),
  });
  appel.dire(JSON.stringify(etat));
  if (etat.state !== "open") throw new Sortie(1);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
