// La même conversation, le message envoyé d'ici arrivé dans la conversation du desktop : le second écrit sa réponse
// (ticket 1165).
import { CONVERSATION, ENVOYEE, ENVOYER, second, TAPER } from "./telephone-second-commun.ts";

export const ecran = second("La conversation de « parade » sur le téléphone, le message arrivé, le second qui répond, en 412 × 915", CONVERSATION, [TAPER, ENVOYER], ENVOYEE);
