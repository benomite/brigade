// « Add a project » : le formulaire d'ajout, ouvert par le « + » de la barre, avec ce qu'il propose.
import { proposerCalibrage } from "../../../app/src/proposition.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "« Add a project » : le formulaire d'ajout, une box déclarée, le calibrage proposé",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: "#entree-ajout" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      proposerCalibrage: proposerCalibrage(PROJETS),
      proposerRacine: { racine: "/srv/sauvegardes", origine: "the root read in /etc/brigade-installer.conf on box" },
    },
    envois: cuisine(RENDUS),
  }),
};
