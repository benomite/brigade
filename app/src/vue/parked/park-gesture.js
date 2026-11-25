// @ts-check
// Le geste de park et d'unpark, tant que le geste partagé de l'épique 4129 n'est pas là (ticket 4281) : il passe par ceux
// qui existent, les gestes d'attente du pont (attente.ts, vue/attente/attente-github.ts) — park pose l'attente (« waiting
// for… » : pour quoi, de qui, jusqu'au jour dit), unpark renvoie le ticket en cuisine, où il en était (« it arrived, back to
// the kitchen »). Le même pour tout projet : il ne lit que ce que le contrôle lui donne. Il rend ce qui s'est passé, ou
// pourquoi rien n'est parti : le contrôle le dit sous son formulaire.
// Ce module ne touche pas `document`.

/** @typedef {import("./park-control.js").Target} Target */
/** @typedef {import("./park-control.js").Ask} Ask */
/** @typedef {(projet: string, id: string, ticket: number, saisie?: { quoi: string, qui: string, relance: string }) => Promise<unknown>} Attente */

const NO_KITCHEN = "nothing sent: this app does not play the kitchen's gestures for this project";
const SENT_TO_SECOND = "sent: its command runs in the second";

/** @param {Attente} attente @param {{ lire: () => void, garder: (projet: string, terminal: any) => void }} suites */
export function parkGesture(attente, { lire, garder }) {
  /** @param {Target} target @param {Ask} ask @returns {Promise<{ fait: string } | { refus: string, detail: string }>} */
  return async ({ project, ticket }, ask) => {
    /** @type {any} */
    let rendu;
    try {
      rendu = ask.action === "park" ? await attente(project, "attente-poser", ticket, { quoi: ask.what, qui: ask.who, relance: ask.until }) : await attente(project, "attente-arrivee", ticket);
    } catch (erreur) {
      return { refus: `nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`, detail: "" };
    }
    if (rendu === undefined || rendu === null) return { refus: NO_KITCHEN, detail: "" };
    if ("refus" in rendu) return { refus: rendu.refus, detail: rendu.detail ?? "" };
    if ("fait" in rendu) {
      lire();
      return { fait: rendu.fait };
    }
    garder(project, rendu);
    return { fait: SENT_TO_SECOND };
  };
}
