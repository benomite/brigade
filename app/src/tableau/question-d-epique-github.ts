// La question que le manager pose au chef sur une épique avant de la découper (runtime/src/decoupage.ts, cas « asked » :
// `<!-- brigade:manager -->` et `<!-- brigade:question -->` en tête, « Manager — epic not split: a question. », la question,
// puis « Answer here, or edit the epic »), lue des commentaires de l'issue. Tant qu'aucune réponse ne la suit, l'épique attend
// le chef : sa carte est dans TODO, avec la question et ses choix en boutons (`A) …`, `B) …`), et le champ libre.
//
// Les boutons jouent `resume` : leur libellé est posté en commentaire sur l'issue (tableau-gestes/reponse-github.ts), et le
// manager lit l'épique de nouveau — aucun autre geste. Ce commentaire, ou celui de quiconque a la main sur le dépôt, est la
// réponse : la carte quitte TODO. Un commentaire plus récent du manager qui ne pose pas de question — l'épique est
// découpée, ou son découpage est illisible — la rend sans objet.
import { choixDe, corpsDuChoix } from "../choix-de-question.ts";
import type { CarteDuChef } from "./todo-github.ts";

export const SORTE_QUESTION_D_EPIQUE = "manager-epic-question";
export const LABEL_EPIQUE = "epic";

const DE_CONFIANCE = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MARQUE_DU_MANAGER = "<!-- brigade:manager -->";
const MARQUE_DE_LA_QUESTION = "<!-- brigade:question -->";
// Ce que la station écrit en prenant le ticket : un commentaire du chef qui n'est la réponse à rien.
const MARQUE_DE_PRISE = "<!-- brigade:manager-prise";
const ENTETE = /^\*\*Manager — epic not split: a question\.\*\*$/;
const PIED = /^Answer here, or edit the epic/;
const MARQUE = /^\s*<!--[\s\S]*?-->\s*$/;
const QUESTION = /\?\s*$/;

type Brut = Record<string, unknown>;
const corpsDe = (commentaire: Brut) => (typeof commentaire.body === "string" ? commentaire.body : "");

// La question du manager, sans ses marques, son en-tête ni son pied : ce que son découpage demande. Un commentaire qui n'a pas
// cette forme est repris en entier, sans ses marques.
function questionDuCommentaire(corps: string): string {
  const paragraphes = corps
    .split(/\r?\n\s*\r?\n/)
    .map((paragraphe) => paragraphe.split("\n").filter((ligne) => !MARQUE.test(ligne)).join("\n").trim())
    .filter((paragraphe) => paragraphe !== "");
  const debut = paragraphes.findIndex((paragraphe) => ENTETE.test(paragraphe));
  const fin = paragraphes.findIndex((paragraphe, rang) => rang > debut && PIED.test(paragraphe));
  return (debut === -1 || fin === -1 ? paragraphes : paragraphes.slice(debut + 1, fin)).join("\n\n");
}

// La carte du chef que ces commentaires de l'issue d'une épique posent, du plus ancien au plus récent, tels que l'API de GitHub
// les rend — ou rien : aucune question, une réponse qui la suit, ou un commentaire du manager plus récent.
export function carteDeLaQuestionDEpique(commentaires: readonly Brut[]): CarteDuChef | null {
  const dits = commentaires.filter((commentaire) => typeof commentaire.author_association === "string" && DE_CONFIANCE.has(commentaire.author_association) && corpsDe(commentaire) !== "");
  const dernier = dits.findLastIndex((commentaire) => corpsDe(commentaire).includes(MARQUE_DU_MANAGER));
  const posee = dits[dernier];
  if (posee === undefined || !corpsDe(posee).includes(MARQUE_DE_LA_QUESTION)) return null;
  if (dits.slice(dernier + 1).some((commentaire) => !corpsDe(commentaire).includes(MARQUE_DE_PRISE))) return null;
  const texte = questionDuCommentaire(corpsDe(posee));
  if (texte === "") return null;
  const lignes = texte.split("\n");
  const rang = lignes.findLastIndex((ligne) => QUESTION.test(ligne));
  const question = (rang === -1 ? lignes.find((ligne) => ligne.trim() !== "") : lignes[rang])?.replace(/\*\*|__/g, "").trim();
  if (question === undefined) return null;
  const precise = lignes.filter((_, i) => i !== (rang === -1 ? lignes.findIndex((ligne) => ligne.trim() !== "") : rang)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const boutons = choixDe(texte).map((choix) => `- [resume] ${corpsDuChoix(choix)}`);
  return { sorte: SORTE_QUESTION_D_EPIQUE, texte: [question, ...boutons, ...(precise === "" ? [] : ["", precise])].join("\n") };
}

// Depuis quand elle attend : l'heure de la question du manager — nulle quand aucune carte n'est posée.
export function questionDEpiqueLe(commentaires: readonly Brut[]): string | null {
  const posee = commentaires.findLast((commentaire) => corpsDe(commentaire).includes(MARQUE_DE_LA_QUESTION) && corpsDe(commentaire).includes(MARQUE_DU_MANAGER));
  const le = posee?.created_at;
  return typeof le === "string" && !Number.isNaN(Date.parse(le)) ? le : null;
}
