// Les réglages de « parade » (Settings, sa rubrique par défaut) : en tête, l'état du code de l'app —
// celle du dépôt, dont le clone est à jour (retard.ts).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade », l'app lancée depuis le dépôt : en tête, l'état du code de l'app, à jour avec son origine",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine(RENDUS) }),
};
