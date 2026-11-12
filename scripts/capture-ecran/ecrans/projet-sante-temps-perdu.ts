// La section des plafonds de « parade » sous Settings, la souris sur le « ? » du temps perdu par ticket (#3422) : sa bulle
// dit ce que la station plafonne — les attentes et les pertes qu'elle compte.
import type { Ecran } from "./commun.ts";
import { ecran as sante, SECTION, SETTINGS } from "./projet-sante.ts";
import { OUVRIR } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  ...sante,
  dit: "L'espace de « parade », Settings, sa section des plafonds : la bulle du temps perdu par ticket ouverte, ce que la station compte comme perdu (#3422)",
  etapes: [OUVRIR, SETTINGS, SECTION, { survoler: '[data-cle="lostTimeMaxMin"] .survol .aide' }],
};
