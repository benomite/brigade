// La fiche de #14, dont le corps de l'issue porte un bloc ```mermaid (#3773) : le diagramme se lit sur la fiche,
// au-dessus de l'issue repliée. Le reste est celui de `fiche.ts`.
import type { Ecran } from "./commun.ts";
import { donneesDeLaFiche, ecran as fiche } from "./fiche.ts";

const CORPS = [
  "Le journal ne doit jamais être réécrit : **ajout seul**.",
  "",
  "```mermaid",
  "flowchart LR",
  "  E[event] --> J[(journal)]",
  "  J --> R[replay]",
  "  O[oversight] -. new event .-> J",
  "```",
  "",
  "- un événement ne se modifie pas",
  "- un oubli se corrige par un nouvel événement",
].join("\n");

export const ecran: Ecran = {
  ...fiche,
  dit: "La fiche de #14 dont l'issue porte un diagramme Mermaid, ouverte par sa carte dans la colonne Taken du rail de parade",
  donnees: donneesDeLaFiche(CORPS),
};
