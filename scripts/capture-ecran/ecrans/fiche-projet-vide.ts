// La fiche de « parade » sous Settings (#4240) quand son dossier n'a pas de `.brigade/fiche-projet.json` : la ligne vide.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { HAUTEUR, RECURRENTS } from "./recurrents.ts";
import { LUS, OUVRIR } from "./reglages-du-projet.ts";
import { HUMAINS } from "./settings-humains.ts";

export const ecran: Ecran = {
  dit: "La fiche de « parade » sous Settings, sans fichier : « project sheet », puis « No project sheet yet. », pourquoi au survol",
  largeur: 1440,
  hauteur: HAUTEUR + 200,
  etapes: OUVRIR,
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, listerLesHumains: HUMAINS, listerLesRecurrents: RECURRENTS, lireUnFichierDuProjet: null },
    envois: cuisine(RENDUS),
  }),
};
