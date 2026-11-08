// Les stations contributrices de « parade » sous Settings (#2936), sous ses humains : bob-pc/claude a pris un ticket et peut
// être refusée par « Refuse » ; carol-mac/claude l'est déjà, et « Accept again » la rend. Les humains sont ceux de
// settings-humains, `review` coché pour bob, pour que la capture se compare à celle d'avant le bloc.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS } from "./reglages-du-projet.ts";
import { HAUTEUR, HUMAINS, humain, OUVRIR_LES_HUMAINS } from "./settings-humains.ts";

export const ecran: Ecran = {
  dit: "Les stations contributrices de « parade » sous Settings, sous ses humains : bob-pc/claude avec « Refuse », carol-mac/claude refusée avec « Accept again »",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: [...OUVRIR_LES_HUMAINS, { cliquer: `${humain("bob")} input[aria-label="review"]` }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      reglagesDuProjet: LUS,
      listerLesHumains: HUMAINS,
      enregistrerUnHumain: { pr: "https://github.com/benomite/parade/pull/2951" },
      listerLesStationsContributrices: [
        { station: "bob-pc/claude", login: "bob", refused: false },
        { station: "carol-mac/claude", login: "carol", refused: true },
      ],
    },
    envois: cuisine(RENDUS),
  }),
};
