// le plafond réglé par le chef, avec ce qu'il remplace, et « back to the default »
import { detailDe, PAR_LE_CHEF } from "./plafond-status.ts";
import { pageDeStation } from "./station-pannes.ts";

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne : le plafond réglé par le chef, avec ce qu'il remplace, et « back to the default »", [], detailDe(PAR_LE_CHEF));
