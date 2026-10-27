// La même file de « parade », la réponse du chef à la carte de #21 jouée par la cuisine (#1281, #1841) : le tableau
// de la cuisine relu porte le commentaire `/brigade choose #21 1` et la réponse de la box sous lui, `**Done**`, que
// son bloc n'a pas encore suivie — la carte est encore dans la file. Elle sort de l'attente : « played by the
// kitchen », la ligne de la box au survol, son bord éteint, ni choix ni champ.
import { cuisine, MAINTENANT, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ecran as cartes, FACTS, STATUS } from "./todo-cartes.ts";

const PARADE = RENDUS.parade as Rendu;
const ENVOIS = [
  {
    ticket: 21,
    commentaire: 9001,
    url: "https://github.com/chef/parade/issues/7#issuecomment-9001",
    le: MAINTENANT,
    choix: 1,
    etat: "joue" as const,
    dit: "Done — choose #21 1 — cost: your answer is written on the issue in your name, and the kitchen takes the ticket up again with it",
  },
];

export const ecran: Ecran = {
  ...cartes,
  dit: "La même file, la réponse à la carte de #21 jouée par la cuisine : la carte le dit, « played by the kitchen », sans choix ni champ",
  donnees: () => ({ ...cartes.donnees(), envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS, envois: ENVOIS } }) }),
};
