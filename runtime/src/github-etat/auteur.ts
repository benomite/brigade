// Qui a écrit une issue ? Le manager ne met sur le rail que ce que quelqu'un qui a la main sur
// le dépôt a écrit : propriétaire, membre ou collaborateur. L'issue de tout autre auteur
// (`NONE`, `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`…) est écartée, `untrusted-author` : son
// texte est celui d'un inconnu, et le manager ne le lit pas comme une instruction. Elle
// n'entre au rail que par la réponse du chef ou de l'humain `product` à la carte de
// `issue-etrangere/`, ou par un label qu'un membre de confiance y pose (#2619).
import { DE_CONFIANCE } from "../alimenter.ts";
import { auteurInterne } from "../auteur-interne.ts";

// Un ticket qu'une station a déposé (#3012) porte la marque cachée `brigade:projet` :
// ce n'est pas l'issue d'un inconnu, quel que soit le compte GitHub
// de la station. Mais la marque est du texte, qu'un inconnu écrit aussi : elle ne vaut que
// de la part d'un compte que le projet déclare (`humans`), jamais seule.
const MARQUE_DE_STATION = /<!-- brigade:projet=/;
export const deposeParUneStation = (body: string): boolean => MARQUE_DE_STATION.test(body);

const meme = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();

// `aLaMain` : ce que la porte de confiance (`trust/trust.ts`, #4422) dit de l'auteur — le chef, l'écriture sur le
// dépôt, un agent de la cuisine —, quand elle l'a dit ; sans elle, le lien que GitHub donne de l'auteur au dépôt.
export const auteurSansEcriture = (issue: { association: string; body?: string; author?: string }, declares: readonly string[] = [], aLaMain?: boolean): boolean =>
  !(aLaMain ?? DE_CONFIANCE.includes(issue.association)) &&
  !auteurInterne(issue.author) &&
  !(deposeParUneStation(issue.body ?? "") && issue.author !== undefined && issue.author !== "" && declares.some((login) => meme(login, issue.author as string)));
