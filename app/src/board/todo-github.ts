// Les cartes du chef sur GitHub (#2221, épique #2209) : la sorte et le texte d'une carte, que l'app pose dans la forme de
// toute carte de TODO (#2434, card-todo.ts, `carteDuChefDeTodo`) : la question, un bouton par choix, un champ libre. Le texte
// porte ses choix, un par ligne après la question : `- [<geste>] <libellé>`, le geste parmi ceux de la forme unique. Un texte
// sans choix se lit comme une question libre ; sa réponse joue `resume`. La réponse part du `gh` du chef
// (board-actions/answer-github.ts).

// Ce que la vue pose sur une carte du chef : la sorte et le texte du commentaire.
export type CardOfChef = { sorte: string; texte: string };

// Les gestes qu'un choix de la carte joue : répondre, qui reprend le ticket, et merger la PR qu'il attend.
export const ACTIONS_OF_CHEF = ["resume", "merge"] as const;
export type ActionOfChef = (typeof ACTIONS_OF_CHEF)[number];
export type ChoiceOfChef = { texte: string; suite: ActionOfChef };
// Ce que le texte d'une carte du chef pose : sa question — sa première ligne écrite, nulle sur un texte vide —, ses choix,
// et le reste, qui la précise.
export type ShapeOfChef = { question: string | null; choix: ChoiceOfChef[]; contexte: string };

// Un choix : `- [<geste>] <libellé>`, sur sa ligne. Une case à cocher de GitHub (`- [ ]`, `- [x]`) n'en est pas un.
const CHOICE = new RegExp(`^\\s*[-*]\\s*\\[(${ACTIONS_OF_CHEF.join("|")})\\]\\s+(\\S.*)$`, "i");
// La question dite en clair : sans titre, citation ni gras autour. Un titre est un `#` suivi d'un blanc : `#30 is sensitive`,
// la question de la carte « review before merge » (ticket 3224), garde son numéro.
const inClear = (line: string) => line.replace(/^\s*(?:#+(?=\s)|>)\s*/, "").replace(/\*\*|__/g, "").trim();

// La forme d'une carte du chef, lue de son texte : la question est sa première ligne écrite ; chaque ligne
// `- [<geste>] <libellé>` qui la suit est un choix, dans l'ordre ; le reste, sans ses lignes vides en trop, la précise.
export function shapeOfChef(text: string): ShapeOfChef {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((line) => line.trim() !== "");
  if (head === -1) return { question: null, choix: [], contexte: "" };
  const choice: ChoiceOfChef[] = [];
  const remains: string[] = [];
  for (const line of lines.slice(head + 1)) {
    const readOne = CHOICE.exec(line);
    const wording = readOne?.[2]?.trim();
    if (readOne !== null && wording !== undefined && !choice.some(({ texte: already }) => already === wording)) choice.push({ texte: wording, suite: (readOne[1] as string).toLowerCase() as ActionOfChef });
    else if (readOne === null) remains.push(line);
  }
  return { question: inClear(lines[head] as string), choix: choice, contexte: remains.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
