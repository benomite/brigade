// La fiche de « parade » sous Settings (#4240, épique #4136) : les huit articles de son `.brigade/fiche-projet.json`, chacun
// dans son champ — un texte sur une ligne, une liste une entrée par ligne —, puis « Save ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { OUVRIR } from "./reglages-commun.ts";

// La fiche de parade, telle que la colonne « brigade, espace… » de la spec la déclare.
export const FICHE = {
  work: "code and its tests",
  stages: ["one"],
  tools: ["git", "the project's CLI", "screenshots"],
  rules: ["tests", "types", "CI green"],
  risks: ["an interface", "production data"],
  served: "the main branch",
  recurring: ["the closer, daily"],
  humans: ["the chef, on what only a human does"],
};

export const ecran: Ecran = {
  dit: "La fiche de « parade » sous Settings : « project sheet », puis ses huit articles — The cook's work, Stages, Tools, House rules, Risks, Served, Recurring, Humans in the kitchen —, chacun dans son champ, « one per line » sous les listes, et « Save »",
  largeur: 1440,
  hauteur: 2500,
  etapes: OUVRIR,
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], lireUnFichierDuProjet: JSON.stringify(FICHE) },
    envois: cuisine(RENDUS),
  }),
};
