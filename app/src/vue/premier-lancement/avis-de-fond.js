// @ts-check
// L'écran du premier lancement avant l'avis de macOS (#4081, épique #4078) : sur un Mac neuf, Brigade inscrit la station
// de cet ordinateur à l'ouverture de session, et macOS le signale d'un avis que le nouvel arrivant n'attend pas. Avant
// lui, cet écran le dit : ce qu'on attend, en tête, en une phrase ; dessous, ce que macOS va montrer ; puis un seul
// bouton, « continue ». L'app derrière reste cachée tant qu'il n'est pas pressé ; pressé, l'inscription part
// (premier-lancement/index.ts, côté process principal), et l'écran ne revient plus.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément et le geste du bouton, et rend
// la carte.

import { sorteDuBouton } from "../composants/bouton/bouton.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

const TITRE = "Brigade runs in the background";
const ATTENDU = "Brigade keeps this computer's station running in the background, even when the app is closed.";
const AVIS = "macOS will then tell you that Brigade added a background item: this is it, and you can leave it on.";
const CONTINUER = "continue";

// La carte de l'écran : son titre, ses deux lignes et son bouton, recommandé et grand, comme au premier lancement.
/** @param {Fabrique} doc @param {() => void} continuer */
function poserAvisDeFond(doc, continuer) {
  const carte = doc.createElement("div");
  carte.className = "avis-de-fond";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = ATTENDU;
  const avis = doc.createElement("p");
  avis.className = "avis";
  avis.textContent = AVIS;
  const bouton = doc.createElement("button");
  bouton.type = "button";
  bouton.textContent = CONTINUER;
  sorteDuBouton(bouton, "recommande");
  bouton.dataset.taille = "grand";
  bouton.addEventListener("click", continuer);
  const gestes = doc.createElement("div");
  gestes.className = "gestes";
  gestes.append(bouton);
  carte.append(titre, attendu, avis, gestes);
  return carte;
}

/** @typedef {{ avisDeFond?(): Promise<boolean>, surAvisDeFond?(recevoir: () => void): void, continuerLePremierLancement?(): Promise<void> }} PontDeLAvis */

// Tient l'écran dans `lieu`, par-dessus l'app (`cadre`, cachée derrière) : montré quand le process principal le demande —
// à l'ouverture de la vue s'il l'attend déjà (`avisDeFond`), ou plus tard (`surAvisDeFond`) — et retiré au bouton, qui
// rend la main au process principal. Un pont qui ne le connaît pas (le téléphone) ne le montre jamais.
/** @param {any} lieu @param {any} cadre @param {Fabrique} doc @param {PontDeLAvis} pont */
export async function tenirAvisDeFond(lieu, cadre, doc, pont) {
  const continuer = () => {
    lieu.replaceChildren();
    lieu.hidden = true;
    cadre.hidden = false;
    void pont.continuerLePremierLancement?.();
  };
  const montrer = () => {
    lieu.replaceChildren(poserAvisDeFond(doc, continuer));
    lieu.hidden = false;
    cadre.hidden = true;
  };
  pont.surAvisDeFond?.(montrer);
  if (await pont.avisDeFond?.()) montrer();
}
