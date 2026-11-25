// L'onglet Agents de « parade » (ticket 4224), les derniers gestes du closer ouverts d'un clic sur son nom : une ligne
// chacun, avec sa raison, son heure et son issue.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : les derniers gestes du closer, chacun avec sa raison (#4224)",
  largeur: 1440,
  hauteur: 1100,
  etapes: [...OUVRIR, { cliquer: '#rail article[aria-label="closer"] header button' }],
  donnees: () => donnees(),
};
