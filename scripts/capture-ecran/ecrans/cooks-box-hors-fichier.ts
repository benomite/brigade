// L'onglet Cooks de « parade » quand la box le sert mais que l'app ne le sait pas par son fichier des projets (#1991) :
// la ligne « Cooks on » nomme la box, et l'onglet ne dit pas qu'aucune station ne le sert.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : la box le sert, déclarée sur le compte mais absente du fichier des projets — pas de « no station is known »",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade"]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS), () => false, true, () => false), espace: [] },
    envois: cuisine({ ...RENDUS, parade: RENDUS.parade as Rendu }),
  }),
};
