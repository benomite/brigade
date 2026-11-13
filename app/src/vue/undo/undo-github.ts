// « undo » sur la carte d'un ticket servi (ticket 3274, épique 3267) : le process principal joue la commande `undo` du
// runtime (`npm --prefix runtime run undo`, runtime/src/undo/commande.ts), qu'il importe et joue dans le sien, sous le `gh`
// de ce poste — le compte qui annule est celui du chef qui a cliqué. Propre, une PR revert le merge du ticket et passe la
// pass comme toute livraison, et le ticket est rouvert ; en conflit, aucune PR ne reste, et un ticket est déposé pour que
// la cuisine l'annule à la main. Ce que la commande a dit en dernier est la ligne que la carte affiche.
import { jouerLaCommande, type CommandeChargee, type RenduDeValidation } from "../validation-design/validation-design-github.ts";

// Ce qu'il en est advenu : fait, et la ligne de la commande ; ou rien n'est fait, et pourquoi.
export type RenduDAnnulation = RenduDeValidation;

export const PAS_SERVI = "nothing was undone: this ticket is not among the served tickets of the latest reading";

// L'annulation du ticket `ticket` du projet de `depot`. `servi` : la dernière lecture le porte parmi les servis avec sa PR
// mergée — seul un tel ticket s'annule d'ici.
export async function jouerLAnnulation({ depot, ticket, servi, commande, env }: { depot: string; ticket: unknown; servi: boolean; commande: () => Promise<CommandeChargee>; env: Record<string, string | undefined> }): Promise<RenduDAnnulation> {
  if (!servi || typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket <= 0) return { refus: PAS_SERVI, detail: "" };
  return jouerLaCommande({ args: [`${depot}#${ticket}`], commande, env, parDefaut: `#${ticket} undone` });
}
