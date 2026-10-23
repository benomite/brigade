// Le merge de #12 que GitHub refuse de poster (#1590) : une phrase sur la ligne, ce que GitHub a dit au survol, et ses
// boutons restent.
import { CONFIRMER, ECHEC, espaceDuTableau, LU, MERGER_LA_PREMIERE } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le merge de #12 que GitHub refuse de poster (#1590) : une phrase sur la ligne, les boutons restent", LU, { box: false, etapes: [MERGER_LA_PREMIERE, CONFIRMER], geste: ECHEC });
