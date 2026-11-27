// @ts-check
// Le geste de park et d'unpark, tant que le geste partagé de l'épique 4129 n'est pas là (ticket 4281) : il passe par ceux
// qui existent, les gestes d'attente du pont (wait.ts, vue/wait/wait-github.ts) — park pose l'attente (« waiting
// for… » : pour quoi, de qui, jusqu'au jour dit), unpark renvoie le ticket en cuisine, où il en était (« it arrived, back to
// the kitchen »). Le même pour tout projet : il ne lit que ce que le contrôle lui donne. Il rend ce qui s'est passé, ou
// pourquoi rien n'est parti : le contrôle le dit sous son formulaire.
// Ce module ne touche pas `document`.

/** @typedef {import("./park-control.js").Target} Target */
/** @typedef {import("./park-control.js").Ask} Ask */
/** @typedef {(project: string, id: string, ticket: number, input?: { quoi: string, qui: string, relance: string }) => Promise<unknown>} Wait */

const NO_KITCHEN = "nothing sent: this app does not play the kitchen's gestures for this project";
const UNREAD = "nothing sent: the app did not say what happened";

// Le geste s'écrit sur l'issue, jamais par une commande de la box (main.ts, ticket 4262) : le pont rend un fait ou un refus.
/** @param {Wait} wait @param {{ lire: () => void }} suites */
export function parkGesture(wait, { lire: read }) {
  /** @param {Target} target @param {Ask} ask @returns {Promise<{ fait: string } | { refus: string, detail: string }>} */
  return async ({ project, ticket }, ask) => {
    /** @type {any} */
    let rendered;
    try {
      rendered = ask.action === "park" ? await wait(project, "attente-poser", ticket, { quoi: ask.what, qui: ask.who, relance: ask.until }) : await wait(project, "attente-arrivee", ticket);
    } catch (error) {
      return { refus: `nothing sent: ${error instanceof Error ? error.message : String(error)}`, detail: "" };
    }
    if (rendered === undefined || rendered === null) return { refus: NO_KITCHEN, detail: "" };
    if (typeof rendered !== "object") return { refus: UNREAD, detail: String(rendered) };
    if ("refus" in rendered) return { refus: rendered.refus, detail: rendered.detail ?? "" };
    if (!("fait" in rendered)) return { refus: UNREAD, detail: "" };
    read();
    return { fait: rendered.fait };
  };
}
