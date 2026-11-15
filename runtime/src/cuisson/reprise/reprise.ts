// La reprise d'un ticket dont le cook a été tué par la garde d'inactivité
// (#3649). Jusqu'ici, sa branche partait avec son worktree : le run suivant
// repartait de la base, et payait à nouveau les tours et les jetons du
// premier (53-github-928d9bb8 après 53-github-a98294d8). Désormais, ce que le
// cook a laissé — ses commits, et ce qu'il n'avait pas commité — est commité
// sur sa branche sous `SUJET_DE_REPRISE`, et la branche reste : le run suivant
// en repart (`depot.reprendre`) et sa consigne lui dit ce qu'il y trouve.
//
// Une tête qui porte ce sujet n'est pas une livraison, comme la sauvegarde
// d'avant une relance (#2586) : un cook la reprend, la pass ne la juge pas.

// Le sujet du commit qui marque le travail d'un cook tué par la garde
// d'inactivité. Il porte ce que le cook n'avait pas commité, ou rien.
export const SUJET_DE_REPRISE = "brigade: work in progress saved after the idle guard stopped the cook (#3649)";

export const estUneRepriseDeGarde = (sujet: string | null | undefined): boolean => sujet === SUJET_DE_REPRISE;

// Les arrêts dont le travail est gardé pour le run suivant : la garde
// d'inactivité seule. Un cook qui a fini, ou que d'autres plafonds ont
// arrêté, laisse sa branche comme avant.
export const gardeLeTravail = (conclusion: string): boolean => conclusion === "guard:idle";

// Ce que la station sait faire de la branche d'un cook, sous les noms du dépôt.
export type DepotDeReprise = {
  recolter(worktree: string, branche: string, sujet?: string, vide?: boolean): string | null;
  intact(worktree: string): boolean;
  commits(branche: string): number;
  tete?(branche: string): string;
};

// Marque sur sa branche le travail du cook tué par la garde d'inactivité.
// `avant` : la tête que le cook a reprise, null pour une branche neuve. Rend
// vrai si la branche porte désormais ce travail et doit rester ; faux si le
// cook n'y a rien laissé — le ticket repart alors comme avant. Un échec (le
// worktree n'est plus sur sa branche, un commit refusé) lève : c'est à
// l'appelant de le dire, et de retirer la branche comme avant.
export function marquerLeTravail(depot: DepotDeReprise, worktree: string, branche: string, avant: string | null): boolean {
  const avance = avant === null ? depot.commits(branche) > 0 : depot.tete?.(branche) !== avant;
  if (!avance && depot.intact(worktree)) return false;
  depot.recolter(worktree, branche, SUJET_DE_REPRISE, true);
  return true;
}

// Combien de commits du run précédent la consigne cite, des plus récents.
const COMMITS_CITES = 20;

type Git = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

// Les commits que la branche porte en plus de la base, des plus récents :
// `<sha court> <sujet>`. Null si `git` ne les rend pas — la consigne dit alors
// au cook de les lire lui-même.
export async function commitsDuRunPrecedent(git: Git | undefined, worktree: string, base: string): Promise<string[] | null> {
  if (git === undefined) return null;
  try {
    const lu = await git(["log", "--no-merges", `--max-count=${COMMITS_CITES}`, "--format=%h %s", `origin/${base}..HEAD`], worktree);
    if (lu.code !== 0) return null;
    return lu.stdout.split("\n").filter((ligne) => ligne.trim() !== "");
  } catch {
    return null;
  }
}

// La section de la consigne du run qui reprend : la branche, les commits du
// run précédent, et le commit où la garde a rangé ce qu'il n'avait pas commité.
export function consigneDuRunPrecedent(branche: string, commits: string[] | null): string {
  const liste =
    commits === null
      ? `The station could not list its commits: read them with \`git log\`.`
      : `Its commits on this branch, most recent first:\n\n${commits.map((commit) => `- ${commit}`).join("\n")}`;
  return `## Work left by the previous run\n\nThe previous run on this ticket was stopped by the idle guard before delivering. You are on its branch, \`${branche}\`, with its commits kept. ${liste}\n\nWhat it had not committed when it was stopped is in the last commit, \`${SUJET_DE_REPRISE}\` (empty if it had committed everything). Read what it did (\`git log\`, \`git show HEAD\`) and continue from where it stopped, do not start over.`;
}
