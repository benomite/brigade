// Ce que la section du projet dit de ses post-mortems de panne (#4023) : la liste, le plus récent d'abord, avec les cinq
// champs de chacun, et à côté le nombre de pannes que le chef a vues avant le système sur les 7 derniers jours, compté de
// « qui l'a vu en premier ». Rien d'autre : la vue (vue/project/banner-health/PostMortems.js) le pose tel quel.
import type { PostMortemOfTheOutage } from "../facts.ts";

export const DAYS_OF_ACCOUNT = 7;

export type LineOfPostMortem = { cause: string; duree: string; vuEnPremier: string; corrige: string | null; ticket: string | null; fin: string };
export type VueOfPostMortems = { lignes: LineOfPostMortem[]; vusParLeChef: number };

export function vueOfPostMortems(postMortems: readonly PostMortemOfTheOutage[], now: Date): VueOfPostMortems {
  const lines = [...postMortems].sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin));
  const since = now.getTime() - DAYS_OF_ACCOUNT * 24 * 3600 * 1000;
  return { lignes: lines, vusParLeChef: lines.filter(({ vuEnPremier: seenEnFirst, fin: end }) => seenEnFirst === "chef" && Date.parse(end) >= since).length };
}
