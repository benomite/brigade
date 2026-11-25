// Parquer un ticket, côté app (#4129 ; d'abord WAITING, tickets 591 et 3075) : les trois gestes qui parquent un ticket
// et l'en sortent (docs/runtime/journal-et-rail.md, « A ticket waits for someone: parked »). Aucun n'est une commande de
// la box : chacun s'écrit sur l'issue, sur tout projet, comme le second et `parked set` l'y écrivent
// (vue/attente/attente-github.ts) :
//   - « waiting for… », sur une carte : le commentaire marqué qui dit qui il attend, pour quoi, jusqu'à quand, d'après le
//     formulaire que le chef a rempli — ce qu'il attend, dans ses mots, de qui, et le jour, proposé à sept jours —, puis
//     le label `parked` ;
//   - « resume », la personne a répondu, et « it arrived, back to the kitchen », le fait est arrivé : `parked` retiré, le
//     ticket reprend exactement où il était.
// Les trois sont directs : ils ne détruisent rien, et le formulaire validé est le geste du chef.

// Les trois gestes, par leur nom, et leur libellé.
export const GESTES_D_ATTENTE = [
  { id: "attente-poser", libelle: "waiting for…" },
  { id: "attente-reprendre", libelle: "resume" },
  { id: "attente-arrivee", libelle: "it arrived, back to the kitchen" },
] as const;
export type GesteDAttente = (typeof GESTES_D_ATTENTE)[number]["id"];

// Ce que le chef remplit, et sa lecture : partagées avec le téléphone (vue/attente/saisie.ts).
export { jourDe, RELANCE_PROPOSEE_JOURS, relanceProposee, type Saisie } from "./vue/attente/saisie.ts";
