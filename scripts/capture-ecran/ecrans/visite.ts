// La visite guidée (#3165), rejouée depuis la barre sur l'espace de « parade » : sa première étape, le rail et ses
// colonnes, la rangée entourée de l'accent, la bulle en bas à droite.
import { ecran as espace } from "./espace-projet.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...espace,
  dit: "La visite guidée rejouée sur « parade » (#3165) : sa première étape, le rail et ses colonnes",
  etapes: [...espace.etapes, { cliquer: "#entree-visite" }],
};
