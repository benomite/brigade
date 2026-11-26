// @ts-check
// « report to brigade », sur chaque panne que l'app montre (ticket 1977, épique 1973) : une station en panne, un ticket
// mis de côté, une livraison que la pass n'a pas pu juger, une ligne d'erreur. Un bouton discret, à la suite de la
// panne : ce qu'il fait se lit à son survol. Un clic demande au process principal d'ouvrir, dans le navigateur, une
// nouvelle issue préremplie sur benomite/brigade (report/ouverture.ts) — le chef la lit, la corrige et l'envoie
// lui-même. Rien ne part de l'app.
//
// `tenirLeSignalement` ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et le pont, et rend
// de quoi poser le bouton sous chaque panne. Ce qu'un clic a rendu reste dit à côté du bouton, d'un dessin à l'autre,
// tant que la même panne est à l'écran. `actif` : faux sur le téléphone (l'app Android), dont le pont n'ouvre rien —
// le bouton n'y est pas posé.

import { lineError } from "../composants/line-error/line-error.js";
import { button as buttonDeLaFamille } from "../composants/button/button.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./ouverture.ts").Request} Request */
/** @typedef {import("./ouverture.ts").RenduDuReport} Rendu */

export const SIGNALER = "report to brigade";
export const EN_COURS = "opening…";
export const SURVOL =
  "opens a new issue on brigade's GitHub in your browser, filled in with the app and runtime versions, your system, this failure and the log lines about it — secrets and your home folder taken out. You read it, edit it and send it yourself: nothing is sent from the app.";
export const OUVERT = "opened in your browser: nothing is sent until you submit it there";

/** @param {Request} request */
const cleDe = (request) => JSON.stringify([request.projet ?? "", request.reference]);

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (peau.test.ts).
/** @param {{ doc: Fabrique, pont: { signaler(request: Request): Promise<Rendu> }, actif?: () => boolean }} options */
export function holdLeReport({ doc, pont, actif = () => true }) {
  /** @type {Map<string, Rendu>} */
  const rendus = new Map();
  /** @type {Set<string>} */
  const enCours = new Set();
  // Le dernier bouton posé pour chaque panne : la vue a pu redessiner pendant que le navigateur s'ouvrait.
  /** @type {Map<string, { racine: any, bouton: any }>} */
  const poses = new Map();

  /** @param {any} racine @param {any} button @param {string} cle */
  const tell = (racine, button, cle) => {
    const occupe = enCours.has(cle);
    button.disabled = occupe;
    button.textContent = occupe ? EN_COURS : SIGNALER;
    const rendu = rendus.get(cle);
    if (rendu === undefined || occupe) return racine.replaceChildren(button);
    if ("refus" in rendu) return racine.replaceChildren(button, lineError(doc, rendu.refus, rendu.detail ?? ""));
    const ouvert = doc.createElement("span");
    ouvert.className = "signale";
    ouvert.textContent = OUVERT;
    racine.replaceChildren(button, ouvert);
  };

  // Le bouton d'une panne, et ce que son dernier clic a rendu — ou rien, là où il n'ouvrirait rien.
  /** @param {Request} request @returns {any[]} */
  function poser(request) {
    if (!actif()) return [];
    const cle = cleDe(request);
    const racine = doc.createElement("span");
    racine.className = "signaler";
    const button = buttonDeLaFamille(doc, "", undefined, { sorte: "discret" });
    button.className = "signaler-a-brigade";
    button.title = SURVOL;
    button.addEventListener("click", async () => {
      if (enCours.has(cle)) return;
      enCours.add(cle);
      rendus.delete(cle);
      tell(racine, button, cle);
      /** @type {Rendu} */
      let rendu;
      try {
        rendu = await pont.signaler(request);
      } catch (error) {
        rendu = { refus: "the browser did not open: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
      }
      enCours.delete(cle);
      rendus.set(cle, rendu ?? { refus: "the browser did not open: nothing was sent" });
      const pose = poses.get(cle) ?? { racine, bouton: button };
      tell(pose.racine, pose.bouton, cle);
    });
    poses.set(cle, { racine, bouton: button });
    tell(racine, button, cle);
    return [racine];
  }

  return { poser };
}
