
// `signal` : ce qui demande l'attention. `repere` : la file ne dit pas tout, la fiche le détaille. `liens` : les tickets que la
// ligne nomme et que la carte ouvre d'un clic.
export type LineOfCard = { ligne: string; signal?: string; repere?: true; liens?: number[] };

export const READY = "ready, waits for a place in the kitchen";
export const AWAITS_YOUR_DECISION = "waits for your decision";
export const BLOCKED = "blocked";
export const SET_ASIDE = "set aside";



// Sur le rail, rien ne le tient : ce qui le retient s'il y en a, sinon il attend sa place.
// Un retenu par des tickets se dit « Waiting for #a, #b » ; un texte sans numéro est relayé tel quel.
export function queuedLine(state: string, holds: string | undefined): LineOfCard {
  const numbers = [...new Set((holds?.match(/#\d+/g) ?? []).map((number) => Number(number.slice(1))))];
  const sentence = numbers.length > 0 ? `Waiting for ${numbers.map((n) => `#${n}`).join(", ")}` : holds;
  const links = numbers.length > 0 ? { liens: numbers } : {};
  if (state === "BLOQUÉ") return { ligne: sentence ?? BLOCKED, signal: BLOCKED, ...links, ...(sentence === undefined ? { repere: true as const } : {}) };
  return { ligne: sentence ?? READY, ...links };
}




// Qui m'attend : ce qu'on attend du chef, en une phrase.
export const lineAwaitingMe = (sentence: string | undefined): LineOfCard => (sentence === undefined ? { ligne: AWAITS_YOUR_DECISION, repere: true } : { ligne: sentence });




// Une carte que l'app n'a pas su lire — la box en sait plus qu'elle : la forme est plus récente. Seule cette carte en pâtit.
export const lineUnreadable = (): LineOfCard => ({ ligne: "the app could not read this card — update the app to fix it", signal: "unreadable" });
