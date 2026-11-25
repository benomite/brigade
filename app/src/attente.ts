// WAITING, côté app : les trois gestes qui parquent un ticket — en attente d'un tiers — et l'en sortent
// (docs/runtime/journal-et-rail.md, « Un ticket attend un tiers : WAITING »). Aucun n'est une commande de la box : chacun
// s'écrit sur l'issue, sur tout projet (vue/attente/attente-github.ts, #4262), par les deux fonctions que le second joue
// aussi (second/parking.ts) :
//   - « waiting for… », sur une carte de TODO : `parquer`, d'après le formulaire que le chef a rempli — ce qu'il attend,
//     dans ses mots, de qui, et la date de relance, proposée à sept jours ;
//   - « resume » et « it arrived, back to the kitchen », sur une carte de WAITING : `deparquer`, le label `waiting` retiré.
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
