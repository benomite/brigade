// La date d'un ticket parqué (#4129, d'abord WAITING, #1834) : sa lecture, telle que le chef la tape, et ce que le
// journal de la box garde des attentes d'avant — `status` les relit comme historique. Parquer un ticket, et l'en sortir,
// s'écrit sur son issue (attente-github/attente-github.ts), sans box.
import { dateLocale, direInstant, direInstantEn, dureeTapee } from "./instants.ts";
import { direALArrivee, direALArriveeEn, type AttenteDeTiers } from "./projections/rail.ts";
import { GesteRefuse } from "./rail.ts";

// La date proposée quand le chef n'en donne pas : dans sept jours.
export const RELANCE_PAR_DEFAUT_MS = 7 * 24 * 3_600_000;

// Lit `--until` : une date (2026-10-21, ce jour-là à minuit, heure de la
// box), une date et une heure (2026-10-21T09:00), ou une durée à partir de
// maintenant (7j, 36h). Elle doit être à venir.
export function lireRelance(valeur: string, maintenant: Date): Date {
  const duree = dureeTapee(valeur);
  const complet = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}))?$/.exec(valeur);
  const instant =
    duree !== null
      ? new Date(maintenant.getTime() + duree)
      : complet
        ? dateLocale(Number(complet[1]), Number(complet[2]), Number(complet[3]), Number(complet[4] ?? 0), Number(complet[5] ?? 0))
        : null;
  if (instant === null || Number.isNaN(instant.getTime())) {
    throw new GesteRefuse(`--until: “${valeur}” cannot be read — expected a date (2026-10-21), a date and a time (2026-10-21T09:00) or a duration (7j, 36h)`);
  }
  if (instant.getTime() <= maintenant.getTime()) throw new GesteRefuse(`--until: ${valeur} has already passed — the date a ticket is parked until is in the future`);
  return instant;
}

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
