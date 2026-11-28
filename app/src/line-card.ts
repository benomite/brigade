import { dayOf } from "./vue/wait/input.ts";

// `signal` : ce qui demande l'attention. `repere` : la file ne dit pas tout, la fiche le détaille. `liens` : les tickets que la
// ligne nomme et que la carte ouvre d'un clic.
export type LineOfCard = { ligne: string; signal?: string; repere?: true; liens?: number[] };

export const READY = "ready, waits for a place in the kitchen";
export const AWAITS_YOUR_DECISION = "waits for your decision";
export const BLOCKED = "blocked";
export const SET_ASIDE = "set aside";
export const RELAUNCH_PAST = "follow-up date passed";



// Sur le rail, rien ne le tient : ce qui le retient s'il y en a, sinon il attend sa place.
// Un retenu par des tickets se dit « Waiting for #a, #b » ; un texte sans numéro est relayé tel quel.
export function queuedLine(state: string, holds: string | undefined): LineOfCard {
  const numbers = [...new Set((holds?.match(/#\d+/g) ?? []).map((number) => Number(number.slice(1))))];
  const sentence = numbers.length > 0 ? `Waiting for ${numbers.map((n) => `#${n}`).join(", ")}` : holds;
  const links = numbers.length > 0 ? { liens: numbers } : {};
  if (state === "BLOQUÉ") return { ligne: sentence ?? BLOCKED, signal: BLOCKED, ...links, ...(sentence === undefined ? { repere: true as const } : {}) };
  return { ligne: sentence ?? READY, ...links };
}


// Mis de côté (86) : sa raison, telle que le runtime la donne.
export const lineSetAside = (reason: string): LineOfCard => ({ ligne: reason, signal: SET_ASIDE });


// Qui m'attend : ce qu'on attend du chef, en une phrase.
export const lineAwaitingMe = (sentence: string | undefined): LineOfCard => (sentence === undefined ? { ligne: AWAITS_YOUR_DECISION, repere: true } : { ligne: sentence });

// En WAITING : ce qu'il attend, de qui, et le jour de sa relance, au calendrier du poste (#3075) ; la relance passée est
// le signal.
export const lineInWaiting = (third: { quoi: string; qui: string; relance?: string | null } | null | undefined, relaunchPast: boolean): LineOfCard =>
  third == null
    ? { ligne: "waits for a third party", repere: true }
    : { ligne: `waiting for ${third.quoi} · from ${third.qui}${third.relance == null ? "" : ` · follow-up ${dayOf(new Date(third.relance))}`}`, ...(relaunchPast ? { signal: RELAUNCH_PAST } : {}) };



// Une carte que l'app n'a pas su lire — la box en sait plus qu'elle : la forme est plus récente. Seule cette carte en pâtit.
export const lineUnreadable = (): LineOfCard => ({ ligne: "the app could not read this card — update the app to fix it", signal: "unreadable" });
