// La réponse du chef à une validation, donnée sur le ticket lui-même (#3616,
// épique #3612) : plus d'issue de validation à part. La cuisine pose sa
// question en commentaire du ticket (`marques.ts`, `questionDuCorps`) ; le
// chef y répond par un commentaire, sur github.com, GitHub Mobile ou le mail
// de la notification.
//
// La pass lit cette réponse à chaque tour, pour chaque livraison qu'elle
// retient pour le chef (`brigade-github.ts`, `pourLeChef`) — seule une telle
// livraison porte une question —, avant de retenter son merge :
//
// - Une question est en attente pour la PR si c'est la dernière posée pour
//   elle et qu'après elle, aucune réponse n'est gardée pour sa PR et son commit
//   et aucun renvoi n'a suivi — un renvoi, c'est un cook qui change la
//   livraison : la question n'a plus d'objet.
// - La réponse est le premier commentaire après la question qui fait foi
//   (`DE_CONFIANCE`) et n'est pas de la cuisine (`duBot` : un bot, ou une ligne
//   de marque `<!-- brigade:`), citation (`>`) ôtée ; vide, il ne répond pas.
//   Un commentaire du chef qui ne suit aucune question en attente n'est rien.
// - Il valide si son texte est l'un de `VALIDE` (casse, espaces et ponctuation
//   finale ignorés) : la réponse est gardée (`validated`), et la pass, qui voit
//   la réponse tenir (`validation-design.ts`, `validationQuiTient`), merge la
//   PR. Tout autre texte la renvoie à un cook, ce texte comme ce qu'il faut
//   changer (`renvoyerAuCook`), puis la réponse est gardée (`sent-back`).
//
// Le renvoi part avant que la réponse soit gardée : gardée sans renvoi, la
// livraison resterait en pass sans merge ni cook. Un renvoi posé dont la
// réponse ne s'écrit pas ne se rejoue pas : il suit la question, qui n'attend
// plus. Une lecture ou une écriture qui échoue lève : la pass le dit, ne merge
// pas, et relit au tour suivant.
import { DE_CONFIANCE } from "../alimenter.ts";
import { CHEF_TODO } from "../github-etat/etats.ts";
import type { GitHub } from "../github.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { duBot, separerLaCitation } from "../reponse-par-commentaire/reponse-par-commentaire.ts";
import { livraisonDe, renvoyerAuCook } from "../validation-design/validation-design.ts";
import { marqueDeReponse, questionDuCorps, reponseDuCorps, type Reponse } from "./marques.ts";

// Les mots qui valident ; tout autre texte renvoie la livraison à un cook.
const VALIDE = ["validate", "validated", "valid", "approve", "approved", "lgtm", "ok", "okay", "yes", "merge", "merge it", "ship it", "👍", "✅", "oui", "valide", "validé", "validée", "valider"];

const normaliser = (texte: string) =>
  texte
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!\s]+$/, "");

const valide = (texte: string) => VALIDE.includes(normaliser(texte));

// Un commentaire du ticket tel que la pass le lit : son auteur, si le client le dit.
type Commentaire = { body: string; association: string; author?: string };

const sur = (commentaire: Commentaire) => DE_CONFIANCE.includes(commentaire.association);

// La réponse gardée sur le ticket pour cette PR et ce commit ; null s'il n'y en a pas.
function reponseGardee(commentaires: readonly Commentaire[], pr: number, sha: string): Reponse | null {
  for (const commentaire of commentaires.toReversed()) {
    const lue = sur(commentaire) ? reponseDuCorps(commentaire.body) : null;
    if (lue !== null && lue.pr === pr && lue.sha === sha) return lue.reponse;
  }
  return null;
}

// La question qui attend encore le chef pour `pr` : son commit et son rang
// dans les commentaires ; null s'il n'y en a pas.
function questionEnAttente(commentaires: readonly Commentaire[], pr: number): { sha: string; rang: number } | null {
  const rang = commentaires.findLastIndex((commentaire) => sur(commentaire) && questionDuCorps(commentaire.body)?.pr === pr);
  if (rang === -1) return null;
  const sha = questionDuCorps(commentaires[rang]?.body ?? "")?.sha ?? "";
  const apres = commentaires.slice(rang + 1).filter(sur);
  if (apres.some((commentaire) => commentaire.body.startsWith(MARQUE_DE_RENVOI))) return null;
  if (reponseGardee(apres, pr, sha) !== null) return null;
  return { sha, rang };
}

// La réponse du chef à la question en attente de `pr`, telle que le ticket la
// porte ; null tant qu'il n'a pas répondu, ou sans question en attente.
function reponseDuChef(commentaires: readonly Commentaire[], pr: number): { sha: string; reponse: "validated" } | { sha: string; reponse: "sent-back"; texte: string } | null {
  const question = questionEnAttente(commentaires, pr);
  if (question === null) return null;
  for (const commentaire of commentaires.slice(question.rang + 1)) {
    if (!sur(commentaire) || duBot({ ...commentaire, author: commentaire.author ?? "", createdAt: "" })) continue;
    const { reponse: texte } = separerLaCitation(commentaire.body);
    if (texte === "") continue;
    return valide(texte) ? { sha: question.sha, reponse: "validated" } : { sha: question.sha, reponse: "sent-back", texte };
  }
  return null;
}

export type GitHubDeLaReponse = Pick<GitHub, "commenter" | "delabelliser"> & { commentaires(numero: number): Promise<Commentaire[]> };

const renvoiDuChef = (ticket: number, pr: number, texte: string) => `The chef sent ${livraisonDe(ticket, pr)} back to a cook, answering its validation on this ticket — the chef asks for these changes:\n\n${texte}\n\nChange what is asked, and deliver.`;

// Agit sur la réponse du chef à la validation de la PR `pr` (sa tête `tete`),
// sur le ticket : `validated`, la réponse est gardée et la pass peut merger ;
// `sent-back`, la livraison repart à un cook avec le commentaire du chef, et
// la réponse est gardée ; null, rien à faire.
export async function agirSurLaReponse(github: GitHubDeLaReponse, ticket: number, pr: { number: number; sha: string }): Promise<Reponse | null> {
  const lue = reponseDuChef(await github.commentaires(ticket), pr.number);
  if (lue === null) return null;
  const court = `\`${lue.sha.slice(0, 7)}\``;
  if (lue.reponse === "validated") {
    await github.commenter(ticket, `${marqueDeReponse(pr.number, lue.sha, "validated")}\nValidated by the chef on this ticket, for ${livraisonDe(ticket, pr.number)} at ${court}: the pass merges it once its head is green.`);
    return "validated";
  }
  await renvoyerAuCook(github, ticket, pr.sha, renvoiDuChef(ticket, pr.number, lue.texte));
  // Répondue, sa carte n'attend plus le chef : le ticket n'est plus parqué pour lui, un cook le reprend (#4129).
  await github.delabelliser(ticket, CHEF_TODO);
  await github.commenter(ticket, `${marqueDeReponse(pr.number, lue.sha, "sent-back")}\nSent back to a cook by the chef on this ticket, for ${livraisonDe(ticket, pr.number)} at ${court}.`);
  return "sent-back";
}
