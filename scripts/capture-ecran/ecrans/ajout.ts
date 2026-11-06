// « Add a project » : ouvert par le « + » de la barre, le parcours d'ajout — le compte GitHub de ce poste, connecté
// (#2475) —, puis le formulaire d'ajout par un dossier.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COMPTE } from "./premier-lancement-commun.ts";

export const ecran: Ecran = {
  dit: "« Add a project » : le formulaire d'ajout (#983 : sans station, ni calibrage à proposer)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: "#entree-ajout" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), compteGitHub: COMPTE },
    envois: cuisine(RENDUS),
  }),
};
