// La question que le manager pose au chef sur une épique avant de la découper (`<!-- brigade:manager -->` et `<!-- brigade:question -->` en tête, « Manager — epic not split: a question. », la question,
// puis « Answer here, or edit the epic »), lue des commentaires de l'issue. Tant qu'aucune réponse ne la suit, l'épique attend
// le chef : sa carte est dans TODO, avec la question et ses choix en boutons (`A) …`, `B) …`), et le champ libre.
//
// Les boutons jouent `resume` : leur libellé est posté en commentaire sur l'issue (board-actions/answer-github.ts), et le
// manager lit l'épique de nouveau — aucun autre geste. Ce commentaire, ou celui de quiconque a la main sur le dépôt, est la
// réponse : la carte quitte TODO. Un commentaire plus récent du manager qui ne pose pas de question — l'épique est
// découpée, ou son découpage est illisible — la rend sans objet.
import { choiceOf, bodyOfChoice } from "../choice-of-question.ts";
import type { CardOfChef } from "./todo-github.ts";

export const KIND_QUESTION_OF_EPIC = "manager-epic-question";
export const EPIC_LABEL = "epic";

const OF_TRUST = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const BRAND_OF_MANAGER = "<!-- brigade:manager -->";
const BRAND_OF_THE_QUESTION = "<!-- brigade:question -->";
// Ce que la station écrit en prenant le ticket : un commentaire du chef qui n'est la réponse à rien.
const BRAND_OF_TAKING = "<!-- brigade:manager-prise";
const HEADER = /^\*\*Manager — epic not split: a question\.\*\*$/;
const FOOT = /^Answer here, or edit the epic/;
const BRAND = /^\s*<!--[\s\S]*?-->\s*$/;
const QUESTION = /\?\s*$/;

type Raw = Record<string, unknown>;
const bodyOf = (comment: Raw) => (typeof comment.body === "string" ? comment.body : "");

// La question du manager, sans ses marques, son en-tête ni son pied : ce que son découpage demande. Un commentaire qui n'a pas
// cette forme est repris en entier, sans ses marques.
function questionOfComment(body: string): string {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.split("\n").filter((line) => !BRAND.test(line)).join("\n").trim())
    .filter((paragraph) => paragraph !== "");
  const start = paragraphs.findIndex((paragraph) => HEADER.test(paragraph));
  const end = paragraphs.findIndex((paragraph, rank) => rank > start && FOOT.test(paragraph));
  return (start === -1 || end === -1 ? paragraphs : paragraphs.slice(start + 1, end)).join("\n\n");
}

// La carte du chef que ces commentaires de l'issue d'une épique posent, du plus ancien au plus récent, tels que l'API de GitHub
// les rend — ou rien : aucune question, une réponse qui la suit, ou un commentaire du manager plus récent.
export function cardOfTheQuestionOfEpic(comments: readonly Raw[]): CardOfChef | null {
  const saidOnes = comments.filter((comment) => typeof comment.author_association === "string" && OF_TRUST.has(comment.author_association) && bodyOf(comment) !== "");
  const last = saidOnes.findLastIndex((comment) => bodyOf(comment).includes(BRAND_OF_MANAGER));
  const setOne = saidOnes[last];
  if (setOne === undefined || !bodyOf(setOne).includes(BRAND_OF_THE_QUESTION)) return null;
  if (saidOnes.slice(last + 1).some((comment) => !bodyOf(comment).includes(BRAND_OF_TAKING))) return null;
  const text = questionOfComment(bodyOf(setOne));
  if (text === "") return null;
  const lines = text.split("\n");
  const rank = lines.findLastIndex((line) => QUESTION.test(line));
  const question = (rank === -1 ? lines.find((line) => line.trim() !== "") : lines[rank])?.replace(/\*\*|__/g, "").trim();
  if (question === undefined) return null;
  const precise = lines.filter((_, i) => i !== (rank === -1 ? lines.findIndex((line) => line.trim() !== "") : rank)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const buttons = choiceOf(text).map((choice) => `- [resume] ${bodyOfChoice(choice)}`);
  return { sorte: KIND_QUESTION_OF_EPIC, texte: [question, ...buttons, ...(precise === "" ? [] : ["", precise])].join("\n") };
}

// Depuis quand elle attend : l'heure de la question du manager — nulle quand aucune carte n'est posée.
export function questionOfEpicThe(comments: readonly Raw[]): string | null {
  const setOne = comments.findLast((comment) => bodyOf(comment).includes(BRAND_OF_THE_QUESTION) && bodyOf(comment).includes(BRAND_OF_MANAGER));
  const the = setOne?.created_at;
  return typeof the === "string" && !Number.isNaN(Date.parse(the)) ? the : null;
}
