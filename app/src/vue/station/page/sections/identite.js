// @ts-check
// La section « Identity » de la page d'une station (ticket 2642, épique 2497) : son nom, sa machine, ses cœurs, sa
// version, et où en est sa mise à jour — une ligne chacun, avec la marque de son niveau (`contexte.niveau`, que la coque
// pose). Tout cela vit sur la machine : le niveau de chaque ligne est « this machine ».
// - Cet ordinateur : la mise à jour se fait d'ici — « Update now » quand la station est en retard et que la coque
//   donne le geste (`identite.mettreAJour`) ; à jour, la ligne le dit.
// - Une autre station : la section se montre sans se régler (`contexte.lectureSeule`) — jamais de bouton.
// - Ce que la station n'a pas dit (cœurs, version) se dit « unknown », en une ligne, jamais une case vide.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

import { boutonAction } from "../../../briques.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/**
 * Ce que la coque lit de la station : sa machine, ses cœurs et sa version telles qu'elle les publie ; `enRetard` :
 * faux à jour, vrai en retard, absent quand elle ne l'a pas dit ; `derniere` : la dernière version connue ;
 * `mettreAJour` : le geste de cet ordinateur — absent ailleurs.
 * @typedef {{ machine?: string, coeurs?: number, version?: string, enRetard?: boolean, derniere?: string, mettreAJour?: () => void }} Identite
 */

export const INCONNU = "unknown";
export const A_JOUR = "up to date";
export const METTRE_A_JOUR = "Update now";
export const SURVOL_DE_LA_MISE_A_JOUR = "The station installs the latest version and restarts; its cooks in flight finish first.";

// La mise à jour, dite d'après ce que la station a publié.
/** @param {Identite} identite */
export function etatDeLaMiseAJour({ enRetard, derniere }) {
  if (enRetard === undefined) return INCONNU;
  if (!enRetard) return A_JOUR;
  return derniere === undefined || derniere === "" ? "behind" : `behind — ${derniere} is out`;
}

/** @param {Fabrique} doc @param {any} contexte */
export function poserSection(doc, contexte) {
  /** @type {Identite} */
  const identite = contexte.identite ?? {};
  const racine = doc.createElement("div");
  racine.className = "identite";
  const dit = (/** @type {string | undefined} */ texte) => (texte === undefined || texte.trim() === "" ? INCONNU : texte.trim());
  const coeurs = typeof identite.coeurs === "number" && Number.isInteger(identite.coeurs) && identite.coeurs > 0 ? String(identite.coeurs) : INCONNU;
  const lignes = [
    ligne(doc, contexte.niveau("station-nom"), "name", contexte.station.nom),
    ligne(doc, contexte.niveau("station-machine"), "machine", dit(identite.machine)),
    ligne(doc, contexte.niveau("station-coeurs"), "cores", coeurs),
    ligne(doc, contexte.niveau("station-version"), "version", dit(identite.version)),
    ligne(doc, contexte.niveau("station-mise-a-jour"), "updates", etatDeLaMiseAJour(identite), !contexte.lectureSeule && identite.enRetard === true ? identite.mettreAJour : undefined),
  ];
  racine.append(...lignes);
  return racine;
}

// Une ligne : son nom, la marque de son niveau (posée par la coque), sa valeur, et son geste s'il y en a un.
/** @param {Fabrique} doc @param {any} marque @param {string} nom @param {string} valeur @param {(() => void) | undefined} [geste] */
function ligne(doc, marque, nom, valeur, geste) {
  const racine = doc.createElement("div");
  racine.className = "reglage";
  racine.dataset.reglage = nom;
  const titre = doc.createElement("strong");
  titre.textContent = nom;
  const texte = doc.createElement("span");
  texte.className = "valeur";
  texte.textContent = valeur;
  racine.append(titre, marque, texte);
  if (geste !== undefined) racine.append(boutonAction(doc, METTRE_A_JOUR, geste, { recommande: true }));
  return racine;
}
