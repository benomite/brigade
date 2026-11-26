// Ce que la section du projet dit de ses post-mortems de panne (#4023) : la liste, le plus récent d'abord, avec les cinq
// champs de chacun, et à côté le nombre de pannes que le chef a vues avant le système sur les 7 derniers jours, compté de
// « qui l'a vu en premier ». Rien d'autre : la vue (vue/project/banner-sante/PostMortems.js) le pose tel quel.
import type { PostMortemDeLaOutage } from "../facts.ts";

export const JOURS_DU_ACCOUNT = 7;

export type LineDePostMortem = { cause: string; duree: string; vuEnPremier: string; corrige: string | null; ticket: string | null; fin: string };
export type VueDesPostMortems = { lignes: LineDePostMortem[]; vusParLeChef: number };

export function vueDesPostMortems(postMortems: readonly PostMortemDeLaOutage[], maintenant: Date): VueDesPostMortems {
  const lines = [...postMortems].sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin));
  const depuis = maintenant.getTime() - JOURS_DU_ACCOUNT * 24 * 3600 * 1000;
  return { lignes: lines, vusParLeChef: lines.filter(({ vuEnPremier: vuEnFirst, fin }) => vuEnFirst === "chef" && Date.parse(fin) >= depuis).length };
}
