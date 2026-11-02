// @ts-check
// Le mot d'état que l'app affiche se dit en anglais, comme le reste de l'app (ticket 1967) : celui que `faits` donne
// est en français, et se traduit ici par les mots du glossaire (docs/glossary.md, « State words »). Deux tables, une
// pour l'étape d'un ticket — sur sa carte, au rail ou publié —, une pour l'état de la cuisine d'un projet — sa pilule,
// sa pastille. Un mot qu'elles ne connaissent pas s'affiche tel quel. Seul ce qui est posé passe par ici : l'app
// compare toujours le mot du runtime. Ce module ne touche pas `document`.

/** @type {Readonly<Record<string, string>>} */
export const MOTS_DE_TICKET = {
  "en attente": "queued",
  BLOQUÉ: "BLOCKED",
  pris: "taken",
  "en pass": "in pass",
  servi: "served",
  // « 86 », le jargon du service, se dit en mots simples sur une carte.
  86: "set aside",
};

/** @type {Readonly<Record<string, string>>} */
export const MOTS_DE_CUISINE = {
  ouverte: "open",
  retenue: "held",
  arrêtée: "stopped",
  éteinte: "off",
};

/** @param {Readonly<Record<string, string>>} table @param {string} mot */
const dire = (table, mot) => (Object.hasOwn(table, mot) ? /** @type {string} */ (table[mot]) : mot);

// L'étape d'un ticket, telle que sa carte la dit.
/** @param {string} etat */
export const motDeTicket = (etat) => dire(MOTS_DE_TICKET, etat);

// L'état de la cuisine d'un projet, tel que sa pilule et sa pastille le disent.
/** @param {string} etat */
export const motDeCuisine = (etat) => dire(MOTS_DE_CUISINE, etat);
