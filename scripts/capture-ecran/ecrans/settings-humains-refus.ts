// Les humains de « parade » sous Settings (#2930), un humain ajouté refusé : « add a human », `ghost-user` écrit et
// `product` coché — le service refuse un login que GitHub ne connaît pas. Le refus se dit en une ligne sur sa rangée
// seule, qui ne dit aucune PR ; les autres rangées ne bougent pas.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS } from "./reglages-du-projet.ts";
import { HAUTEUR, HUMAINS, OUVRIR_LES_HUMAINS } from "./settings-humains.ts";

const NEUVE = "#humains-du-projet .humain.neuf";

export const ecran: Ecran = {
  dit: "Les humains de « parade » sous Settings, `ghost-user` ajouté et refusé : le refus en une ligne sur sa rangée seule, aucune PR dite",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: [
    ...OUVRIR_LES_HUMAINS,
    { cliquer: "#humains-du-projet .tete .ajouter > button" },
    { saisir: `${NEUVE} input.login`, texte: "ghost-user" },
    { cliquer: `${NEUVE} input[aria-label="product"]` },
  ],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      reglagesDuProjet: LUS,
      listerLesHumains: HUMAINS,
      enregistrerUnHumain: { refus: "ghost-user is not a GitHub account: nothing was written" },
    },
    envois: cuisine(RENDUS),
  }),
};
