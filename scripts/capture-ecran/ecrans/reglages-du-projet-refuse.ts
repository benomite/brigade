// Les réglages de « parade », une branche d'intégration refusée par le runtime (#1309) : un chemin de la machine ne
// s'écrit pas dans le dépôt. Écrite et validée, la branche est proposée aussitôt (#2920) ; le refus se dit sous la
// rangée, et le champ revient à la valeur en vigueur — inchangée.
import { phraseDuRuntime } from "../../../app/src/reglages-du-projet.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { BRANCHE, LUS, OUVRIR } from "./reglages-du-projet.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade », la branche `/home/chef/parade` validée et refusée : le refus du runtime sous la rangée, la valeur en vigueur `main` inchangée",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: `${BRANCHE} input`, texte: "/home/chef/parade", valider: true }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      reglagesDuProjet: LUS,
      proposerUnReglage: {
        // La phrase du runtime telle que le process principal la rend à la vue.
        refus: phraseDuRuntime("`integrationBranch` does not belong in the project's repository: its value is a path on a machine. A machine's paths stay in that station's settings, never in git."),
        detail: "$ station setting branch /home/chef/parade",
      },
    },
    envois: cuisine(RENDUS),
  }),
};
