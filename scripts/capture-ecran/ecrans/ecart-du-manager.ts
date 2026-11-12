// La carte de #50 dans TODO (#3370) : le manager l'a écarté avec `question` — sa question, un bouton par choix et le champ libre.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./ecart-du-manager-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3370) : #50 écarté par le manager avec `question` — sa carte dans TODO, la question du manager, un bouton par choix et le champ libre",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees,
};
