// Un ticket que la nouvelle cuisine parque pour le chef (runtime/src/kitchen/, #4474) : le label `parked:chef`, et un
// commentaire de la cuisine qui commence par « Parked for the chef » et dit pourquoi — le cook qui a écrit `PARK:`, le
// manager, ou les renvois épuisés. Sa carte de TODO pose ce commentaire, le dernier, tel quel ; elle n'a qu'un geste,
// Answer : la réponse du chef est postée sur l'issue et `parked:chef` retiré — le ticket retourne sur le rail
// (board-actions/answer-github.ts). Rien n'est lu du runtime d'avant : l'issue et ses commentaires, sur GitHub.
import type { CardOfChef } from "./todo-github.ts";

// Le label de la cuisine (runtime/src/kitchen/decide.ts, `LABELS.parkedChef`), écrit ici : la lecture du rail ne charge
// du runtime que ses états de GitHub (test/board/read.test.ts).
export const LABEL_PARKED_CHEF = "parked:chef";
export const KIND_PARKED_CHEF = "parked-chef";
// Les auteurs dont un commentaire de la cuisine se croit : la cuisine écrit avec le `gh` de sa station.
const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];
const OF_THE_KITCHEN = /^\s*Parked for the chef\b/;
// Sans commentaire de la cuisine — le label posé à la main : la carte le dit, et demande quand même.
const WITHOUT_WHY = "Parked for the chef, with no kitchen comment that says why: read the issue, then answer.";

type Comment = { body?: unknown; created_at?: unknown; author_association?: unknown };

// Le dernier commentaire de la cuisine qui dit pourquoi le ticket est parqué, et quand ; nul s'il n'y en a aucun.
export function whyParked(comments: readonly Comment[]): { texte: string; le: string | null } | null {
  const said = [...comments].reverse().find(({ body, author_association }) => typeof body === "string" && OF_TRUST.includes(String(author_association)) && OF_THE_KITCHEN.test(body));
  if (said === undefined) return null;
  const the = typeof said.created_at === "string" && !Number.isNaN(Date.parse(said.created_at)) ? said.created_at : null;
  return { texte: (said.body as string).trim(), le: the };
}

// La carte d'une issue `parked:chef` : ce que la cuisine en dit, ou `SANS_POURQUOI`.
export const parkedChefCard = (comments: readonly Comment[]): CardOfChef => ({ sorte: KIND_PARKED_CHEF, texte: whyParked(comments)?.texte ?? WITHOUT_WHY });
