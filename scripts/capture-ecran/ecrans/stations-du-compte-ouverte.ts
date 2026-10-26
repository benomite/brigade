// parade-box ouverte (#1706) : les dépôts du chef à cocher, ceux qu'elle sert cochés.
import { BOX, LISTEES, ligne, stationsDuCompte } from "./stations-du-compte-commun.ts";

export const ecran = stationsDuCompte("Les stations du compte, parade-box cliquée (#1706) : les dépôts du chef en cases, ceux qu'elle sert cochés", LISTEES, [ligne(BOX)]);
