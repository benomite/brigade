// Des couleurs libres trop proches (ticket 1106) : l'onglet de « parade » choisi presque du vert
// d'état, son accent presque de l'onglet de « cantine ». Elles restent, pressées au bout de leur
// rangée, et une ligne sous chacune dit de quoi elle est proche.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const [parade, cantine] = PROJETS;

export const ecran: Ecran = {
  dit: "Les couleurs de « parade » sous Settings (#1106) : un onglet libre près du vert d'état, un accent libre près de l'onglet de « cantine » — gardés, et une ligne sous chacun le dit",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration([{ ...parade!, couleurs: { onglet: "#70c08c", accent: "#52c5b4" } }, cantine!])), espace: [] },
    envois: cuisine(RENDUS),
  }),
};
