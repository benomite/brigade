// @ts-check
// L'écran du premier lancement avant l'avis de macOS (ticket 4081, épique 4078) : sur un Mac neuf, Brigade inscrit la station
// de cet ordinateur à l'ouverture de session, et macOS le signale d'un avis que le nouvel arrivant n'attend pas. Avant
// lui, cet écran le dit : ce qu'on attend, en tête, en une phrase ; dessous, ce que macOS va montrer ; puis un seul
// bouton, « continue ». L'app derrière reste cachée tant qu'il n'est pas pressé ; pressé, l'inscription part
// (first-launch/index.ts, côté process principal), et l'écran ne revient plus.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément et le geste du bouton, et rend
// la carte.

import { kindOfButton } from "../components/button/button.js";
import { THIS_COMPUTER } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */

const TITLE = "Brigade runs in the background";
const EXPECTED = `Brigade keeps ${THIS_COMPUTER}'s station running in the background, even when the app is closed.`;
const OPINION = "macOS will then tell you that Brigade added a background item: this is it, and you can leave it on.";
const CONTINUE = "continue";

// La carte de l'écran : son titre, ses deux lignes et son bouton, recommandé et grand, comme au premier lancement.
/** @param {Fabrique} doc @param {() => void} proceed */
function setOpinionOfBackground(doc, proceed) {
  const card = doc.createElement("div");
  card.className = "avis-de-fond";
  const title = doc.createElement("h2");
  title.textContent = TITLE;
  const expected = doc.createElement("p");
  expected.className = "attendu";
  expected.textContent = EXPECTED;
  const opinion = doc.createElement("p");
  opinion.className = "avis";
  opinion.textContent = OPINION;
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = CONTINUE;
  kindOfButton(button, "recommande");
  button.dataset.taille = "grand";
  button.addEventListener("click", proceed);
  const actions = doc.createElement("div");
  actions.className = "gestes";
  actions.append(button);
  card.append(title, expected, opinion, actions);
  return card;
}

/** @typedef {{ avisDeFond?(): Promise<boolean>, surAvisDeFond?(receive: () => void): void, continuerLePremierLancement?(): Promise<void> }} BridgeOfTheOpinion */

// Tient l'écran dans `lieu`, par-dessus l'app (`cadre`, cachée derrière) : montré quand le process principal le demande —
// à l'ouverture de la vue s'il l'attend déjà (`avisDeFond`), ou plus tard (`surAvisDeFond`) — et retiré au bouton, qui
// rend la main au process principal. Un pont qui ne le connaît pas (le téléphone) ne le montre jamais.
/** @param {any} place @param {any} frame @param {Fabrique} doc @param {BridgeOfTheOpinion} bridge */
export async function holdOpinionOfBackground(place, frame, doc, bridge) {
  const proceed = () => {
    place.replaceChildren();
    place.hidden = true;
    frame.hidden = false;
    void bridge.continuerLePremierLancement?.();
  };
  const show = () => {
    place.replaceChildren(setOpinionOfBackground(doc, proceed));
    place.hidden = false;
    frame.hidden = true;
  };
  bridge.surAvisDeFond?.(show);
  if (await bridge.avisDeFond?.()) show();
}
