// Le blocage d'un cook va au manager d'abord, jamais au chef directement
// (#2894). Le 2026-11-08, le cook de #2875 s'est arrêté au bout d'une minute
// sur une question que le dépôt répondait — l'outil de capture existe, le dépôt
// est public —, et le ticket est allé tout droit au chef sous
// `blocked-on-human`, en carte TODO sans question. La règle est la première
// section du `CLAUDE.md` : un `blocked-on-human` sans décision de produit ou de
// design est un échec.
//
// La station donne la question du cook au manager, qui la lit dans un worktree
// de la branche du ticket, en lecture, et en tire l'une de quatre issues :
//   - `technique` — un outil, un chemin, un dépôt, un choix entre options
//     techniques, un accès que la cuisine a : il y répond sur l'issue, dit la
//     décision qu'il prend, et le ticket repart à un cook depuis sa branche ;
//   - `produit` ou `design` — seul le chef tranche : `blocked-on-human`, et le
//     commentaire porte la question sur une ligne ;
//   - `geste` — rien à décider, mais un geste que seul le chef peut faire : la
//     carte nomme ce geste exact, jamais la question du cook seule.
//
// Le même ticket ne boucle pas : après deux réponses techniques, la troisième
// revient au manager avec les deux d'avant, et sa décision s'écrit dans le
// corps du ticket, une fois. Un cook qui bloque encore sur une question
// technique compte alors pour un cook sans livraison — `ECHECS_MAX` et la règle
// du même motif bornent la suite —, jamais pour le chef.
import { issueEnDonnee, objet, parmi, phrase, type IssueAJuger } from "./juger.ts";

// La première ligne de la consigne : ce qui la distingue d'un jugement, pour qui lit les lancements.
export const MARQUE_DE_LA_CONSULTATION = "<!-- brigade:blocage-au-manager -->";
// Chaque réponse technique du manager sur l'issue : c'est elle que l'on compte.
export const MARQUE_DE_REPONSE = "<!-- brigade:reponse-au-blocage";
// La décision écrite dans le corps du ticket, à la troisième réponse.
export const MARQUE_DE_DECISION = "<!-- brigade:decision-du-manager -->";
// Les réponses techniques après lesquelles la suivante devient une décision écrite dans le corps.
export const REPONSES_AVANT_DECISION = 2;

export const ISSUES_DE_L_AVIS = ["technique", "produit", "design", "geste"] as const;

export type Avis =
  | { issue: "technique"; reponse: string; decision: string }
  | { issue: "produit" | "design"; question: string }
  | { issue: "geste"; geste: string };

// Ce que la station rend d'une consultation : l'avis, ou pourquoi il n'y en a
// pas. `questionEn` : la question du cook, que le manager a traduite en
// anglais — celle que l'issue cite ; le cook l'écrit en français.
export type ReponseDuManager = { avis: Avis; questionEn?: string } | { illisible: string };

// Le manager, tel que la station le consulte : le ticket, la question du cook,
// et les réponses techniques qu'il a déjà données sur ce ticket.
export type ConsulterLeManager = (ticket: { number: number; title: string }, blocage: { question: string; reponses: string[] }) => Promise<ReponseDuManager>;

const citer = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => `> ${ligne}`)
    .join("\n");
const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

// La question du cook telle que l'issue la cite : la traduction anglaise du
// manager ; sans elle, rien n'est cité — le cook l'a écrite en français.
const laQuestionDuCook = (titre: string, questionEn: string | null): string[] =>
  questionEn === null ? [`${titre} not quoted: the manager gave no English version of it.`] : [`${titre}:`, "", citer(questionEn)];

export function consigneDuBlocage(mission: { depot: string; issue: IssueAJuger; commentaires: string[]; question: string; reponses: string[] }): string {
  const { depot, issue, commentaires, question, reponses } = mission;
  const precedentes =
    reponses.length === 0
      ? []
      : [
          "## Tes réponses précédentes",
          "",
          reponses.length >= REPONSES_AVANT_DECISION
            ? `Tu as déjà répondu ${reponses.length} fois à un blocage de ce ticket, et son cook bloque encore. Une réponse de plus en commentaire ne suffit pas : si tu réponds \`technique\`, ta décision est écrite dans le corps du ticket, comme une consigne que le cook suit, et le ticket ne repartira plus sur un blocage technique — un nouveau blocage comptera comme un cook raté. Relis tes réponses, vois pourquoi elles n'ont pas suffi, et tranche une fois pour toutes. Ne renvoie pas au chef ce qui n'est pas un choix de produit ou de design.`
            : "Tu as déjà répondu à un blocage de ce ticket, et son cook bloque de nouveau. Relis ta réponse : si elle n'a pas suffi, dis plus précisément ce que le cook doit faire.",
          "",
          ...reponses.flatMap((reponse, rang) => [`<reponse n="${rang + 1}">`, reponse.trim(), "</reponse>", ""]),
        ];
  return [
    MARQUE_DE_LA_CONSULTATION,
    `Tu es le manager de la brigade sur le dépôt ${depot}. Un cook — un agent qui exécute un ticket seul, sans personne pour lui répondre — s'est arrêté bloqué sur l'issue #${issue.number} et a écrit sa question. Elle vient à toi d'abord, jamais au chef directement : un \`blocked-on-human\` sans décision de produit ou de design est un échec de la cuisine.`,
    "",
    "Tu es dans un worktree de la branche du ticket, en lecture (Read, Grep, Glob) : vérifie dans le dépôt ce que la question demande — un outil, un chemin, un fichier, un script — avant de répondre.",
    "",
    "## Ce que tu peux répondre",
    "",
    "- `technique` — la question porte sur un outil, un chemin, un dépôt, un choix entre options techniques, un accès que la cuisine a déjà, ou toute chose que le dépôt, le ticket ou ton jugement tranche. Tu y réponds (`reponse`) et tu dis la décision que tu prends (`decision`) : le ticket repart à un cook depuis sa branche. Dans le doute, tranche : c'est le cas par défaut.",
    "- `produit` — un choix entre plusieurs voies qui change ce que l'utilisateur obtient : seul le chef tranche. `question` : la question au chef, sur une ligne.",
    "- `design` — un écran ou un rendu que seul le chef peut valider. `question` : la question au chef, sur une ligne.",
    "- `geste` — rien à décider, mais un geste que seul le chef peut faire : un accès à accorder, un secret, un réglage. `geste` nomme le geste exact — la commande à lancer ou le réglage à poser, et où —, jamais la question du cook recopiée.",
    "",
    ...precedentes,
    "## La question du cook",
    "",
    "<question>",
    question.trim(),
    "</question>",
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui :",
    "",
    "```json",
    '{"issue": "technique", "reponse": "the answer to the cook\'s question", "decision": "what you decided, and what the cook does now", "question_en": "the cook\'s question, translated into English"}',
    "```",
    "",
    'ou `{"issue": "produit", "question": "…?", "question_en": "…"}`, `{"issue": "design", "question": "…?", "question_en": "…"}`, `{"issue": "geste", "geste": "…", "question_en": "…"}`.',
    "",
    "`reponse`, `decision`, `question` et `geste` sont écrits sur l'issue, que le cook et le chef lisent : en anglais. `question_en` est la question du cook, traduite fidèlement en anglais, sans rien y ajouter : c'est elle que l'issue cite.",
    "",
    ...issueEnDonnee(issue, commentaires),
  ].join("\n");
}

export function lireAvis(message: string | null): ReponseDuManager {
  if (message === null || message.trim() === "") return { illisible: "no answer" };
  const lu = objet(message);
  if (!lu) return { illisible: "no JSON object in the answer" };
  const avis = lireLAvis(lu);
  if ("illisible" in avis) return avis;
  // Sans traduction, l'avis vaut quand même : l'issue ne cite pas la question.
  const questionEn = phrase(lu.question_en);
  return questionEn === null ? avis : { ...avis, questionEn };
}

function lireLAvis(lu: Record<string, unknown>): { avis: Avis } | { illisible: string } {
  const issue = parmi(lu.issue, ISSUES_DE_L_AVIS);
  if (!issue) return { illisible: `unknown outcome ${JSON.stringify(lu.issue)} — expected ${ISSUES_DE_L_AVIS.join(", ")}` };
  if (issue === "technique") {
    const reponse = phrase(lu.reponse);
    const decision = phrase(lu.decision);
    if (!reponse) return { illisible: "a technical answer with no `reponse`" };
    if (!decision) return { illisible: "a technical answer with no `decision`" };
    return { avis: { issue, reponse, decision } };
  }
  if (issue === "geste") {
    const geste = phrase(lu.geste);
    if (!geste) return { illisible: "a gesture with no `geste`" };
    return { avis: { issue, geste: surUneLigne(geste) } };
  }
  const question = phrase(lu.question);
  if (!question) return { illisible: `a ${issue} question with no \`question\`` };
  return { avis: { issue: issue as "produit" | "design", question: surUneLigne(question) } };
}

// La réponse technique du manager, postée sur l'issue : la question du cook,
// la réponse, la décision prise. `n` : son rang parmi les réponses du ticket.
// `questionEn` : la question du cook en anglais, null quand le manager ne l'a
// pas traduite (de même pour les deux suivantes).
export function corpsDeLaReponseAuBlocage({ station, n, questionEn, avis, ecrite }: { station: string; n: number; questionEn: string | null; avis: Extract<Avis, { issue: "technique" }>; ecrite: boolean }): string {
  return [
    `${MARQUE_DE_REPONSE} n=${n} -->`,
    "**Manager — the cook's block is technical: answered here, the ticket goes back to a cook, not to the chef.**",
    "",
    ...laQuestionDuCook("The cook's question", questionEn),
    "",
    `**Answer.** ${avis.reponse}`,
    "",
    `**Decision.** ${avis.decision}`,
    "",
    ecrite
      ? `This is the manager's answer number ${n} on this ticket: the decision is written into the ticket's body, and the cook follows it. Another technical block counts as a cook without a delivery.`
      : `Station \`${station}\`: the ticket is re-queued from its branch; this stop is not counted among the ticket's tries.`,
  ].join("\n");
}

// La décision écrite dans le corps du ticket, à la troisième réponse.
export function sectionDeLaDecision(questionEn: string | null, avis: Extract<Avis, { issue: "technique" }>): string {
  return [MARQUE_DE_DECISION, "## Manager's decision (added by the station)", "", "A cook blocked on this ticket again after two answers of the manager.", ...laQuestionDuCook("Its question", questionEn), "", `**Answer.** ${avis.reponse}`, "", `**Decision.** ${avis.decision}`, "", "Follow this decision: it is part of the ticket."].join("\n");
}

// Ce que la carte du chef porte : la question sur une ligne, ou le geste exact.
export function corpsDeLaCarte({ station, questionEn, avis }: { station: string; questionEn: string | null; avis: Exclude<Avis, { issue: "technique" }> }): string {
  const tete = avis.issue === "geste" ? `**Gesture for the chef:** ${avis.geste}` : `**Question for the chef (${avis.issue === "produit" ? "product" : "design"}):** ${avis.question}`;
  const ensuite = avis.issue === "geste" ? "Once it is done, remove `blocked-on-human`: a cook resumes the ticket from its branch." : "Answer it on this issue, then remove `blocked-on-human`: a cook resumes the ticket from its branch.";
  return [
    tete,
    "",
    `Station \`${station}\`: the cook stopped, blocked — nothing it did goes to review. The manager read its question: ${avis.issue === "geste" ? "nothing in it is to decide, but only the chef can make this gesture" : `it is a ${avis.issue === "produit" ? "product" : "design"} decision, only the chef makes it`}. ${ensuite}`,
    "",
    ...laQuestionDuCook("The cook's question", questionEn),
  ].join("\n");
}
