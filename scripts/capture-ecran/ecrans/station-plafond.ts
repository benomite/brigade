// le plafond de cooks par défaut, tel que la box le dit (3 at most — 8 cores), et son réglage
import { detailDe, PAR_DEFAUT } from "./plafond-status.ts";
import { pageDeStation } from "./station-pannes.ts";

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne : le plafond de cooks par défaut, tel que la box le dit (3 at most — 8 cores), et son réglage", [], detailDe(PAR_DEFAUT));
