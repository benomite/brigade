// L'onglet Agents de « parade » (ticket 4224), un réglage en cours de changement : le plafond de lignes retirées du closer
// porté à 800, le runtime n'a pas encore répondu — « Saving… » sous la rangée.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : le plafond de lignes retirées du closer changé à 800, en route vers le runtime (#4224)",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: '#rail article[aria-label="closer"] [data-cle="maxRemovedLines"] input', texte: "800", valider: true }],
  donnees: () => donnees({ "PUT /api/agents/closer/settings": { __enAttente: true } }),
};
