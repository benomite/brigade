// la page d'une station dont le runtime ne publie pas encore les appels GitHub : un tiret neutre, sans erreur
import { PAR_DEFAUT, detailDe } from "./plafond-status.ts";
import { pageDeStation } from "./station-pannes.ts";

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne dont le runtime ne publie pas les appels GitHub : « GitHub calls, last hour: — »", [], detailDe(PAR_DEFAUT));
