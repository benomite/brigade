// L'onglet Kitchen > Cooks de « parade » (#2492) : « Add a specialization » cliqué, le formulaire ouvert sur place et
// rempli — `migrations`, ce qu'il cuisine, `sonnet`, `medium`, la capacité `postgres` —, « add » recommandé.
import type { Ecran, Etape } from "./commun.ts";
import { donnees, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { COOKS_DE_LA_CUISINE, SPECIALISATIONS_LUES } from "./cooks-specialisations.ts";

const CHAMP = (champ: string) => `[data-bloc="specialisations"] [data-champ="${champ}"]`;
export const REMPLIR: Etape[] = [
  { cliquer: '[data-bloc="specialisations"] .ajouter-une-specialisation button' },
  { saisir: CHAMP("nom"), texte: "migrations" },
  { saisir: CHAMP("description"), texte: "Database schema changes and their migrations." },
  { saisir: CHAMP("modele"), texte: "sonnet" },
  { saisir: CHAMP("effort"), texte: "medium" },
  { saisir: CHAMP("capacites"), texte: "code, postgres" },
];

export const ecran: Ecran = {
  dit: "L'onglet Kitchen > Cooks de « parade » : « Add a specialization » ouvert et rempli, « add » recommandé (#2492)",
  largeur: 1440,
  hauteur: 1100,
  etapes: [...COOKS_DE_LA_CUISINE, ...REMPLIR],
  donnees: () => donnees(SUR_LA_BOX, { specialisations: SPECIALISATIONS_LUES }),
};
