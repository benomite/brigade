// La question que le manager pose au chef sur une épique avant de la découper (runtime/src/decoupage.ts, cas « asked » :
// `<!-- brigade:manager -->` et `<!-- brigade:question -->` en tête, « Manager — epic not split: a question. », la question,
// puis « Answer here, or edit the epic »), lue des commentaires de l'issue. Tant qu'aucune réponse ne la suit, l'épique attend
// le chef : sa carte est dans TODO, avec la question et ses choix en boutons (`A) …`, `B) …`), et le champ libre.
//
// Les boutons jouent `resume` : leur libellé est posté en commentaire sur l'issue (tableau-actions/answer-github.ts), et le
// manager lit l'épique de nouveau — aucun autre geste. Ce commentaire, ou celui de quiconque a la main sur le dépôt, est la
// réponse : la carte quitte TODO. Un commentaire plus récent du manager qui ne pose pas de question — l'épique est
// découpée, ou son découpage est illisible — la rend sans objet.
import { choiceDe, corpsDuChoice } from "../choice-de-question.ts";
import type { CardDuChef } from "./todo-github.ts";

export const SORTE_QUESTION_D_EPIC = "manager-epic-question";
export const EPIC_LABEL = "epic";

const DE_CONFIANCE = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MARQUE_DU_MANAGER = "<!-- brigade:manager -->";
const MARQUE_DE_LA_QUESTION = "<!-- brigade:question -->";
// Ce que la station écrit en prenant le ticket : un commentaire du chef qui n'est la réponse à rien.
const MARQUE_DE_TAKING = "<!-- brigade:manager-prise";
const ENTETE = /^\*\*Manager — epic not split: a question\.\*\*$/;
const PIED = /^Answer here, or edit the epic/;
const MARQUE = /^\s*<!--[\s\S]*?-->\s*$/;
const QUESTION = /\?\s*$/;

type Brut = Record<string, unknown>;
const corpsDe = (comment: Brut) => (typeof comment.body === "string" ? comment.body : "");

// La question du manager, sans ses marques, son en-tête ni son pied : ce que son découpage demande. Un commentaire qui n'a pas
// cette forme est repris en entier, sans ses marques.
function questionDuComment(corps: string): string {
  const paragraphes = corps
    .split(/\r?\n\s*\r?\n/)
    .map((paragraphe) => paragraphe.split("\n").filter((line) => !MARQUE.test(line)).join("\n").trim())
    .filter((paragraphe) => paragraphe !== "");
  const debut = paragraphes.findIndex((paragraphe) => ENTETE.test(paragraphe));
  const fin = paragraphes.findIndex((paragraphe, rang) => rang > debut && PIED.test(paragraphe));
  return (debut === -1 || fin === -1 ? paragraphes : paragraphes.slice(debut + 1, fin)).join("\n\n");
}

// La carte du chef que ces commentaires de l'issue d'une épique posent, du plus ancien au plus récent, tels que l'API de GitHub
// les rend — ou rien : aucune question, une réponse qui la suit, ou un commentaire du manager plus récent.
export function cardDeLaQuestionDEpic(commentaires: readonly Brut[]): CardDuChef | null {
  const dits = commentaires.filter((comment) => typeof comment.author_association === "string" && DE_CONFIANCE.has(comment.author_association) && corpsDe(comment) !== "");
  const dernier = dits.findLastIndex((comment) => corpsDe(comment).includes(MARQUE_DU_MANAGER));
  const posee = dits[dernier];
  if (posee === undefined || !corpsDe(posee).includes(MARQUE_DE_LA_QUESTION)) return null;
  if (dits.slice(dernier + 1).some((comment) => !corpsDe(comment).includes(MARQUE_DE_TAKING))) return null;
  const texte = questionDuComment(corpsDe(posee));
  if (texte === "") return null;
  const lines = texte.split("\n");
  const rang = lines.findLastIndex((line) => QUESTION.test(line));
  const question = (rang === -1 ? lines.find((line) => line.trim() !== "") : lines[rang])?.replace(/\*\*|__/g, "").trim();
  if (question === undefined) return null;
  const precise = lines.filter((_, i) => i !== (rang === -1 ? lines.findIndex((line) => line.trim() !== "") : rang)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const boutons = choiceDe(texte).map((choice) => `- [resume] ${corpsDuChoice(choice)}`);
  return { sorte: SORTE_QUESTION_D_EPIC, texte: [question, ...boutons, ...(precise === "" ? [] : ["", precise])].join("\n") };
}

// Depuis quand elle attend : l'heure de la question du manager — nulle quand aucune carte n'est posée.
export function questionDEpicLe(commentaires: readonly Brut[]): string | null {
  const posee = commentaires.findLast((comment) => corpsDe(comment).includes(MARQUE_DE_LA_QUESTION) && corpsDe(comment).includes(MARQUE_DU_MANAGER));
  const le = posee?.created_at;
  return typeof le === "string" && !Number.isNaN(Date.parse(le)) ? le : null;
}
