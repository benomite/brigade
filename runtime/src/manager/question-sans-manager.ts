// La question d'un cook sur une station sans manager (#3938). Le 2026-11-19,
// BOBL-tech/mirrorlab#842 était pris par une station sans manager : son cook a
// posé trois fois sa question, la station répondait « this station has no
// manager to consult », et deux de ces arrêts l'ont mis de côté pour ses échecs
// — 21 h hors du rail, quand parade-box/claude, qui fait tourner un manager,
// pouvait répondre.
//
// La station sans manager poste la question du cook sur l'issue, sous
// `<!-- brigade:question-au-manager station=<nom> -->`, et rend le ticket sans
// compter d'essai. Tant que la question attend, elle ne le reprend pas si une
// autre station du projet fait tourner un manager : celle-là le prend, et avant
// de lancer son cook, elle passe la question à son manager
// (`<!-- brigade:question-reprise station=<nom> -->`) — sa réponse s'écrit sur
// l'issue, où le cook suivant la lit. Si aucune station du projet ne fait
// tourner de manager, le ticket est rendu au rail, sans être mis de côté.
//
// Une station fait tourner un manager quand GitHub montre sa prise du travail
// du manager (`github-etat/prise-du-manager.ts`) sur une issue récente.
import { DE_CONFIANCE } from "../alimenter.ts";

const MARQUE_DE_LA_QUESTION = "<!-- brigade:question-au-manager";
const LIRE_LA_QUESTION = /^<!-- brigade:question-au-manager station=([A-Za-z0-9._/-]+) -->/;
const MARQUE_DE_LA_REPRISE = "<!-- brigade:question-reprise";
const LIRE_LA_REPRISE = /^<!-- brigade:question-reprise station=([A-Za-z0-9._/-]+) -->/;

export type QuestionEnSuspens = { station: string; question: string };

// Le commentaire qui porte la question du cook sur l'issue. `managers` : les
// autres stations du projet qui font tourner un manager ; null, elles ne se
// sont pas lues.
export function corpsDeLaQuestion({ station, question, managers }: { station: string; question: string; managers: readonly string[] | null }): string {
  const suite =
    managers === null
      ? "The stations of the project that run a manager could not be read on GitHub: the ticket is given back to the rail."
      : managers.length === 0
        ? "No other station of the project that can take this ticket runs a manager: the ticket is given back to the rail."
        : `A manager of the project runs on ${managers.map((m) => `\`${m}\``).join(", ")}: that station takes the ticket, answers the question here, and its cook reads the answer. Station \`${station}\` does not take the ticket back until then.`;
  const citee = question.trim().split("\n").map((ligne) => `> ${ligne}`.trimEnd()).join("\n");
  return `${MARQUE_DE_LA_QUESTION} station=${station} -->\nStation \`${station}\` has no manager: its cook stopped, blocked, and its question is posted here for a manager of the project on another station. ${suite} This stop is not a failed cook, and never sets the ticket aside.\n\nThe cook's question:\n\n${citee}`;
}

// Le commentaire de la station qui passe la question à son manager.
export const corpsDeLaReprise = ({ station, de }: { station: string; de: string }) =>
  `${MARQUE_DE_LA_REPRISE} station=${station} -->\nStation \`${station}\` gives the question that station \`${de}\` posted above to its manager, before its cook starts.`;

// La dernière question postée sur l'issue qu'aucune station n'a encore passée à
// son manager, ou null. Seuls comptent les commentaires du dépôt.
export function questionEnSuspens(commentaires: readonly { body: string; association: string }[]): QuestionEnSuspens | null {
  let derniere: QuestionEnSuspens | null = null;
  for (const c of commentaires) {
    if (!DE_CONFIANCE.includes(c.association)) continue;
    if (LIRE_LA_REPRISE.test(c.body)) derniere = null;
    const station = LIRE_LA_QUESTION.exec(c.body)?.[1];
    if (station !== undefined) derniere = { station, question: questionCitee(c.body) };
  }
  return derniere;
}

// La question citée, sans les `> ` : seules ses lignes en portent.
function questionCitee(corps: string): string {
  return corps
    .split("\n")
    .filter((ligne) => ligne.startsWith(">"))
    .map((ligne) => ligne.replace(/^> ?/, ""))
    .join("\n")
    .trim();
}
