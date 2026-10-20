// La page de « parade » (#1095), son déménagement vers ce Mac refusé par le runtime : pas de bac à
// sable sur ce Mac. La raison, en une phrase sous la ligne ; la ligne dit toujours « Cooks on box ».
import type { Ecran } from "./commun.ts";
import { DEMENAGER, donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son déménagement vers ce Mac refusé — pas de bac à sable : la raison en une phrase, et il cuit toujours sur la box (#1095)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEMENAGER, { cliquer: '#stations-du-projet .demenagement button[data-vers="macbook"]' }],
  donnees: () => donnees(SUR_LA_BOX, { demenagerLaCuisine: { refus: "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing" } }),
};
