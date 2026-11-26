// Une panne qui levait un bandeau parque désormais son ticket sur le chef (#4272, épique #4129) : la fiche dit `who` =
// le chef, `for` = le texte de la panne tel quel, et le ticket attend sa réponse. Aucun bandeau ne la porte plus.
import { CHEF, type FicheParked, type Parked } from "./parked.ts";

// Jusqu'à quand attend un ticket parqué par sa panne : la réponse du chef.
export const JUSQU_A_LA_REPONSE_DU_CHEF = "the chef answers";

export function parquerLaPanne({ parked, ticket, texte }: { parked: Pick<Parked, "park">; ticket: number; texte: string }): FicheParked {
  return parked.park(ticket, CHEF, texte, JUSQU_A_LA_REPONSE_DU_CHEF);
}
