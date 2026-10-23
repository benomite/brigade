// Le merge de #12 posté, puis lu par la box (#1590) : le tableau qu'elle a réécrit le porte pris, et la ligne dit
// « merge the PR: taken into account » — sa réponse, et ce qu'il a coûté, au survol.
import { CONFIRMER, espaceDuTableau, MERGER_LA_PREMIERE, POSTE, PRIS } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le merge de #12 pris par la box (#1590) : la ligne dit « taken into account »", PRIS, { box: false, etapes: [MERGER_LA_PREMIERE, CONFIRMER], geste: POSTE });
