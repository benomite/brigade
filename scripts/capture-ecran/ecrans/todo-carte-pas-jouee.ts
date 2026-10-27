// La même file de « parade », la réponse du chef à la carte de #21 que la cuisine n'a pas jouée (#1841) : le tableau
// de la cuisine relu porte le commentaire `/brigade choose #21 1` et la réponse de la box sous lui, `**Not done**`, et
// sa raison. La carte sort de l'attente : « not played by the kitchen: <raison> » en une ligne, la ligne de la box au
// survol, et ses choix et son champ rendus — le chef peut répondre de nouveau.
import { cuisine, MAINTENANT, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ecran as cartes, FACTS, STATUS } from "./todo-cartes.ts";

const PARADE = RENDUS.parade as Rendu;
const RAISON = "GitHub calls are below the reserve: the box answers again after 17:21";
const ENVOIS = [
  {
    ticket: 21,
    commentaire: 9001,
    url: "https://github.com/chef/parade/issues/7#issuecomment-9001",
    le: MAINTENANT,
    choix: 1,
    etat: "refuse" as const,
    dit: `Not done — choose #21 1: ${RAISON}`,
    raison: RAISON,
  },
];

export const ecran: Ecran = {
  ...cartes,
  dit: "La même file, la réponse à la carte de #21 que la cuisine n'a pas jouée : la raison en une ligne, et la carte rend ses choix",
  donnees: () => ({ ...cartes.donnees(), envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS, envois: ENVOIS } }) }),
};
