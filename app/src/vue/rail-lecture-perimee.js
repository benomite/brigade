// @ts-check
// Le rail quand sa dernière lecture de GitHub n'a pas abouti (ticket 3008, épique 2994). L'état de lecture que la vue reçoit :
// `{ reading, readAt, stale, refusal }`. Avec une lecture, même périmée, le rail se dessine d'elle et une ligne dit son âge
// en clair — « read 4 min ago » — ; quand GitHub limite les appels du compte, la ligne le dit en mots, avec l'heure de reprise
// et l'heure de la lecture montrée. Sans lecture, une ligne d'erreur seule. Jamais de renvoi vers un panneau : les détails de
// ce que l'app a obtenu ne s'écrivent dans la ligne que si le panneau n'est pas à l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { dureeEnClair } from "./projet/delai.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/**
 * @typedef {{ kind: "rate-limit", resetAt: number | string } | { kind: "other" } | null} Refus
 * @typedef {{ reading: unknown, readAt: number | string | null, stale: boolean, refusal: Refus }} EtatDeLecture
 */

/** @param {number | string} instant */
const heure = (instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s[AP]M$/, "");

/**
 * Ce que la vue dit de la lecture : `rail` si une lecture se dessine (avec la ligne qui la marque quand elle est périmée),
 * `erreur` si rien n'a été lu, `rien` si la lecture est fraîche.
 * @param {EtatDeLecture} etat
 * @param {{ maintenant: number, essaiA?: number | string, titre?: string, pourquoi?: string, panneauVisible: boolean }} contexte `titre` : ce que la lecture ratée a dit d'elle-même ; `pourquoi` : ce que l'app a obtenu, en une phrase
 * @returns {{ sorte: "rien" } | { sorte: "rail", ligne: string, survol?: string } | { sorte: "erreur", ligne: string }}
 */
export function direLaLecture(etat, { maintenant, essaiA, titre, pourquoi, panneauVisible }) {
  const { reading, readAt, stale, refusal } = etat;
  // Un détail n'est écrit que s'il a quelque chose à dire, et seulement quand le panneau qui le porte est à l'écran.
  const detail = panneauVisible && pourquoi !== undefined && pourquoi.trim() !== "" ? pourquoi.trim() : undefined;
  if (reading === null || reading === undefined || readAt === null) {
    if (refusal === null && !stale) return { sorte: "rien" };
    const limite = refusal?.kind === "rate-limit" ? `GitHub limits this account's requests until ${heure(refusal.resetAt)}` : titre ?? "GitHub did not give the rail";
    const essai = essaiA === undefined ? "" : ` — tried at ${heure(essaiA)}`;
    return { sorte: "erreur", ligne: `the rail is not drawn: ${limite}${essai}${detail === undefined ? "" : `. ${detail}`}` };
  }
  if (!stale) return { sorte: "rien" };
  const age = `read ${dureeEnClair(maintenant - new Date(readAt).getTime())} ago`;
  const montre = `the rail shows the ${heure(readAt)} reading`;
  const cause = refusal?.kind === "rate-limit" ? `GitHub limits this account's requests until ${heure(refusal.resetAt)}` : "The last reading of GitHub failed";
  return { sorte: "rail", ligne: `${cause} — ${montre} · ${age}`, ...(detail === undefined ? {} : { survol: detail }) };
}

/**
 * La ligne posée au-dessus du rail périmé, ou la ligne d'erreur qui prend sa place.
 * @param {Fabrique} doc
 * @param {ReturnType<typeof direLaLecture>} dite
 * @returns {any[]}
 */
export function poserLaLecture(doc, dite) {
  if (dite.sorte === "rien") return [];
  const ligne = doc.createElement(dite.sorte === "erreur" ? "h3" : "p");
  ligne.textContent = dite.ligne;
  if (dite.sorte === "rail") {
    ligne.className = "fraicheur perime";
    if (dite.survol !== undefined) ligne.title = dite.survol;
  }
  return [ligne];
}
