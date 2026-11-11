// La visite guidée (#3165), sa deuxième étape sur l'espace de « parade » : la carte du ticket qu'un cook cuisine en ce
// moment, entourée de l'accent, et ce que la bulle en dit.
import { ecran as visite } from "./visite.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...visite,
  dit: "La visite guidée sur « parade » (#3165) : sa deuxième étape, la carte qu'un cook cuisine en ce moment",
  etapes: [...visite.etapes, { cliquer: "#visite button[data-bouton=\"recommande\"]" }],
};
