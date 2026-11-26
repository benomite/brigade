// La date d'un ticket parqué (#4129, d'abord WAITING, #1834) : celle que la cuisine prend sans date dite, et ce que le
// journal de la box garde des attentes d'avant — `status` les relit comme historique. Parquer un ticket, et l'en sortir,
// s'écrit sur son issue (attente-github/attente-github.ts), sans box.
import { direInstant, direInstantEn } from "./instants.ts";
import { direALArrivee, direALArriveeEn, type AttenteDeTiers } from "./projections/rail.ts";

// La date proposée quand le chef n'en donne pas : dans sept jours.
export const RELANCE_PAR_DEFAUT_MS = 7 * 24 * 3_600_000;

// Ce qu'un ticket en WAITING attend, sur une ligne : de qui, quoi, depuis
// quand, la relance, et ce qui se passera à l'arrivée.
export function direAttenteDeTiers(attente: AttenteDeTiers, depuis: (instant: string) => string): string {
  return `attend ${attente.who} : « ${attente.what} » — depuis ${depuis(attente.since)}, relance le ${direInstant(attente.followUp)} — à l'arrivée, ${attente.onArrival}`;
}

// `onArrival` se lit en français sur le rail (et dans `facts`) : sa forme
// anglaise est recalculée, pour `status` comme pour l'issue.
function alArriveeEn(attente: AttenteDeTiers): string {
  const livraison = ["open", null].find((delivery) => direALArrivee(delivery) === attente.onArrival);
  return livraison === undefined ? attente.onArrival : direALArriveeEn(livraison);
}

// La même, en anglais : la ligne du ticket dans `status`.
export function direAttenteDeTiersEn(attente: AttenteDeTiers, depuis: (instant: string) => string): string {
  const alArrivee = alArriveeEn(attente);
  return `awaiting ${attente.who}: “${attente.what}” — since ${depuis(attente.since)}, follow-up on ${direInstantEn(attente.followUp)} — on arrival, ${alArrivee}`;
}
