// Ce que la section du projet dit de ses post-mortems de panne (#4023) : la liste, le plus récent d'abord, avec les cinq
// champs de chacun, et à côté le nombre de pannes que le chef a vues avant le système sur les 7 derniers jours, compté de
// « qui l'a vu en premier ». Rien d'autre : la vue (vue/projet/bandeau-sante/PostMortems.js) le pose tel quel.
import type { PostMortemDeLaPanne } from "../faits.ts";

export const JOURS_DU_COMPTE = 7;

export type LigneDePostMortem = { cause: string; duree: string; vuEnPremier: string; corrige: string | null; ticket: string | null; fin: string };
export type VueDesPostMortems = { lignes: LigneDePostMortem[]; vusParLeChef: number };

export function vueDesPostMortems(postMortems: readonly PostMortemDeLaPanne[], maintenant: Date): VueDesPostMortems {
  const lignes = [...postMortems].sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin));
  const depuis = maintenant.getTime() - JOURS_DU_COMPTE * 24 * 3600 * 1000;
  return { lignes, vusParLeChef: lignes.filter(({ vuEnPremier, fin }) => vuEnPremier === "chef" && Date.parse(fin) >= depuis).length };
}
