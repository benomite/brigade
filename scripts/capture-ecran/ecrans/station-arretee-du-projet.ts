// La page de « parade » quand l'app ne connaît aucune station qui le serve mais que GitHub nomme box/claude,
// arrêtée (#3472, le cas de secondes) : la ligne des stations la nomme, « choose its machine » ne s'offre pas.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_BLOQUE } from "./rail-bloque-commun.ts";

export const ecran: Ecran = {
  dit: "La page de « parade », que GitHub dit servi par box/claude, arrêtée, l'app n'en connaissant aucune : « Cooks on box/claude », ni « No station cooks » ni « choose its machine » (#3472)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade"]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: { ...demarrage(configuration(PROJETS), () => false, true, () => false), stations: { a: MAINTENANT, stations: [] } }, espace: [] },
    envois: cuisine({ ...RENDUS, parade: RENDU_BLOQUE }),
  }),
};
