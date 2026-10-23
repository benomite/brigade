// Le Rail de `parade` lu de son tableau, sur un poste sans `ssh` ni station (#1590) : « merge the PR » cliqué sur #12 —
// la confirmation sur la ligne, ce que fait le merge et son prix en une ligne, « yes, merge it » et « cancel ».
import { espaceDuTableau, LU, MERGER_LA_PREMIERE } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le tableau de « parade », « merge the PR » cliqué sur #12 (#1590) : la confirmation sur la ligne et son prix en une ligne", LU, { box: false, etapes: [MERGER_LA_PREMIERE] });
