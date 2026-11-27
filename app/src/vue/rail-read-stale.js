// @ts-check
// Le rail quand sa dernière lecture de GitHub n'a pas abouti (ticket 3008, épique 2994). L'état de lecture que la vue reçoit :
// `{ reading, readAt, stale, refusal }`. Avec une lecture, même périmée, le rail se dessine d'elle et une ligne dit son âge
// en clair — « read 4 min ago » — ; quand GitHub limite les appels du compte, la ligne le dit en mots, avec l'heure de reprise
// et l'heure de la lecture montrée. Sans lecture, une ligne d'erreur seule. Jamais de renvoi vers un panneau : les détails de
// ce que l'app a obtenu ne s'écrivent dans la ligne que si le panneau n'est pas à l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { durationEnClear } from "./project/delay.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/**
 * @typedef {{ kind: "rate-limit", resetAt: number | string } | { kind: "other" } | null} Refusal
 * @typedef {{ reading: unknown, readAt: number | string | null, stale: boolean, refusal: Refusal }} StateOfRead
 */

/** @param {number | string} instant */
const hour = (instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s[AP]M$/, "");

/**
 * Ce que la vue dit de la lecture : `rail` si une lecture se dessine (avec la ligne qui la marque quand elle est périmée),
 * `erreur` si rien n'a été lu, `rien` si la lecture est fraîche.
 * @param {StateOfRead} state
 * @param {{ maintenant: number, essaiA?: number | string, titre?: string, pourquoi?: string, panneauVisible: boolean }} contexte `titre` : ce que la lecture ratée a dit d'elle-même ; `pourquoi` : ce que l'app a obtenu, en une phrase
 * @returns {{ sorte: "rien" } | { sorte: "rail", ligne: string, survol?: string } | { sorte: "erreur", ligne: string }}
 */
export function tellTheRead(state, { maintenant: now, essaiA: trialA, titre: title, pourquoi: why, panneauVisible: panelVisible }) {
  const { reading, readAt, stale, refusal } = state;
  // Un détail n'est écrit que s'il a quelque chose à dire, et seulement quand le panneau qui le porte est à l'écran.
  const detail = panelVisible && why !== undefined && why.trim() !== "" ? why.trim() : undefined;
  if (reading === null || reading === undefined || readAt === null) {
    if (refusal === null && !stale) return { sorte: "rien" };
    const limit = refusal?.kind === "rate-limit" ? `GitHub limits this account's requests until ${hour(refusal.resetAt)}` : title ?? "GitHub did not give the rail";
    const trial = trialA === undefined ? "" : ` — tried at ${hour(trialA)}`;
    return { sorte: "erreur", ligne: `the rail is not drawn: ${limit}${trial}${detail === undefined ? "" : `. ${detail}`}` };
  }
  if (!stale) return { sorte: "rien" };
  const age = `read ${durationEnClear(now - new Date(readAt).getTime())} ago`;
  const shows = `the rail shows the ${hour(readAt)} reading`;
  const cause = refusal?.kind === "rate-limit" ? `GitHub limits this account's requests until ${hour(refusal.resetAt)}` : "The last reading of GitHub failed";
  return { sorte: "rail", ligne: `${cause} — ${shows} · ${age}`, ...(detail === undefined ? {} : { survol: detail }) };
}

/**
 * La ligne posée au-dessus du rail périmé, ou la ligne d'erreur qui prend sa place.
 * @param {Fabrique} doc
 * @param {ReturnType<typeof tellTheRead>} saidOne
 * @returns {any[]}
 */
export function setTheRead(doc, saidOne) {
  if (saidOne.sorte === "rien") return [];
  const line = doc.createElement(saidOne.sorte === "erreur" ? "h3" : "p");
  line.textContent = saidOne.ligne;
  if (saidOne.sorte === "rail") {
    line.className = "fraicheur perime";
    if (saidOne.survol !== undefined) line.title = saidOne.survol;
  }
  return [line];
}
