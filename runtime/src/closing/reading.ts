// What the closing reads of the target repository to observe it: the latest
// merges of the integration branch and its files, as the clone knows them since
// its last fetch. Nothing is written or fetched there, and no lock is taken:
// the only `git` commands run here read, and `GIT_OPTIONAL_LOCKS=0` forbids
// them even refreshing the index. A cook that commits or a pass that merges
// never waits for it.
import { execFileSync } from "../sans-invite.ts";
import { ConfigInvalide } from "../runtime.ts";

// The only `git` commands of the closing: none writes.
type Lecture = "rev-parse" | "log" | "ls-tree" | "cat-file" | "diff";

// A guard: `git` does not answer, the observation says so instead of waiting.
const DELAI_MS = 120_000;
const TAMPON = 1024 ** 3;
// Beyond this, a file is not read: generated, not code to tidy.
export const TAILLE_MAX = 1_000_000;

// A merge of the integration branch, and what it brought to it: the lines
// added and removed, counted against its first parent.
export type Merge = { sha: string; at: string; ajoute: number; retire: number };
export type Texte = { chemin: string; texte: string };
// `merges`: the most recent first. `textes`: the branch's files that read as
// text. `ecartes`: those that exceed TAILLE_MAX.
export type Depot = { ref: string; sha: string; merges: Merge[]; textes: Texte[]; ecartes: number };

// The repository is there, and `git` could not read it.
export class DepotIllisible extends Error {}

const lancer = (cwd: string, env: NodeJS.ProcessEnv, commande: Lecture, args: string[], entree?: string): Buffer =>
  execFileSync("git", [commande, ...args], {
    cwd,
    env: { ...env, GIT_OPTIONAL_LOCKS: "0" },
    timeout: DELAI_MS,
    maxBuffer: TAMPON,
    input: entree,
    stdio: [entree === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });

// The lines a tree adds and removes relative to commit `since`: those of
// `jusqua`, or, without it, those of the working tree of `lieu` — committed or
// not. A binary file has no lines.
export function lignesChangees(lieu: string, env: NodeJS.ProcessEnv, since: string, jusqua?: string): { ajoute: number; retire: number } {
  let stats: string;
  try {
    stats = lancer(lieu, env, "diff", ["--numstat", "--no-renames", "--no-ext-diff", since, ...(jusqua === undefined ? [] : [jusqua]), "--"]).toString();
  } catch (erreur) {
    const { stderr, message } = erreur as { stderr?: Buffer; message?: string };
    throw new DepotIllisible(`git diff : ${String(stderr ?? "").trim() || message || "failure"}`);
  }
  const somme = (rang: 1 | 2) => stats.split("\n").reduce((total, stat) => total + (Number(/^(\d+|-)\t(\d+|-)\t/.exec(stat)?.[rang]) || 0), 0);
  return { ajoute: somme(1), retire: somme(2) };
}

// What the removal cap of a pass counts.
export const lignesRetirees = (lieu: string, env: NodeJS.ProcessEnv, since: string, jusqua?: string): number => lignesChangees(lieu, env, since, jusqua).retire;

// The tree of a commit, or null if the clone does not have it: two commits
// with the same one carry the same files, whatever their history says.
export function arbreDe(clone: string, env: NodeJS.ProcessEnv, commit: string): string | null {
  try {
    return lancer(clone, env, "rev-parse", ["--verify", "--quiet", `${commit}^{tree}`]).toString().trim() || null;
  } catch {
    return null;
  }
}

// `ref`: what is read — by default the integration branch as the clone fetched
// it; or a pass's branch, to see what it leaves.
export function lireDepot(clone: string, base: string, env: NodeJS.ProcessEnv, combien = 100, ref = `origin/${base}`): Depot {
  const git = (commande: Lecture, args: string[], entree?: string): Buffer => lancer(clone, env, commande, args, entree);
  const lire = (commande: Lecture, args: string[], entree?: string): Buffer => {
    try {
      return git(commande, args, entree);
    } catch (erreur) {
      const { stderr, message } = erreur as { stderr?: Buffer; message?: string };
      throw new DepotIllisible(`git ${commande} : ${String(stderr ?? "").trim() || message || "failure"}`);
    }
  };

  try {
    git("rev-parse", ["--git-dir"]);
  } catch {
    throw new ConfigInvalide(`BRIGADE_REPO_DIR invalid: “${clone}” is not a git repository`);
  }
  let sha: string;
  try {
    sha = git("rev-parse", ["--verify", "--quiet", `${ref}^{commit}`]).toString().trim();
  } catch {
    throw new DepotIllisible(`the branch \`${ref}\` is not in the clone “${clone}” — the observation reads what it has fetched, and fetches nothing`);
  }

  // One merge per block: its header after a null byte, then one line per
  // file — added, removed, path. A binary file has no lines.
  const merges = lire("log", ["--first-parent", "--merges", "-n", String(combien), "--diff-merges=first-parent", "-M", "--numstat", "--no-show-signature", "--format=%x00%H%x09%cI", sha])
    .toString()
    .split("\0")
    .slice(1)
    .map((bloc): Merge => {
      const [entete = "", ...stats] = bloc.split("\n");
      const [merge = "", at = ""] = entete.split("\t");
      const somme = (rang: 1 | 2) => stats.reduce((total, stat) => total + (Number(/^(\d+|-)\t(\d+|-)\t/.exec(stat)?.[rang]) || 0), 0);
      return { sha: merge, at, ajoute: somme(1), retire: somme(2) };
    });

  // The branch's files: `<mode> blob <sha> <size>\t<path>`. Neither symbolic
  // links nor submodules.
  const fichiers = lire("ls-tree", ["-r", "-l", "-z", sha])
    .toString()
    .split("\0")
    .flatMap((ligne) => {
      const [meta = "", chemin = ""] = ligne.split("\t");
      const [mode, type, objet = "", taille] = meta.split(/ +/);
      return type === "blob" && mode !== "120000" ? [{ chemin, objet, taille: Number(taille) }] : [];
    });
  const lus = fichiers.filter(({ taille }) => taille <= TAILLE_MAX);
  // All their contents in a single process: `<sha> blob <size>\n<content>\n`.
  const contenus = lus.length === 0 ? Buffer.alloc(0) : lire("cat-file", ["--batch"], `${lus.map(({ objet }) => objet).join("\n")}\n`);
  const textes: Texte[] = [];
  let curseur = 0;
  for (const { chemin, objet } of lus) {
    const fin = contenus.indexOf(10, curseur);
    const [, type, taille] = contenus.subarray(curseur, Math.max(fin, curseur)).toString().split(" ");
    if (fin < 0 || type !== "blob") throw new DepotIllisible(`git cat-file : “${chemin}” (${objet}) cannot be read`);
    const contenu = contenus.subarray(fin + 1, fin + 1 + Number(taille));
    curseur = fin + 2 + Number(taille);
    // A null byte: this is not text.
    if (!contenu.includes(0)) textes.push({ chemin, texte: contenu.toString("utf8") });
  }
  return { ref, sha, merges, textes, ecartes: fichiers.length - lus.length };
}
