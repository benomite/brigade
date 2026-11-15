// @ts-check
// Le Mac gardé éveillé tant qu'un cook cuit (ticket 3642, épique 3641) : ce que le chef en voit. La station de cet ordinateur
// tient l'assertion et écrit si elle la tient (runtime/src/veille-machine/) ; l'app ne fait que le dire, à deux endroits,
// avec les mêmes mots :
//   - sur la carte de cette station, dans l'onglet Stations d'un projet : une ligne, tant que l'assertion est tenue ;
//   - dans le menu de l'icône de la station (tray-fond/) : la même ligne sous l'état de la cuisine, et la case qui
//     allume ou éteint le réglage.
// Hors d'un Mac, la station n'en tient aucune : ni ligne, ni case.

import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../../../../runtime/src/veille-machine/contrat.ts").Veille} Veille */
/** @typedef {import("../briques.js").Fabrique} Fabrique */

export const GARDE_EVEILLE = `Keeping ${CET_ORDINATEUR} awake while cooking`;
export const GARDER_EVEILLE = `Keep ${CET_ORDINATEUR} awake while cooking`;
export const REGLAGE_ILLISIBLE = "setting unreadable";

// L'assertion est-elle tenue, d'après ce que la station a écrit — rien de lu, rien de tenu.
/** @param {Veille | undefined} veille */
export const veilleTenue = (veille) => veille?.sorte === "mac" && veille.tenue;

// La ligne de la carte : posée seulement quand l'assertion est tenue.
/** @param {Fabrique} doc */
export function ligneDeVeille(doc) {
  const ligne = doc.createElement("p");
  ligne.className = "veille-machine";
  ligne.textContent = GARDE_EVEILLE;
  return ligne;
}

// Ce que le menu de l'icône en montre : la ligne, tant que l'assertion est tenue ; la case, sur un Mac — cochée quand le
// réglage est allumé, grisée quand le fichier du réglage ne se lit pas (le survol de l'icône ne dit rien de plus : le
// libellé le dit).
/** @param {Veille | undefined} veille @returns {{ ligne: string | null, interrupteur: { libelle: string, coche: boolean, actif: boolean } | null }} */
export function menuDeVeille(veille) {
  if (veille === undefined || veille.sorte !== "mac") return { ligne: null, interrupteur: null };
  const { reglage } = veille;
  const lisible = "garderEveille" in reglage;
  return {
    ligne: veille.tenue ? GARDE_EVEILLE : null,
    interrupteur: { libelle: lisible ? GARDER_EVEILLE : `${GARDER_EVEILLE} — ${REGLAGE_ILLISIBLE}`, coche: lisible && reglage.garderEveille, actif: lisible },
  };
}
