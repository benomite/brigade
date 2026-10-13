// Ce que la fermeture lit du dépôt cible pour l'observer : les derniers merges
// de la branche d'intégration et ses fichiers, tels que le clone les connaît
// depuis son dernier rapatriement. Rien n'y est écrit ni rapatrié, et aucun
// verrou n'y est pris : les seules commandes de `git` jouées ici lisent, et
// `GIT_OPTIONAL_LOCKS=0` leur interdit jusqu'au rafraîchissement de l'index. Un
// cook qui commite ou une pass qui merge ne l'attendent donc jamais.
import { execFileSync } from "node:child_process";
import { ConfigInvalide } from "../runtime.ts";

// Les seules commandes de `git` de l'observation : aucune n'écrit.
type Lecture = "rev-parse" | "log" | "ls-tree" | "cat-file";

// Une garde : `git` ne répond pas, l'observation le dit au lieu d'attendre.
const DELAI_MS = 120_000;
const TAMPON = 1024 ** 3;
// Au-delà, un fichier n'est pas lu : du généré, pas du code qu'on range.
export const TAILLE_MAX = 1_000_000;

// Un merge de la branche d'intégration, et ce qu'il lui a apporté : les lignes
// ajoutées et retirées, comptées contre son premier parent.
export type Merge = { sha: string; at: string; ajoute: number; retire: number };
export type Texte = { chemin: string; texte: string };
// `merges` : le plus récent d'abord. `textes` : les fichiers de la branche qui
// se lisent comme du texte. `ecartes` : ceux qui dépassent TAILLE_MAX.
export type Depot = { ref: string; sha: string; merges: Merge[]; textes: Texte[]; ecartes: number };

// Le dépôt est là, et `git` n'a pas su le lire.
export class DepotIllisible extends Error {}

export function lireDepot(clone: string, base: string, env: NodeJS.ProcessEnv, combien = 100): Depot {
  const git = (commande: Lecture, args: string[], entree?: string): Buffer =>
    execFileSync("git", [commande, ...args], {
      cwd: clone,
      env: { ...env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: DELAI_MS,
      maxBuffer: TAMPON,
      input: entree,
      stdio: [entree === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  const lire = (commande: Lecture, args: string[], entree?: string): Buffer => {
    try {
      return git(commande, args, entree);
    } catch (erreur) {
      const { stderr, message } = erreur as { stderr?: Buffer; message?: string };
      throw new DepotIllisible(`git ${commande} : ${String(stderr ?? "").trim() || message || "échec"}`);
    }
  };

  try {
    git("rev-parse", ["--git-dir"]);
  } catch {
    throw new ConfigInvalide(`BRIGADE_REPO_DIR invalide : « ${clone} » n'est pas un dépôt git`);
  }
  const ref = `origin/${base}`;
  let sha: string;
  try {
    sha = git("rev-parse", ["--verify", "--quiet", `${ref}^{commit}`]).toString().trim();
  } catch {
    throw new DepotIllisible(`la branche \`${ref}\` n'est pas dans le clone « ${clone} » — l'observation lit ce qu'il a rapatrié, et ne rapatrie rien`);
  }

  // Un merge par bloc : son entête derrière un octet nul, puis une ligne par
  // fichier — ajouté, retiré, chemin. Un fichier binaire n'a pas de lignes.
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

  // Les fichiers de la branche : `<mode> blob <sha> <taille>\t<chemin>`. Ni
  // lien symbolique, ni sous-module.
  const fichiers = lire("ls-tree", ["-r", "-l", "-z", sha])
    .toString()
    .split("\0")
    .flatMap((ligne) => {
      const [meta = "", chemin = ""] = ligne.split("\t");
      const [mode, type, objet = "", taille] = meta.split(/ +/);
      return type === "blob" && mode !== "120000" ? [{ chemin, objet, taille: Number(taille) }] : [];
    });
  const lus = fichiers.filter(({ taille }) => taille <= TAILLE_MAX);
  // Tous leurs contenus d'un seul process : `<sha> blob <taille>\n<contenu>\n`.
  const contenus = lus.length === 0 ? Buffer.alloc(0) : lire("cat-file", ["--batch"], `${lus.map(({ objet }) => objet).join("\n")}\n`);
  const textes: Texte[] = [];
  let curseur = 0;
  for (const { chemin, objet } of lus) {
    const fin = contenus.indexOf(10, curseur);
    const [, type, taille] = contenus.subarray(curseur, Math.max(fin, curseur)).toString().split(" ");
    if (fin < 0 || type !== "blob") throw new DepotIllisible(`git cat-file : « ${chemin} » (${objet}) ne se lit pas`);
    const contenu = contenus.subarray(fin + 1, fin + 1 + Number(taille));
    curseur = fin + 2 + Number(taille);
    // Un octet nul : ce n'est pas du texte.
    if (!contenu.includes(0)) textes.push({ chemin, texte: contenu.toString("utf8") });
  }
  return { ref, sha, merges, textes, ecartes: fichiers.length - lus.length };
}
