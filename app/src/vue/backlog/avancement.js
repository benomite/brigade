// @ts-check
// L'avancement d'un besoin découpé sur son étiquette du bandeau Backlog (ticket 3480, épique 3473) : ses tickets servis sur
// leur total (`2/5`), `served` quand tous le sont (`5/5 served`). Quand le corps de son issue porte la liste de ses
// tickets en cases à cocher (avancement-github.ts), c'est elle qui compte : servis, les lignes cochées ; total, toutes.
// Sans elle, ce que le bandeau compte de ses tickets sur le rail (backlog-band.js) ; sans l'un ni l'autre, rien.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ servis: number, total: number }} Progres */

/**
 * Le progrès d'un besoin : celui de sa liste de cases à cocher, s'il en porte une ; sinon celui de ses tickets comptés
 * sur le rail, ou null.
 * @param {{ avancement?: Progres }} issue @param {Progres | null} desTickets
 * @returns {Progres | null}
 */
export function progresDuBesoin(issue, desTickets) {
  return issue.avancement ?? desTickets;
}

/**
 * L'avancement, tel que l'étiquette le pose à la place de l'état en mots ; son survol le dit en toutes lettres.
 * @param {Fabrique} doc @param {Progres} progres
 */
export function poserAvancement(doc, { servis, total }) {
  const tout = servis === total;
  const avancement = doc.createElement("span");
  avancement.className = "backlog-tag-etat";
  avancement.textContent = `${servis}/${total}${tout ? " served" : ""}`;
  avancement.title = tout ? `all ${total} of its tickets served` : `${servis} of its ${total} tickets served`;
  return avancement;
}
