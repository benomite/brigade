// Le Mac, arrêté, ouvert (#1706) : il se dit indisponible, et ses cases restent à cocher.
import { LISTEES, ligne, MAC, stationsDuCompte } from "./stations-du-compte-commun.ts";

export const ecran = stationsDuCompte("Les stations du compte, le Mac indisponible cliqué (#1706) : la ligne qui le dit, et ses cases à cocher", LISTEES, [ligne(MAC)]);
