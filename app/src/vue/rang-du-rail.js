// @ts-check
// Ranger les cartes de « On the rail » (ticket 1347) : sur un écran large, le chef glisse une carte en attente vers le
// haut ou vers le bas de sa colonne et la lâche à côté d'une autre — avant elle si elle monte, après si elle descend.
// Lâchée, elle prend aussitôt sa nouvelle place et la priorité de sa voisine, badge compris, sans attendre la station ;
// le runtime la place (`rail move`, deplacement.ts), et la lecture qui suit montre l'ordre qu'il sert. Refusée — elle
// passerait devant un ticket qu'elle attend —, la carte reprend sa place, et la phrase du runtime le dit.
// Ce module ne touche pas `document` : il dit où une carte atterrit, et ce que la colonne montre une fois lâchée.

/** @typedef {import("../faits.ts").Carte} Carte */
/** @typedef {import("../deplacement.ts").Cote} Cote */
// Où la carte glissée atterrit : à côté de `voisin`, avant ou après lui.
/** @typedef {{ ticket: number, voisin: number, cote: Cote }} Place */

// Ce qu'une carte glissée porte : son propre type, qu'aucun fichier glissé d'ailleurs ni case de la barre n'a.
export const GLISSE_CARTE = "application/x-brigade-carte";

// La place de la carte glissée quand elle survole `survolee`, dans la colonne `cartes` : avant elle si elle monte, après
// si elle descend. Rien sur elle-même, ni sur une carte qui ne se range pas — prise, mise de côté, ou d'une autre colonne.
/** @param {readonly Carte[]} cartes @param {number} glissee @param {number} survolee @returns {Place | undefined} */
export function placeSurvolee(cartes, glissee, survolee) {
  const de = cartes.findIndex(({ ticket }) => ticket === glissee);
  const vers = cartes.findIndex(({ ticket }) => ticket === survolee);
  if (de === -1 || vers === -1 || de === vers || cartes[de]?.rangeable !== true || cartes[vers]?.rangeable !== true) return undefined;
  return { ticket: glissee, voisin: survolee, cote: de > vers ? "before" : "after" };
}

// La colonne telle qu'elle se montre une fois la carte lâchée, avant que le runtime ne la relise : la carte à sa
// nouvelle place, avec la priorité de sa voisine — le runtime la lui donne (`rail move`). Telle quelle, si la colonne
// n'a pas l'une des deux.
/** @param {readonly Carte[]} cartes @param {Place} place @returns {Carte[]} */
export function apresLeLacher(cartes, { ticket, voisin, cote }) {
  const glissee = cartes.find((carte) => carte.ticket === ticket);
  const pres = cartes.find((carte) => carte.ticket === voisin);
  if (glissee === undefined || pres === undefined) return [...cartes];
  const autres = cartes.filter((carte) => carte !== glissee);
  const rang = autres.indexOf(pres) + (cote === "after" ? 1 : 0);
  const placee = pres.prio === undefined ? glissee : { ...glissee, prio: pres.prio };
  return [...autres.slice(0, rang), placee, ...autres.slice(rang)];
}

// Le même geste au doigt (ticket 1348) : un appui long sur une carte la soulève, puis le doigt la mène en haut ou en bas
// de sa colonne et la lâche — le lâcher est celui de la souris. Un doigt qui bouge avant la fin de l'appui fait défiler
// la colonne : aucune carte n'est soulevée.
export const APPUI_LONG_MS = 450;
export const SEUIL_DE_DEFILEMENT_PX = 10;

// Le doigt a-t-il assez bougé depuis sa pose pour que ce soit un défilement, non un appui ?
/** @param {{ x: number, y: number }} depart @param {{ x: number, y: number }} point @returns {boolean} */
export function defileAvantLappui(depart, point) {
  return Math.hypot(point.x - depart.x, point.y - depart.y) > SEUIL_DE_DEFILEMENT_PX;
}
