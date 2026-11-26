// @ts-check
// Le Mac gardé éveillé tant qu'un cook cuit (ticket 3642, épique 3641) : ce que le chef en voit. La station de cet ordinateur
// tient l'assertion et écrit si elle la tient (runtime/src/veille-machine/) ; l'app ne fait que le dire, à deux endroits,
// avec les mêmes mots :
//   - sur la carte de cette station, dans l'onglet Stations d'un projet : une ligne, tant que l'assertion est tenue ;
//   - dans le menu de l'icône de la station (tray-background/) : la même ligne sous l'état de la cuisine, et la case qui
//     allume ou éteint le réglage.
// Hors d'un Mac, la station n'en tient aucune : ni ligne, ni case.

import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../../../../runtime/src/veille-machine/contrat.ts").Veille} Standby */
/** @typedef {import("../briques.js").Fabrique} Fabrique */

export const GUARD_EVEILLE = `Keeping ${CET_ORDINATEUR} awake while cooking`;
export const GARDER_EVEILLE = `Keep ${CET_ORDINATEUR} awake while cooking`;
export const SETTING_ILLISIBLE = "setting unreadable";

// L'assertion est-elle tenue, d'après ce que la station a écrit — rien de lu, rien de tenu.
/** @param {Standby | undefined} standby */
export const standbyTenue = (standby) => standby?.sorte === "mac" && standby.tenue;

// La ligne de la carte : posée seulement quand l'assertion est tenue.
/** @param {Fabrique} doc */
export function lineDeStandby(doc) {
  const line = doc.createElement("p");
  line.className = "veille-machine";
  line.textContent = GUARD_EVEILLE;
  return line;
}

// Ce que le menu de l'icône en montre : la ligne, tant que l'assertion est tenue ; la case, sur un Mac — cochée quand le
// réglage est allumé, grisée quand le fichier du réglage ne se lit pas (le survol de l'icône ne dit rien de plus : le
// libellé le dit).
/** @param {Standby | undefined} standby @returns {{ ligne: string | null, interrupteur: { libelle: string, coche: boolean, actif: boolean } | null }} */
export function menuDeStandby(standby) {
  if (standby === undefined || standby.sorte !== "mac") return { ligne: null, interrupteur: null };
  const { reglage: setting } = standby;
  const lisible = "garderEveille" in setting;
  return {
    ligne: standby.tenue ? GUARD_EVEILLE : null,
    interrupteur: { libelle: lisible ? GARDER_EVEILLE : `${GARDER_EVEILLE} — ${SETTING_ILLISIBLE}`, coche: lisible && setting.garderEveille, actif: lisible },
  };
}
