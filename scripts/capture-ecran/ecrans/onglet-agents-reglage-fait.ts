// L'onglet Agents de « parade » (ticket 4224), un réglage changé : le plafond de lignes retirées du closer à 800, la
// rangée dit quand et par qui ; et un refus : l'effort de la pass, que le runtime refuse avec sa raison.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, REGLAGES_DU_CLOSER } from "./onglet-agents-commun.ts";

const plafond = REGLAGES_DU_CLOSER.find(({ key }) => key === "maxRemovedLines");

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : le plafond du closer changé à 800, quand et par qui (#4224)",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: '#rail article[aria-label="closer"] [data-cle="maxRemovedLines"] input', texte: "800", valider: true }],
  donnees: () => donnees({ "PUT /api/agents/closer/settings": { ...plafond, value: 800, changedAt: "2026-10-13T10:04:00.000Z", changedBy: "chef" } }),
};
