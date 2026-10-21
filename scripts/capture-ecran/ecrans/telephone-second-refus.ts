// La même conversation, le message refusé par la station : une ligne, ce qu'elle a répondu au survol, et le texte
// gardé dans le champ (ticket 1165).
import { CONVERSATION, ENVOYER, second, TAPER } from "./telephone-second-commun.ts";

export const ecran = second("La conversation de « parade » sur le téléphone, le message refusé, le texte gardé, en 412 × 915", CONVERSATION, [TAPER, ENVOYER], {
  refus: "not sent: parade's second is not running",
  detail: "the station reached the app on atelier, which has no second open for parade — open parade there, then send again",
});
