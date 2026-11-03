// La relecture et le merge d'une PR quand GitHub est le seul état de la cuisine
// (spec `docs/superpowers/specs/2026-11-02-github-only-state.md`). Aucune
// station n'est à part : celle qui a cuisiné, une autre, n'importe laquelle
// relit la PR et y poste son verdict ; n'importe laquelle la merge. Ce module
// ne lit et n'écrit que par le client de GitHub qu'on lui passe, et ne demande
// à personne qui il est.
//
// Le verdict est un commentaire sur la PR, marqué de la station qui l'a rendu
// et de la tête qu'elle a jugée. Le plus récent l'emporte, d'où qu'il vienne :
// - une approbation tient tant qu'aucun verdict ne la suit, même si la tête
//   bouge — mettre la branche à jour de sa base change la tête, et ne demande
//   pas une relecture de plus ;
// - un refus tient pour la tête qu'il a jugée : une livraison nouvelle (une
//   autre tête) se relit.
//
// Le merge suit la règle de GitHub « branche à jour avant de merger » : une
// PR approuvée dont la branche est en retard sur sa base, on demande à GitHub
// de la mettre à jour, et on ne la merge pas. Une fois à jour, la station qui
// passe la merge. Si la base bouge entre la lecture et le merge, c'est GitHub
// qui refuse : le refus est rendu tel quel, la station suivante relira la PR.
import { DE_CONFIANCE } from "../alimenter.ts";
import type { Merge, PR } from "../github.ts";

export type Verdict = "approve" | "request-changes";

// Le nom d'une station, tel qu'il s'écrit dans le marqueur.
const NOM_DE_STATION = /^[A-Za-z0-9._/-]+$/;
const MARQUE_DE_VERDICT = /^<!-- brigade:verdict station=([A-Za-z0-9._/-]+) verdict=(approve|request-changes) sha=([0-9a-f]+) -->/;

// Un commentaire de la PR tel que la relecture le lit : `id` est celui que
// GitHub lui donne, croissant avec l'ordre où il les reçoit.
export type CommentaireDeVerdict = { id: number; body: string; association: string; createdAt: string };

// Ce que la relecture et le merge demandent au client de GitHub, et rien de
// plus : pas d'identité, pas de station principale.
export type GitHubDeLaFusion = {
  // Les commentaires de la PR (une PR est une issue pour GitHub).
  commentaires(numero: number): Promise<CommentaireDeVerdict[]>;
  commenter(numero: number, corps: string): Promise<void>;
  // Demande à GitHub de mettre la branche de la PR à jour de sa base, à
  // condition que sa tête soit encore `sha`.
  mettreAJour(numero: number, sha: string): Promise<void>;
  // Merge la PR, à condition que sa tête soit encore `sha`.
  merger(numero: number, sha: string): Promise<Merge>;
};

// La PR telle que la relecture et le merge la lisent.
export type PRAFusionner = Pick<PR, "number" | "sha" | "state" | "merged" | "enRetard">;

// Le verdict qui fait foi : la station qui l'a rendu, sur quelle tête.
export type VerdictRendu = { station: string; verdict: Verdict; sha: string; commentaire: number };

// Ce que rend le jugement d'une PR : le verdict, et ce qui le motive.
export type Jugement = { verdict: Verdict; motif: string };

export type ContexteDeRelecture = { github: GitHubDeLaFusion; station: string; juger(pr: PRAFusionner): Promise<Jugement> };

export const corpsDeVerdict = (station: string, sha: string, { verdict, motif }: Jugement) =>
  `<!-- brigade:verdict station=${station} verdict=${verdict} sha=${sha} -->\n${verdict === "approve" ? "Approved" : "Changes requested"} by station \`${station}\`.${motif === "" ? "" : `\n\n${motif}`}`;

// Le verdict le plus récent de la PR, dans quelque ordre qu'on lise ses
// commentaires ; null si aucun. Seul le dépôt rend un verdict.
export function dernierVerdict(commentaires: CommentaireDeVerdict[]): VerdictRendu | null {
  let dernier: (VerdictRendu & { instant: number }) | null = null;
  for (const commentaire of commentaires) {
    if (!DE_CONFIANCE.includes(commentaire.association)) continue;
    const instant = Date.parse(commentaire.createdAt);
    const marque = MARQUE_DE_VERDICT.exec(commentaire.body);
    if (!marque || Number.isNaN(instant)) continue;
    if (dernier !== null && (instant < dernier.instant || (instant === dernier.instant && commentaire.id < dernier.commentaire))) continue;
    dernier = { station: marque[1] as string, verdict: marque[2] as Verdict, sha: marque[3] as string, commentaire: commentaire.id, instant };
  }
  if (dernier === null) return null;
  const { instant: _instant, ...verdict } = dernier;
  return verdict;
}

// La PR est approuvée : son dernier verdict l'approuve, quelle que soit la
// station qui l'a rendu.
export const approuvee = (commentaires: CommentaireDeVerdict[]) => dernierVerdict(commentaires)?.verdict === "approve";

// La PR se merge : ouverte, approuvée, et GitHub dit sa branche à jour de sa base.
export const fusionnable = (pr: PRAFusionner, commentaires: CommentaireDeVerdict[]) =>
  pr.state === "open" && !pr.merged && !pr.enRetard && approuvee(commentaires);

// Relit la PR pour la station, quelle qu'elle soit, et poste son verdict.
// N'écrit rien si la PR n'est plus ouverte, si elle est déjà approuvée, ou si
// sa tête a déjà été refusée : rend alors le verdict qui fait foi (null pour
// une PR close).
export async function relire(pr: PRAFusionner, { github, station, juger }: ContexteDeRelecture): Promise<VerdictRendu | null> {
  if (!NOM_DE_STATION.test(station)) throw new Error(`station name not usable in a verdict comment: ${JSON.stringify(station)}`);
  if (pr.state !== "open" || pr.merged) return null;
  const dejaRendu = dernierVerdict(await github.commentaires(pr.number));
  if (dejaRendu !== null && (dejaRendu.verdict === "approve" || dejaRendu.sha === pr.sha)) return dejaRendu;
  const jugement = await juger(pr);
  await github.commenter(pr.number, corpsDeVerdict(station, pr.sha, jugement));
  return dernierVerdict(await github.commentaires(pr.number));
}

// `mergee` : GitHub a mergé. `mise-a-jour` : la branche était en retard, sa
// mise à jour est demandée, rien n'est mergé. `non-approuvee` : rien n'est
// écrit. `close` : la PR n'est plus ouverte. `refusee` : GitHub a refusé le
// merge, et dit pourquoi.
export type Fusion = { issue: "mergee" | "mise-a-jour" | "non-approuvee" | "close" } | { issue: "refusee"; motif: string };

// Merge la PR si elle est fusionnable, depuis la station qui appelle, quelle
// qu'elle soit. En retard sur sa base, la PR approuvée est mise à jour, jamais
// mergée.
export async function fusionner(pr: PRAFusionner, github: GitHubDeLaFusion): Promise<Fusion> {
  if (pr.state !== "open" || pr.merged) return { issue: "close" };
  if (!approuvee(await github.commentaires(pr.number))) return { issue: "non-approuvee" };
  if (pr.enRetard) {
    await github.mettreAJour(pr.number, pr.sha);
    return { issue: "mise-a-jour" };
  }
  const merge = await github.merger(pr.number, pr.sha);
  return merge.fait ? { issue: "mergee" } : { issue: "refusee", motif: merge.motif };
}
