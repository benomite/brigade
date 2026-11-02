// La relecture et le merge d'une PR quand GitHub est le seul état de la cuisine
// (`docs/superpowers/specs/2026-11-02-github-only-state.md`). N'importe quelle
// station relit une PR — pas seulement celle qui l'a cuisinée — et pose son
// verdict en commentaire sur la PR ; n'importe quelle station la merge, sous la
// règle de GitHub « la branche à jour de sa base avant le merge ». Aucune
// station n'est à part : rien ici ne lit l'identité de celle qui appelle.
//
// Le verdict est un commentaire, pas une review de GitHub : les stations
// tournent sous le compte du chef, qui a ouvert la PR, et GitHub refuse à
// l'auteur d'une PR de l'approuver. La branche d'intégration n'exige d'ailleurs
// aucune approbation (`proteger-branche.ts`).
//
// Une branche en retard ne se merge pas : GitHub est prié de la mettre à jour,
// et c'est tout. Le merge part sous la tête lue : si elle a bougé entre-temps,
// ou que la base a avancé, GitHub le refuse lui-même.
//
// Ce module ne lance rien : il parle à GitHub par le port qu'on lui donne, que
// `github.ts`, seul module qui lance `gh`, a à servir.
import { DE_CONFIANCE } from "../alimenter.ts";
import type { Commentaire, GitHub } from "../github.ts";

// Ce qu'une station dit d'une PR qu'elle a relue.
export type Verdict = "approuve" | "a-reprendre";
export type Avis = { verdict: Verdict; corps: string };

// Une PR telle que la fusion la lit. `etatDeFusion` : le `mergeable_state` de
// GitHub, tel quel (`clean`, `behind`, `blocked`, `dirty`, `unknown`…).
export type PRDeLaFusion = { number: number; sha: string; state: "open" | "closed"; merged: boolean; etatDeFusion: string };

// Ce dont la fusion a besoin de GitHub, sous le compte de la station qui
// appelle — quelle qu'elle soit. Une PR est une issue : ses commentaires se
// lisent et s'écrivent comme ceux d'une issue.
export type GitHubDeLaFusion = Pick<GitHub, "commentaires" | "commenter" | "merger"> & {
  pr(numero: number): Promise<PRDeLaFusion>;
  // Demande à GitHub de mettre la branche à jour de sa base, si sa tête est
  // encore `sha` (`PUT pulls/<n>/update-branch`, `expected_head_sha`).
  mettreAJour(numero: number, sha: string): Promise<void>;
};

// `mergee` : la PR l'est — maintenant, ou déjà par une autre station.
// `mise-a-jour-demandee` : la branche était en retard, GitHub a été prié de la
// mettre à jour ; le merge se retente sur la nouvelle tête.
export type Fusion = { issue: "mergee" } | { issue: "mise-a-jour-demandee" } | { issue: "refusee"; motif: string };

// Les `mergeable_state` d'une branche à jour de sa base, que rien n'empêche de
// merger. `behind` est en retard ; `dirty`, en conflit ; `blocked`, retenue
// par la protection ; `unknown`, GitHub ne l'a pas encore calculé ; `draft`
// n'est pas à merger.
const A_JOUR = new Set(["clean", "unstable", "has_hooks"]);

const MARQUE = /^<!-- brigade:verdict (approuve|a-reprendre) (\S+) -->/;

// Le commentaire qui porte le verdict, sur la tête relue.
export function commentaireDeVerdict(sha: string, avis: Avis): string {
  return `<!-- brigade:verdict ${avis.verdict} ${sha} -->\n${avis.corps}`;
}

// Pose sur la PR le verdict de la station qui l'a relue, sur la tête qu'elle a
// relue. Elle peut être n'importe laquelle, celle qui a cuisiné comprise.
export async function relire(pr: { number: number; sha: string }, avis: Avis, github: GitHubDeLaFusion): Promise<void> {
  await github.commenter(pr.number, commentaireDeVerdict(pr.sha, avis));
}

// Le dernier verdict posé sur la PR, ou null. Seul un compte du dépôt fait foi :
// tout le monde peut commenter une PR publique.
export function dernierVerdict(commentaires: Commentaire[]): { verdict: Verdict; sha: string } | null {
  let dernier: { verdict: Verdict; sha: string } | null = null;
  for (const commentaire of commentaires) {
    const lu = MARQUE.exec(commentaire.body);
    if (lu && DE_CONFIANCE.includes(commentaire.association)) dernier = { verdict: lu[1] as Verdict, sha: lu[2] as string };
  }
  return dernier;
}

// Vrai si le dernier verdict est une approbation. Il vaut pour la PR jusqu'au
// suivant, quelle que soit sa tête : la mise à jour depuis la base en change
// la tête sans rien changer à ce qui a été relu.
export function approuvee(commentaires: Commentaire[]): boolean {
  return dernierVerdict(commentaires)?.verdict === "approuve";
}

const lire = (pr: { number: number }, github: GitHubDeLaFusion) => Promise.all([github.pr(pr.number), github.commentaires(pr.number)]);

// Vrai seulement si la PR est ouverte, approuvée, et que GitHub dit sa branche
// à jour de sa base.
export async function fusionnable(pr: { number: number }, github: GitHubDeLaFusion): Promise<boolean> {
  const [lue, commentaires] = await lire(pr, github);
  return lue.state === "open" && !lue.merged && A_JOUR.has(lue.etatDeFusion) && approuvee(commentaires);
}

// Merge la PR si elle est fusionnable, au compte de la station qui appelle. En
// retard, elle ne se merge pas : GitHub est prié de la mettre à jour.
export async function fusionner(pr: { number: number }, github: GitHubDeLaFusion): Promise<Fusion> {
  const [lue, commentaires] = await lire(pr, github);
  if (lue.merged) return { issue: "mergee" };
  if (lue.state !== "open") return { issue: "refusee", motif: "PR fermée sans merge" };
  if (!approuvee(commentaires)) return { issue: "refusee", motif: "PR non approuvée" };
  if (lue.etatDeFusion === "behind") {
    await github.mettreAJour(lue.number, lue.sha);
    return { issue: "mise-a-jour-demandee" };
  }
  if (!A_JOUR.has(lue.etatDeFusion)) return { issue: "refusee", motif: `GitHub ne dit pas la branche prête à merger (${lue.etatDeFusion})` };
  const merge = await github.merger(lue.number, lue.sha);
  return merge.fait ? { issue: "mergee" } : { issue: "refusee", motif: merge.motif };
}
