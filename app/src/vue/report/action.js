// @ts-check
// « report to brigade », sur chaque panne que l'app montre (ticket 1977, épique 1973) : une station en panne, un ticket
// mis de côté, une livraison que la pass n'a pas pu juger, une ligne d'erreur. Un bouton discret, à la suite de la
// panne : ce qu'il fait se lit à son survol. Un clic demande au process principal d'ouvrir, dans le navigateur, une
// nouvelle issue préremplie sur benomite/brigade (report/opening.ts) — le chef la lit, la corrige et l'envoie
// lui-même. Rien ne part de l'app.
//
// `tenirLeSignalement` ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js) et le pont, et rend
// de quoi poser le bouton sous chaque panne. Ce qu'un clic a rendu reste dit à côté du bouton, d'un dessin à l'autre,
// tant que la même panne est à l'écran. `actif` : faux sur le téléphone (l'app Android), dont le pont n'ouvre rien —
// le bouton n'y est pas posé.

import { lineError } from "../components/line-error/line-error.js";
import { button as buttonOfTheFamily } from "../components/button/button.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./opening.ts").Request} Request */
/** @typedef {import("./opening.ts").RenderedOfReport} Rendered */

export const REPORT = "report to brigade";
export const IN_PROGRESS = "opening…";
export const HOVER =
  "opens a new issue on brigade's GitHub in your browser, filled in with the app and runtime versions, your system, this failure and the log lines about it — secrets and your home folder taken out. You read it, edit it and send it yourself: nothing is sent from the app.";
export const OPEN = "opened in your browser: nothing is sent until you submit it there";

/** @param {Request} request */
const keyOf = (request) => JSON.stringify([request.projet ?? "", request.reference]);

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (skin.test.ts).
/** @param {{ doc: Fabrique, pont: { signaler(request: Request): Promise<Rendered> }, actif?: () => boolean }} options */
export function holdTheReport({ doc, pont: bridge, actif: active = () => true }) {
  /** @type {Map<string, Rendered>} */
  const renderedOnes = new Map();
  /** @type {Set<string>} */
  const inProgress = new Set();
  // Le dernier bouton posé pour chaque panne : la vue a pu redessiner pendant que le navigateur s'ouvrait.
  /** @type {Map<string, { racine: any, bouton: any }>} */
  const poses = new Map();

  /** @param {any} root @param {any} button @param {string} key */
  const tell = (root, button, key) => {
    const busy = inProgress.has(key);
    button.disabled = busy;
    button.textContent = busy ? IN_PROGRESS : REPORT;
    const rendered = renderedOnes.get(key);
    if (rendered === undefined || busy) return root.replaceChildren(button);
    if ("refus" in rendered) return root.replaceChildren(button, lineError(doc, rendered.refus, rendered.detail ?? ""));
    const opened = doc.createElement("span");
    opened.className = "signale";
    opened.textContent = OPEN;
    root.replaceChildren(button, opened);
  };

  // Le bouton d'une panne, et ce que son dernier clic a rendu — ou rien, là où il n'ouvrirait rien.
  /** @param {Request} request @returns {any[]} */
  function set(request) {
    if (!active()) return [];
    const key = keyOf(request);
    const root = doc.createElement("span");
    root.className = "signaler";
    const button = buttonOfTheFamily(doc, "", undefined, { sorte: "discret" });
    button.className = "signaler-a-brigade";
    button.title = HOVER;
    button.addEventListener("click", async () => {
      if (inProgress.has(key)) return;
      inProgress.add(key);
      renderedOnes.delete(key);
      tell(root, button, key);
      /** @type {Rendered} */
      let rendered;
      try {
        rendered = await bridge.signaler(request);
      } catch (error) {
        rendered = { refus: "the browser did not open: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
      }
      inProgress.delete(key);
      renderedOnes.set(key, rendered ?? { refus: "the browser did not open: nothing was sent" });
      const pose = poses.get(key) ?? { racine: root, bouton: button };
      tell(pose.racine, pose.bouton, key);
    });
    poses.set(key, { racine: root, bouton: button });
    tell(root, button, key);
    return [root];
  }

  return { poser: set };
}
