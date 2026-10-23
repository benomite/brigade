// La palette entière (ticket 1106) : un projet par teinte, chacun la portant en onglet et en accent —
// la barre les montre toutes, en pastille ; les réglages de « parade », ouverts, ses deux rangées
// de pastilles, le sélecteur d'une couleur libre, et son accent dans l'espace.
import { PALETTE } from "../../../app/src/couleurs.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const projetsDeLaPalette = () =>
  PALETTE.map(({ nom, valeur }, rang) => {
    const couleurs = { onglet: valeur, accent: valeur };
    return rang === 0 ? { ...PROJETS[0]!, couleurs } : { nom, dossier: `/Users/chef/code/${nom}`, couleurs };
  });

export const ecran: Ecran = {
  dit: "La palette entière (#1106) : un projet par teinte dans la barre, et les couleurs de « parade » sous Settings — ses deux rangées de pastilles, « other… », et son accent dans l'espace",
  largeur: 1440,
  hauteur: 1040,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(projetsDeLaPalette())), espace: [] }, envois: cuisine(RENDUS) }),
};
