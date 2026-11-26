// Un ticket que la nouvelle cuisine parque pour le chef (runtime/src/kitchen/, #4474) : le label `parked:chef`, et un
// commentaire de la cuisine qui commence par « Parked for the chef » et dit pourquoi — le cook qui a écrit `PARK:`, le
// manager, ou les renvois épuisés. Sa carte de TODO pose ce commentaire, le dernier, tel quel ; elle n'a qu'un geste,
// Answer : la réponse du chef est postée sur l'issue et `parked:chef` retiré — le ticket retourne sur le rail
// (tableau-gestes/reponse-github.ts). Rien n'est lu du runtime d'avant : l'issue et ses commentaires, sur GitHub.
import type { CarteDuChef } from "./todo-github.ts";

// Le label de la cuisine (runtime/src/kitchen/decide.ts, `LABELS.parkedChef`), écrit ici : la lecture du rail ne charge
// du runtime que ses états de GitHub (test/tableau/lecture.test.ts).
export const LABEL_PARKED_CHEF = "parked:chef";
export const SORTE_PARKED_CHEF = "parked-chef";
// Les auteurs dont un commentaire de la cuisine se croit : la cuisine écrit avec le `gh` de sa station.
const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];
const DE_LA_CUISINE = /^\s*Parked for the chef\b/;
// Sans commentaire de la cuisine — le label posé à la main : la carte le dit, et demande quand même.
const SANS_POURQUOI = "Parked for the chef, with no kitchen comment that says why: read the issue, then answer.";

type Commentaire = { body?: unknown; created_at?: unknown; author_association?: unknown };

// Le dernier commentaire de la cuisine qui dit pourquoi le ticket est parqué, et quand ; nul s'il n'y en a aucun.
export function pourquoiParque(commentaires: readonly Commentaire[]): { texte: string; le: string | null } | null {
  const dit = [...commentaires].reverse().find(({ body, author_association }) => typeof body === "string" && DE_CONFIANCE.includes(String(author_association)) && DE_LA_CUISINE.test(body));
  if (dit === undefined) return null;
  const le = typeof dit.created_at === "string" && !Number.isNaN(Date.parse(dit.created_at)) ? dit.created_at : null;
  return { texte: (dit.body as string).trim(), le };
}

// La carte d'une issue `parked:chef` : ce que la cuisine en dit, ou `SANS_POURQUOI`.
export const carteDuParkedChef = (commentaires: readonly Commentaire[]): CarteDuChef => ({ sorte: SORTE_PARKED_CHEF, texte: pourquoiParque(commentaires)?.texte ?? SANS_POURQUOI });
