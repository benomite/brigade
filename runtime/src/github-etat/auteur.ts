// Qui a écrit une issue ? Le manager ne met sur le rail que ce que quelqu'un qui a la main sur
// le dépôt a écrit : propriétaire, membre ou collaborateur. L'issue de tout autre auteur
// (`NONE`, `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`…) est écartée, `untrusted-author` : son
// texte est celui d'un inconnu, et le manager ne le lit pas comme une instruction. Elle
// n'entre au rail que par la réponse du chef ou de l'humain `product` à la carte de
// `issue-etrangere/`, ou par un label qu'un membre de confiance y pose (#2619).
import { DE_CONFIANCE } from "../alimenter.ts";

// Un ticket qu'une station a déposé (#3012) porte les marques cachées `brigade:projet` ou
// `brigade:famille` : c'est une mesure, pas l'issue d'un inconnu, quel que soit le compte GitHub
// de la station. Mais la marque est du texte, qu'un inconnu écrit aussi : elle ne vaut que
// de la part d'un compte que le projet déclare (`humans`), jamais seule.
const MARQUE_DE_STATION = /<!-- brigade:(?:projet=|famille )/;
export const deposeParUneStation = (body: string): boolean => MARQUE_DE_STATION.test(body);

const meme = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();

export const auteurSansEcriture = (issue: { association: string; body?: string; author?: string }, declares: readonly string[] = []): boolean =>
  !DE_CONFIANCE.includes(issue.association) &&
  !(deposeParUneStation(issue.body ?? "") && issue.author !== undefined && issue.author !== "" && declares.some((login) => meme(login, issue.author as string)));
