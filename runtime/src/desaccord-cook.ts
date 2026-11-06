// Le désaccord d'un cook renvoyé (#2592) : quand il juge les remarques de la
// relecture déjà traitées, ou fausses, il le dit en réponse sur la PR au lieu
// de s'arrêter sans un mot. Son arrêt sans livraison n'est alors pas un échec,
// mais un désaccord : la livraison repart en pass telle quelle, et la pass lit
// la réponse et la juge — elle l'accepte, ou renvoie avec ses raisons.
//
// Le cook n'a aucun accès à GitHub : il écrit sa réponse dans son dernier
// message, entre deux balises, et c'est la station qui la poste sur la PR,
// sous un marqueur qui dit la tête qu'elle concerne.
import { DE_CONFIANCE } from "./alimenter.ts";
import { dernierVerdict } from "./github-etat/fusion.ts";

export const BALISE_DE_REPONSE = "reponse-pr";
const MARQUE_DE_REPONSE = /^<!-- brigade:reponse-cook sha=([0-9a-f]+) -->/;

// Un commentaire de la PR, dans l'ordre où GitHub les rend.
type CommentaireLu = { body: string; association: string; createdAt: string };

// Ce que le brief d'un cook renvoyé lui dit du désaccord.
export function consigneDuDesaccord(pr: number): string {
  const [ouvre, ferme] = [`<${BALISE_DE_REPONSE}>`, `</${BALISE_DE_REPONSE}>`];
  return [
    "## If a remark is already addressed, or wrong",
    "",
    `The review's remarks are on PR #${pr}. If you judge one of them already addressed by your delivery, or wrong, do not end silently: reply on the PR. You have no access to GitHub: write your reply in your last message between ${ouvre} and ${ferme}, bare tags, once, and the station posts it on PR #${pr}. Answer remark by remark: where it is already addressed, or why it does not hold.`,
    "",
    "If you then add nothing to the branch, your delivery goes back to the pass as it is, and the pass judges your reply: it accepts it, or sends the delivery back with its reasoning. A stop that adds nothing without such a reply counts as a failed cook.",
  ].join("\n");
}

// La réponse que le dernier message du cook porte entre ses balises, ou null.
export function reponseDuMessage(message: string | null): string | null {
  const lue = new RegExp(`<${BALISE_DE_REPONSE}>([\\s\\S]*?)</${BALISE_DE_REPONSE}>`).exec(message ?? "")?.[1]?.trim();
  return lue === undefined || lue === "" ? null : lue;
}

// Le commentaire que la station poste sur la PR pour le cook, sur la tête `sha`.
export const corpsDeLaReponse = (sha: string, reponse: string) => `<!-- brigade:reponse-cook sha=${sha} -->\nThe cook replies to the review's remarks on \`${sha.slice(0, 7)}\`:\n\n${reponse}`;

// Les réponses du cook sur la tête `sha`, avec leur rang parmi les commentaires.
const reponsesSur = (commentaires: CommentaireLu[], sha: string) =>
  commentaires.flatMap((commentaire, rang) => {
    if (!DE_CONFIANCE.includes(commentaire.association) || MARQUE_DE_REPONSE.exec(commentaire.body)?.[1] !== sha) return [];
    return [{ rang, texte: commentaire.body.split("\n").slice(2).join("\n").trim() }];
  });

const verdictDe = (commentaires: CommentaireLu[]) => dernierVerdict(commentaires.map((commentaire, id) => ({ ...commentaire, id })));

// La réponse du cook sur la tête `sha` postée depuis le dernier verdict de la
// PR — le renvoi qu'elle conteste —, que la pass n'a donc pas encore jugée ;
// null s'il n'y en a pas. Sans verdict, toute réponse sur cette tête compte.
export function reponseDuCook(commentaires: CommentaireLu[], sha: string): string | null {
  const depuis = verdictDe(commentaires)?.commentaire ?? -1;
  return reponsesSur(commentaires, sha).filter(({ rang }) => rang > depuis).at(-1)?.texte ?? null;
}

// Un cook renvoyé qui s'arrête sans rien ajouter à la tête `sha` : un
// désaccord s'il a répondu sur la PR depuis le renvoi — la livraison repart en
// pass, rien ne compte parmi les échecs —, sinon l'échec `motif`, qui compte.
export function classerArret(commentaires: CommentaireLu[], sha: string, motif: string): { desaccord: string } | { echec: string } {
  const reponse = reponseDuCook(commentaires, sha);
  return reponse === null ? { echec: motif } : { desaccord: reponse };
}

// La consigne de la pass, avec la réponse du cook à juger, s'il y en a une.
export function avecLeDesaccord(consigne: string, reponse: string | null): string {
  if (reponse === null) return consigne;
  return [
    consigne,
    "",
    "## La réponse du cook à la relecture précédente",
    "",
    "Renvoyé sur ces remarques, le cook juge qu'elles sont déjà traitées, ou fausses, et il a répondu sur la PR plutôt que de changer la livraison. Juge sa réponse, remarque par remarque : si elle tient, la remarque tombe ; si elle ne tient pas, maintiens-la et dis pourquoi dans ton constat — c'est ce que le cook lira à son renvoi.",
    "",
    "```text",
    reponse.replaceAll("```", "'''"),
    "```",
  ].join("\n");
}

// Combien de renvois la tête `sha` peut porter sur l'issue : un, plus un par
// réponse du cook que la pass a jugée sur cette tête — un désaccord refusé
// renvoie la même tête, et ce renvoi compte comme les autres.
export function renvoisDeLaTete(commentaires: CommentaireLu[], sha: string): number {
  const verdict = verdictDe(commentaires);
  if (verdict === null || verdict.sha !== sha) return 1;
  return 1 + reponsesSur(commentaires, sha).filter(({ rang }) => rang < verdict.commentaire).length;
}
