// L'onglet Agents de « parade » (ticket 4224), un changement refusé : le plafond de lignes retirées du closer porté à
// 99999, le runtime répond 400 et sa raison ; la valeur en vigueur reste.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : le plafond du closer à 99999, refusé par le runtime avec sa raison (#4224)",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: '#rail article[aria-label="closer"] [data-cle="maxRemovedLines"] input', texte: "99999", valider: true }],
  donnees: () => donnees({ "PUT /api/agents/closer/settings": { __statut: 400, corps: { reason: "must be between 50 and 5000 lines" } } }),
};
