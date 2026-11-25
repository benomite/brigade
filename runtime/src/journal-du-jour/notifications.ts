// The notification rule of the logbook (#4280, spec 2026-11-23-autonomy-trust-control, T1 and « Alerts »): the
// logbook is a reading, not an alert. Of all the gestures of the agents' threads — delivered, broke, fixed, the
// system's own mistakes —, only the one handed to the chef sends a notification: the system gave up and needs them.
// Building the logbook or the digest never calls this.
import { OUTCOME } from "../autonomie/agents/gestes.ts";

// A gesture of an agent's thread, as the gesture log keeps it (`autonomie/agents/gestes.ts`). `kind` says what it was
// in the logbook's words (delivered, broke, fixed, unfixed, mistake), when the agent said it.
export type GesteDuFil = { at: string; line: string; reason: string; outcome: string; kind?: string };

export type NotificationDAbandon = { title: string; at: string; line: string; reason: string };

const TITRE = "The kitchen gave up and needs you";

// A give-up: a gesture handed to the chef. The digest lists the same ones (digest.ts).
export const estUnAbandon = ({ outcome }: GesteDuFil): boolean => outcome === OUTCOME.HANDED_TO_CHEF;

// The notifications these gestures call for: one per gesture handed to the chef, none for any other.
export function notificationsDuJournal(gestes: readonly GesteDuFil[]): NotificationDAbandon[] {
  return gestes.filter(estUnAbandon).map(({ at, line, reason }) => ({ title: TITRE, at, line, reason }));
}

// Sends each notification these gestures call for.
export function notifierLesAbandons(gestes: readonly GesteDuFil[], notifier: (notification: NotificationDAbandon) => void): void {
  for (const notification of notificationsDuJournal(gestes)) notifier(notification);
}
