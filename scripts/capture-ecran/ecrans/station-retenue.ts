// la station saturée : ce qui retient les tickets (mémoire et processeur, valeur et seuil), au-dessus du plafond
import { detailDe, RETENUE } from "./plafond-status.ts";
import { pageDeStation } from "./station-pannes.ts";

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne : la station saturée : ce qui retient les tickets (mémoire et processeur, valeur et seuil), au-dessus du plafond", [], detailDe(RETENUE));
