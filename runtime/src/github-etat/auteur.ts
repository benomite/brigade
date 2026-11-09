// L'auteur d'une issue qui n'a pas l'écriture sur le dépôt (#2619, #2934) : ce
// que GitHub dit de son lien avec le dépôt (`author_association`), lu comme le
// reste de la cuisine lit un commentaire qui fait foi (`DE_CONFIANCE`). Le
// propriétaire, un membre de l'organisation, un collaborateur : l'écriture.
// Tout autre — un contributeur, un premier contributeur, un inconnu — : moins
// que l'écriture. Son issue n'entre sur le rail qu'à travers le tri de
// `issue-etrangere/`, ou un label qu'un membre de confiance y pose (#2619).
import { DE_CONFIANCE } from "../alimenter.ts";

// Un ticket qu'une station a déposé (#3012) porte les marques cachées `brigade:projet` ou
// `brigade:famille` : c'est une mesure, pas l'issue d'un inconnu, quel que soit le compte GitHub
// de la station. Il va au manager comme les tickets de la cuisine.
const MARQUE_DE_STATION = /<!-- brigade:(?:projet=|famille )/;
export const deposeParUneStation = (body: string): boolean => MARQUE_DE_STATION.test(body);

export const auteurSansEcriture = (issue: { association: string; body?: string }): boolean =>
  !DE_CONFIANCE.includes(issue.association) && !deposeParUneStation(issue.body ?? "");
