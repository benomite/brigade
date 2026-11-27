// @ts-check
// L'interrupteur de l'app (ticket 2914, maquette `Components.dc.html` et `Settings.dc.html` de docs/maquettes/app/) : tout
// geste marche / arrêt de chaque écran — l'espace du projet en tête, une rangée de réglage — passe par ici. Une glissière et son
// mot, verte à droite quand c'est allumé, grise à gauche quand c'est éteint, en pointillés quand rien ne l'a dit : alors il ne
// bascule rien, ce n'est pas « éteint ». Un clic appelle `changer` avec l'état voulu. Sa peau est dans `switch.css`, à
// côté, qui ne nomme aucun écran : un écran ne pose que sa place.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {{ createElement(balise: string): any }} Fabrique */

/**
 * Un interrupteur. `allume` : indéfini, pas lu. `texte` : le mot posé à côté de la glissière. `libelle` : son nom pour un
 * lecteur d'écran. `titre` : ce qu'il dit au survol. `actif` : faux, il attend (un changement en route, une raison qui
 * l'empêche) et ne bascule rien. `changer` reçoit l'état que le clic voudrait.
 * @param {Fabrique} doc
 * @param {{ texte: string, allume: boolean | undefined, libelle: string, titre?: string, actif?: boolean }} quoi
 * @param {(lit: boolean) => void} change
 */
export function toggleSwitch(doc, { texte: text, allume: lit, libelle: wording, titre: title = "", actif: active = true }, change) {
  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.role = "switch";
  toggle.className = "bascule";
  toggle.ariaLabel = wording;
  toggle.disabled = lit === undefined || !active;
  if (title !== "") toggle.title = title;
  const slider = doc.createElement("span");
  slider.className = "glissiere";
  const word = doc.createElement("span");
  word.textContent = text;
  toggle.append(slider, word);
  // Son état se lit sur la glissière : un clic la pose à l'état voulu aussitôt, que celui qui lit `ariaChecked` — le champ voisin
  // qui change l'autre réglage — voie ce que le chef a demandé ; la vue relue le repose à la valeur en vigueur.
  /** @param {boolean | undefined} state */
  const set = (state) => {
    toggle.dataset.etat = state === undefined ? "inconnu" : state ? "allume" : "eteint";
    toggle.ariaChecked = state === undefined ? "mixed" : String(state);
  };
  set(lit);
  toggle.addEventListener("click", () => {
    if (lit === undefined || !active) return;
    lit = !lit;
    set(lit);
    change(lit);
  });
  return toggle;
}
