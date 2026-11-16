// Les tests d'acceptation gelés (#3724) : le premier commit de la branche, qui
// porte le trailer `Acceptance-Tests: frozen`. Aucun commit suivant de la
// livraison ne les modifie, ne les renomme ni ne les retire — sauf un commit du
// manager portant `Amendment: #<issue>` (le ticket d'amendement). Le contrôle
// lit l'historique du worktree de la livraison, sans cook ni modèle.
import { execFileSync } from "../sans-invite.ts";

// Le motif de renvoi que la fiche du ticket énonce.
export const RAISON_GEL = "a frozen acceptance test was modified";

// L'auteur d'un commit du manager : son nom git, avec ou sans le `[bot]` d'une App GitHub.
const AUTEUR_MANAGER = /^manager(\[bot\])?$/i;
const AMENDEMENT = /^#\d+$/;

export type ViolationDuGel = { commit: string; fichiers: string[] };

const SEP_COMMIT = "\x01";
const SEP_CHAMP = "\x00";

const git = (worktree: string, ...args: string[]) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const fichiersDe = (worktree: string, commit: string) => git(worktree, "diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", "-z", commit).split("\0").filter(Boolean);

// Les commits que la livraison ajoute à la base, du plus ancien au plus récent,
// sans les fusions (la base fusionnée dans la branche n'est pas du cook).
// Un commit : son hash, son auteur, et les valeurs de ses deux trailers.
function commitsDeLaLivraison(worktree: string, base: string) {
  const format = ["%H", "%an", "%(trailers:key=Acceptance-Tests,valueonly,unfold,separator=%x2C)", "%(trailers:key=Amendment,valueonly,unfold,separator=%x2C)"].join("%x00");
  const sortie = git(worktree, "log", "--reverse", "--topo-order", "--no-merges", `--format=${format}%x01`, `${base}..HEAD`);
  return sortie
    .split(SEP_COMMIT)
    .map((bloc) => bloc.replace(/^\n/, ""))
    .filter((bloc) => bloc !== "")
    .map((bloc) => {
      const [commit = "", auteur = "", gel = "", amendement = ""] = bloc.split(SEP_CHAMP).map((champ) => champ.trim());
      return { commit, auteur, gele: gel.split(",").some((valeur) => valeur.trim() === "frozen"), amendement: amendement.split(",").map((valeur) => valeur.trim()).filter(Boolean) };
    });
}

// Les commits qui touchent un fichier gelé sans y avoir droit. Vide : aucun
// commit gelé sur la branche (rien à garder), ou le gel est tenu. Lève si
// l'historique ne se lit pas : l'appelant dit alors que le contrôle n'a pas eu lieu.
export function violationsDuGel(worktree: string, base: string): ViolationDuGel[] {
  const [premier, ...suivants] = commitsDeLaLivraison(worktree, base);
  if (premier === undefined || !premier.gele) return [];
  const gelés = new Set(fichiersDe(worktree, premier.commit));
  const violations: ViolationDuGel[] = [];
  for (const suivant of suivants) {
    const touches = fichiersDe(worktree, suivant.commit).filter((fichier) => gelés.has(fichier));
    if (touches.length === 0) continue;
    if (AUTEUR_MANAGER.test(suivant.auteur) && suivant.amendement.some((valeur) => AMENDEMENT.test(valeur))) continue;
    violations.push({ commit: suivant.commit, fichiers: touches });
  }
  return violations;
}

// Le motif du renvoi, ou null si le gel est tenu.
export function motifDuGel(violations: readonly ViolationDuGel[]): string | null {
  if (violations.length === 0) return null;
  const fichiers = [...new Set(violations.flatMap((violation) => violation.fichiers))];
  return [`${RAISON_GEL}.`, "", "A commit after the frozen acceptance tests (trailer `Acceptance-Tests: frozen`) changed, renamed or removed:", ...fichiers.map((fichier) => `- \`${fichier}\``), "", "Restore them: only a commit of the manager carrying `Amendment: #<issue>` may change a frozen test."].join("\n");
}
