// La même conversation, le message parti et la station pas encore revenue : le champ et « send » attendent (ticket 1165).
import { CONVERSATION, ENVOYER, second, TAPER } from "./telephone-second-commun.ts";

export const ecran = second("La conversation de « parade » sur le téléphone, le message parti, en attente de la station, en 412 × 915", CONVERSATION, [TAPER, ENVOYER], { __enAttente: true });
