// Ce que le second lit du dépôt d'un projet pas encore préparé pour Brigade
// (#3167, épique #3164) : de quoi proposer la mise en place au chef au lieu de
// la lui faire taper.
//
//   etatDuDepot(dossier)   le dossier est-il un dépôt git, et porte-t-il déjà la
//                          section `## Équipe multi-agents` de son `CLAUDE.md` ?
//   lireLeDepot(dossier)   ce qu'il propose : la branche d'intégration, les
//                          checks qui jugent une livraison, les zones de fichiers.
//
// Les règles de lecture sont celles que `/brigade:init` suit déjà (la section
// « Constate » de `app/src/plugin/init.md`, et `init.sh` pour la branche) :
// la branche par défaut du dépôt, le script `test` du `package.json` avec le
// gestionnaire que son lockfile désigne — ou l'équivalent de la stack —, les
// workspaces ou les dossiers de premier niveau.
//
// Rien n'est deviné : ce qui ne se lit pas — un fichier illisible, une branche
// par défaut que le clone ne dit pas, aucune commande de test — est rendu non
// lu, avec sa raison, et reste pour les questions. Sans E/S autre que la
// lecture de fichiers du dossier : ni `git`, ni réseau.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

// Lu, avec d'où ; ou non lu, avec pourquoi, en une phrase.
export type Trouvaille<T> = { lu: true; valeur: T; source: string } | { lu: false; raison: string };
export type LectureDuDepot = { branche: Trouvaille<string>; checks: Trouvaille<string[]>; zones: Trouvaille<string[]> };

// `hors-depot` : le dossier n'est pas un dépôt git, il n'y a rien à mettre en
// place ici. `inconnu` : son `CLAUDE.md` existe mais ne se lit pas — on ne sait
// pas s'il est préparé, et on ne le devine pas.
export type EtatDuDepot = { etat: "hors-depot" } | { etat: "prepare" } | { etat: "non-prepare" } | { etat: "inconnu"; raison: string };

// La section d'où les rôles lisent leurs bindings — la même que le constat du
// runtime cherche (`depot-prepare/preparation.ts`, `SECTION`).
const SECTION = /^## Équipe multi-agents/m;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const enErreur = (erreur: unknown): NodeJS.ErrnoException => erreur as NodeJS.ErrnoException;

// Le contenu d'un fichier ; `null` s'il n'existe pas ; lève, en une phrase, s'il ne se lit pas. `nom` : le
// fichier tel que la phrase le dit — relatif au dépôt, quand il y est.
function lire(chemin: string, nom = chemin): string | null {
  try {
    return readFileSync(chemin, "utf8");
  } catch (erreur) {
    if (enErreur(erreur).code === "ENOENT" || enErreur(erreur).code === "ENOTDIR") return null;
    throw new Error(`\`${nom}\` cannot be read (${message(erreur)})`);
  }
}

// Un fichier du dépôt, par son chemin relatif à lui.
const lireDans = (dossier: string, relatif: string) => lire(join(dossier, relatif), relatif);

// Le dossier git commun du dépôt : `.git`, ou celui qu'un `.git` fichier
// désigne (un worktree, un sous-module), remonté par son `commondir`. Null : ce
// n'est pas un dépôt git.
function dossierGit(dossier: string): string | null {
  const point = join(dossier, ".git");
  let estDossier: boolean;
  try {
    estDossier = statSync(point).isDirectory();
  } catch {
    return null;
  }
  if (estDossier) return point;
  const pointeur = /^gitdir:\s*(.+?)\s*$/m.exec(lire(point) ?? "")?.[1];
  if (pointeur === undefined) return null;
  const propre = isAbsolute(pointeur) ? pointeur : resolve(dossier, pointeur);
  const commun = lire(join(propre, "commondir"))?.trim();
  return commun ? resolve(propre, commun) : propre;
}

export function etatDuDepot(dossier: string): EtatDuDepot {
  if (dossierGit(dossier) === null) return { etat: "hors-depot" };
  let claudeMd: string | null;
  try {
    claudeMd = lireDans(dossier, "CLAUDE.md");
  } catch (erreur) {
    return { etat: "inconnu", raison: message(erreur) };
  }
  return claudeMd !== null && SECTION.test(claudeMd) ? { etat: "prepare" } : { etat: "non-prepare" };
}

// La branche par défaut, telle que le clone la tient : `refs/remotes/origin/HEAD`
// (`git symbolic-ref`, comme `init.sh`). Une référence symbolique n'est jamais
// rangée dans `packed-refs` : le fichier suffit.
function lireLaBranche(dossier: string): Trouvaille<string> {
  const git = dossierGit(dossier);
  if (git === null) return { lu: false, raison: "the folder is not a git repository" };
  let tete: string | null;
  try {
    tete = lire(join(git, "refs", "remotes", "origin", "HEAD"), "refs/remotes/origin/HEAD");
  } catch (erreur) {
    return { lu: false, raison: message(erreur) };
  }
  if (tete === null) return { lu: false, raison: "the clone does not record the repository's default branch (no `refs/remotes/origin/HEAD`)" };
  const branche = /^ref:\s*refs\/remotes\/origin\/(\S+)\s*$/.exec(tete.trim())?.[1];
  if (branche === undefined) return { lu: false, raison: "`refs/remotes/origin/HEAD` does not name a branch of `origin`" };
  return { lu: true, valeur: branche, source: "the default branch of `origin`" };
}

// Le gestionnaire que le lockfile désigne, et comment il joue un script, à la racine ou dans un sous-dossier.
type Gestionnaire = { script: (nom: string, dans?: string) => string };
function gestionnaire(dossier: string): Gestionnaire {
  const a = (fichier: string) => existsSync(join(dossier, fichier));
  if (a("pnpm-lock.yaml")) return { script: (nom, dans) => `pnpm${dans ? ` --dir ${dans}` : ""} ${nom === "test" ? "test" : `run ${nom}`}` };
  if (a("yarn.lock")) return { script: (nom, dans) => `yarn${dans ? ` --cwd ${dans}` : ""} ${nom === "test" ? "test" : `run ${nom}`}` };
  if (a("bun.lockb") || a("bun.lock")) return { script: (nom, dans) => `bun${dans ? ` --cwd ${dans}` : ""} run ${nom}` };
  return { script: (nom, dans) => `npm${dans ? ` --prefix ${dans}` : ""} ${nom === "test" ? "test" : `run ${nom}`}` };
}

// Les scripts d'un `package.json` qui jugent une livraison, dans cet ordre. Le
// `test` que `npm init` écrit (« no test specified ») ne teste rien : il n'en est pas.
const SCRIPTS = ["test", "typecheck", "lint"];
const FAUX_TEST = /no test specified/;

type PackageJson = { scripts?: Record<string, unknown>; workspaces?: unknown };
function lirePackageJson(dossier: string, relatif: string): PackageJson | null {
  const texte = lireDans(dossier, relatif);
  if (texte === null) return null;
  try {
    const lu: unknown = JSON.parse(texte);
    if (lu === null || typeof lu !== "object" || Array.isArray(lu)) throw new Error("not a JSON object");
    return lu as PackageJson;
  } catch (erreur) {
    throw new Error(`\`${relatif}\` is not valid JSON (${message(erreur)})`);
  }
}

function scriptsDe(paquet: PackageJson): string[] {
  const scripts = paquet.scripts ?? {};
  return SCRIPTS.filter((nom) => typeof scripts[nom] === "string" && (scripts[nom] as string).trim() !== "" && !(nom === "test" && FAUX_TEST.test(scripts[nom] as string)));
}

// Les dossiers de premier niveau qui ne sont pas du code : ni cachés, ni produits.
const PAS_DU_CODE = new Set(["node_modules", "dist", "build", "out", "target", "vendor", "coverage", "tmp"]);
function dossiersDuPremierNiveau(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true })
    .filter((entree) => entree.isDirectory() && !entree.name.startsWith(".") && !PAS_DU_CODE.has(entree.name))
    .map((entree) => entree.name)
    .sort();
}

// Les checks : ceux de la stack à la racine ; sans aucun, le `package.json` de
// chaque dossier de premier niveau (un dépôt à plusieurs paquets sans racine).
function lireLesChecks(dossier: string): Trouvaille<string[]> {
  try {
    const checks: string[] = [];
    const sources: string[] = [];
    const lance = gestionnaire(dossier);
    const racine = lirePackageJson(dossier, "package.json");
    if (racine !== null) {
      const scripts = scriptsDe(racine);
      if (scripts.length > 0) {
        checks.push(...scripts.map((nom) => lance.script(nom)));
        sources.push(`the scripts ${scripts.map((nom) => `\`${nom}\``).join(", ")} of \`package.json\``);
      }
    }
    if (existsSync(join(dossier, "Cargo.toml"))) {
      checks.push("cargo test");
      sources.push("`Cargo.toml`");
    }
    if (existsSync(join(dossier, "go.mod"))) {
      checks.push("go test ./...");
      sources.push("`go.mod`");
    }
    const pyproject = lireDans(dossier, "pyproject.toml");
    if (existsSync(join(dossier, "pytest.ini")) || (pyproject !== null && /pytest/.test(pyproject))) {
      checks.push("pytest");
      sources.push(existsSync(join(dossier, "pytest.ini")) ? "`pytest.ini`" : "`pyproject.toml`");
    }
    const makefile = lireDans(dossier, "Makefile");
    if (checks.length === 0 && makefile !== null && /^test\s*:/m.test(makefile)) {
      checks.push("make test");
      sources.push("the `test` target of the `Makefile`");
    }
    if (checks.length === 0) {
      for (const sous of dossiersDuPremierNiveau(dossier)) {
        const paquet = lirePackageJson(dossier, `${sous}/package.json`);
        if (paquet === null) continue;
        const scripts = scriptsDe(paquet);
        if (scripts.length === 0) continue;
        const ici = gestionnaire(join(dossier, sous));
        checks.push(...scripts.map((nom) => ici.script(nom, sous)));
        sources.push(`the scripts ${scripts.map((nom) => `\`${nom}\``).join(", ")} of \`${sous}/package.json\``);
      }
    }
    if (checks.length === 0) return { lu: false, raison: "no test command was found: no `test` script in a `package.json`, no `Cargo.toml`, `go.mod`, pytest configuration or `test` target in a `Makefile`" };
    return { lu: true, valeur: checks, source: sources.join("; ") };
  } catch (erreur) {
    return { lu: false, raison: message(erreur) };
  }
}

// Les zones : les workspaces du `package.json` racine, sinon les dossiers de code de premier niveau.
function lireLesZones(dossier: string): Trouvaille<string[]> {
  try {
    const racine = lirePackageJson(dossier, "package.json");
    const declares = racine?.workspaces;
    const motifs = Array.isArray(declares) ? declares : declares !== null && typeof declares === "object" && Array.isArray((declares as { packages?: unknown }).packages) ? (declares as { packages: unknown[] }).packages : [];
    const workspaces = motifs.filter((motif): motif is string => typeof motif === "string" && motif.trim() !== "");
    if (workspaces.length > 0) return { lu: true, valeur: workspaces.map((motif) => `${motif.replace(/\/+$/, "")}/`), source: "the `workspaces` of `package.json`" };
    const dossiers = dossiersDuPremierNiveau(dossier);
    if (dossiers.length === 0) return { lu: false, raison: "the repository has no first-level code folder to split into zones" };
    return { lu: true, valeur: dossiers.map((nom) => `${nom}/`), source: "the first-level folders of the repository" };
  } catch (erreur) {
    return { lu: false, raison: message(erreur) };
  }
}

// Ne lève pas : chaque chose se lit, ou dit pourquoi elle ne se lit pas.
export function lireLeDepot(dossier: string): LectureDuDepot {
  return { branche: lireLaBranche(dossier), checks: lireLesChecks(dossier), zones: lireLesZones(dossier) };
}
