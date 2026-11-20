// Les tests d'acceptation gelés (#3724) : le premier commit de la branche, qui
// porte le trailer `Acceptance-Tests: frozen`. Une livraison qui les change
// n'est pas refusée d'office (#3910) : la relecture lit leur diff depuis le gel
// et le juge comme un constat bloquant. Le contrôle lit l'historique du
// worktree de la livraison, sans cook ni modèle.
import { execFileSync } from "../sans-invite.ts";

const git = (worktree: string, ...args: string[]) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });

const fichiersDe = (worktree: string, commit: string) => git(worktree, "diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", "-z", commit).split("\0").filter(Boolean);

// Le hash du commit des tests gelés : le premier commit que la livraison ajoute
// à la base, sans les fusions, s'il porte le trailer ; null sinon. Lève si
// l'historique ne se lit pas.
export function commitDesTestsGeles(worktree: string, base: string): string | null {
  const sortie = git(worktree, "log", "--reverse", "--topo-order", "--no-merges", "--format=%H%x00%(trailers:key=Acceptance-Tests,valueonly,unfold,separator=%x2C)%x01", `${base}..HEAD`);
  const [premier = ""] = sortie.split("\x01").map((bloc) => bloc.trim()).filter(Boolean);
  const [commit = "", gel = ""] = premier.split("\x00");
  return gel.split(",").some((valeur) => valeur.trim() === "frozen") ? commit.trim() : null;
}

// Les fichiers des tests gelés de la livraison : ceux du premier commit de la
// branche s'il porte le trailer, aucun sinon (#3740, #3741). Lève si
// l'historique ne se lit pas.
export function fichiersGeles(worktree: string, base: string): string[] {
  const gele = commitDesTestsGeles(worktree, base);
  return gele === null ? [] : fichiersDe(worktree, gele);
}

// Ce que la livraison change à ses tests gelés depuis le gel : les fichiers que
// la tête ne porte plus tels que le gel les a laissés — changés, renommés ou
// retirés —, et leur diff. Aucun : rien n'est gelé, ou rien n'a bougé ; un test
// changé puis rendu tel quel n'a pas bougé. Lève si l'historique ne se lit pas.
export function testsGelesTouches(worktree: string, base: string): { fichiers: string[]; diff: string } {
  const gele = commitDesTestsGeles(worktree, base);
  if (gele === null) return { fichiers: [], diff: "" };
  const geles = fichiersDe(worktree, gele);
  if (geles.length === 0) return { fichiers: [], diff: "" };
  const fichiers = git(worktree, "diff", "--name-only", "--no-renames", "-z", gele, "HEAD", "--", ...geles).split("\0").filter(Boolean);
  if (fichiers.length === 0) return { fichiers, diff: "" };
  return { fichiers, diff: git(worktree, "diff", "--no-renames", "--no-color", gele, "HEAD", "--", ...fichiers) };
}
