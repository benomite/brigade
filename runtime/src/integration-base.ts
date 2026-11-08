// L'intégration de la base côté station, avant un renvoi pour conflit : dans le
// worktree du cook, rapatrier la base puis la fusionner sans commiter. Un
// conflit reste dans le worktree, marqueurs compris, pour que le cook le
// résolve — les stations qui lui interdisent `git fetch` et `git merge` n'ont
// plus à le lui demander. Le lanceur de git est injecté.

export type SortieGit = { code: number; stdout: string; stderr: string };

// Lance `git <args>` dans `cwd`. Ne lève pas sur un code de sortie non nul.
export type LanceurGit = (args: string[], cwd: string) => Promise<SortieGit>;

export type IntegrationBase =
  // La base est fusionnée sans conflit, rien n'est commité : l'index porte la
  // fusion, le cook la commite. Si la branche contenait déjà la base, rien
  // n'est à fusionner et le worktree n'a pas bougé.
  | { etat: "propre" }
  // La fusion a buté : le worktree garde les marqueurs de conflit, la fusion
  // n'est ni commitée ni annulée.
  | { etat: "conflit"; fichiers: string[] }
  // Le fetch ou la fusion a échoué sans conflit (accès refusé, base inconnue…).
  // `etape` dit lequel ; `detail` rend la sortie d'erreur de git.
  | { etat: "echec"; etape: "fetch" | "merge"; detail: string };

function detail(sortie: SortieGit): string {
  return (sortie.stderr.trim() || sortie.stdout.trim() || `git a rendu ${sortie.code}`);
}

export async function integrerLaBase(git: LanceurGit, worktree: string, base: string): Promise<IntegrationBase> {
  const fetch = await git(["fetch", "origin", base], worktree);
  if (fetch.code !== 0) return { etat: "echec", etape: "fetch", detail: detail(fetch) };

  const merge = await git(["merge", "--no-commit", "--no-ff", "FETCH_HEAD"], worktree);
  if (merge.code === 0) return { etat: "propre" };

  // Un code non nul peut être un conflit ou un vrai échec : les fichiers non
  // fusionnés les distinguent. Si on ne peut pas les lire, on ne devine pas.
  const nonFusionnes = await git(["diff", "--name-only", "--diff-filter=U"], worktree);
  if (nonFusionnes.code !== 0) return { etat: "echec", etape: "merge", detail: detail(merge) };
  const fichiers = nonFusionnes.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (fichiers.length === 0) return { etat: "echec", etape: "merge", detail: detail(merge) };
  return { etat: "conflit", fichiers };
}
