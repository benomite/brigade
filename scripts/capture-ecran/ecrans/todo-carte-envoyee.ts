// La même file de « parade », l'app redémarrée alors que la réponse du chef à la carte de #21 attend la cuisine
// (#1841) : rien n'a été cliqué dans cette app, seul le tableau de la cuisine est relu — son commentaire
// `/brigade choose #21 1`, sans réponse de la box. La carte dit sa réponse envoyée, en attente de la cuisine, et
// n'offre plus la question comme sans réponse. #12 attend toujours le chef.
import { cuisine, MAINTENANT, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ecran as cartes, FACTS, STATUS } from "./todo-cartes.ts";

const PARADE = RENDUS.parade as Rendu;
const ENVOIS = [{ ticket: 21, commentaire: 9001, url: "https://github.com/chef/parade/issues/7#issuecomment-9001", le: MAINTENANT, choix: 1, etat: "attente" as const }];

export const ecran: Ecran = {
  ...cartes,
  dit: "La même file, l'app redémarrée : la réponse à la carte de #21 est postée sur le tableau, la box n'y a pas encore répondu — la carte la dit envoyée, en attente de la cuisine",
  donnees: () => ({ ...cartes.donnees(), envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS, envois: ENVOIS } }) }),
};
