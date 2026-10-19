// « Add a project » : le formulaire d'ajout, ouvert par le « + » de la barre, avec ce qu'il propose.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "« Add a project » : le formulaire d'ajout (#983 : sans station, ni calibrage à proposer)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: "#entree-ajout" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    envois: cuisine(RENDUS),
  }),
};
