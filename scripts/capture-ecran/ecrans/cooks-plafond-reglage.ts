// L'onglet Cooks de « parade », son plafond de calibrage ouvert (#1309) : lu par `setting` dans les réglages du projet,
// c'est la même rangée que sous Settings — sa valeur, d'où elle vient, et « propose », qui ouvre une PR sur son dépôt.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS, STATUS } from "./cooks-page.ts";
import { LUS } from "./reglages-du-projet.ts";

const PARADE = RENDUS.parade as Rendu;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », son plafond de calibrage ouvert : la rangée des réglages du projet — sa valeur, d'où elle vient, et « propose »",
  largeur: 1366,
  hauteur: 1400,
  etapes: [
    { cliquer: '#projets > button[title^="parade — "]' },
    { cliquer: "#onglets-du-projet button:nth-child(2)" },
    { cliquer: "#plafond-du-projet summary" },
    { saisir: '#plafond-du-projet select[aria-label$="model"]', texte: "sonnet" },
  ],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
