// @ts-check
// La bande du haut de l'onglet Rail (tickets 2486, 3013 ; maquette Project.dc.html, décision 4 du 2026-11-08) : une seule
// ligne de chiffres entre les onglets et le rail — le temps d'un ticket, le premier coup, les cooks en cours et le dernier
// merge, chacun une fois. Un chiffre sans valeur n'est pas posé du tout : ni « no measure yet », ni aide `?`, ni titre
// sans rien dessous. Les valeurs sont celles que la station publie (temps-ticket/resume.js), jamais recalculées ; ce qui
// pèse le plus et le détail sont au survol. Le backlog n'y est plus : il a son bandeau, au-dessus des colonnes
// (backlog-band/, ticket 3460). Sous la bande, le rail prend toute la hauteur.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { enMinutes, lireLeResume, lireLesChiffres, pesentLePlus, surCombien } from "../../temps-ticket/resume.js";
import { dureeEnClair } from "../../temps-ticket/temps-ticket.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../temps-ticket/temps-ticket.js").TempsDuProjet} TempsDuProjet */
/** @typedef {import("../../temps-ticket/resume.js").Chiffre} Chiffre */
/** @typedef {{ nombre: number, tickets: string[] }} CooksEnCours */

// Un chiffre de la station a une valeur quand il dit un nombre : à la place d'une valeur qu'elle n'a pas encore, elle
// écrit des mots, sans chiffre (`SANS_DONNEE`, runtime/src/chiffres-du-projet.ts).
/** @param {Chiffre} c */
const aUneValeur = (c) => /\d/.test(c.valeur);

/**
 * @param {Fabrique} doc
 * @param {string} balise
 * @param {string} classe
 * @param {string} [texte]
 */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

// Un chiffre de la bande, comme la maquette le dit : son nom, sa valeur en gras, puis ce qu'elle est — « Ticket time
// 5.6 min median ». Son détail, s'il en a un, est au survol du chiffre entier, qui prend le clavier pour le dire. Chaque
// classe est écrite en clair : la peau ne vise que celles-là (peau.test.ts).
/** @param {Fabrique} doc @param {any} pose @param {string} nom @param {string} valeur @param {string} suite @param {string} [detail] */
function chiffre(doc, pose, nom, valeur, suite, detail) {
  pose.append(noeud(doc, "span", "bande-nom", nom), noeud(doc, "strong", "bande-valeur", valeur), noeud(doc, "span", "bande-doux", suite));
  if (detail === undefined) return pose;
  if (pose.tabIndex === undefined || pose.tabIndex < 0) pose.tabIndex = 0;
  return survol(doc, detail, pose);
}

// Les chiffres du projet que la station publie, sauf le premier coup qui a sa place dans la bande : dits au survol du
// temps d'un ticket, avec leur seuil, sans être recalculés.
/** @param {Chiffre[]} chiffres */
const lesAutres = (chiffres) =>
  chiffres.filter((c) => c.cle !== "premier-coup" && aUneValeur(c)).map((c) => `${c.nom[0]?.toUpperCase() ?? ""}${c.nom.slice(1)}: ${c.valeur}, threshold ${c.seuil}${c.depasse ? " — over it" : ""}.`);

// Le temps d'un ticket : sa médiane, sans plafond (la taille d'un ticket varie) ; le p75, la perte la plus lourde, la phase
// la plus longue et les autres chiffres du projet au survol. Null sans résumé publié.
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps */
export function tempsDeLaBande(doc, temps) {
  const lu = lireLeResume(temps);
  if (lu === null) return null;
  const detail = [
    `Median ${enMinutes(lu.medianMin)} and p75 ${enMinutes(lu.p75Min)} of ${surCombien(lu)}, from filing to merge.`,
    lu.perteLaPlusLourde === null ? "" : `Heaviest loss: ${lu.perteLaPlusLourde.nom}, median ${enMinutes(lu.perteLaPlusLourde.medianMin)}.`,
    lu.phaseLaPlusLongue === null ? "" : `Slowest phase: ${lu.phaseLaPlusLongue.nom}, median ${enMinutes(lu.phaseLaPlusLongue.medianMin)}.`,
    ...lesAutres(lireLesChiffres(temps) ?? []),
  ]
    .filter((phrase) => phrase !== "")
    .join(" ");
  return chiffre(doc, noeud(doc, "span", "bande-part bande-temps"), "Ticket time", enMinutes(lu.medianMin), "median", detail);
}

// Le premier coup : la part des tickets servis du premier coup, contre son but, tels que la station les publie ; en rouge
// sous son but, ce qui pèse le plus au survol. Null tant qu'elle n'en publie pas la valeur.
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps */
export function premierCoupDeLaBande(doc, temps) {
  const c = lireLesChiffres(temps)?.find(({ cle }) => cle === "premier-coup");
  if (c === undefined || !aUneValeur(c)) return null;
  const pose = noeud(doc, "span", "bande-part bande-premier-coup");
  if (c.depasse) pose.dataset.depasse = "oui";
  return chiffre(doc, pose, "First try", c.valeur, `· goal ${c.seuil}`, pesentLePlus(c));
}

// Les cooks en cours : leur nombre ; leurs tickets au survol, quand la lecture les nomme. Aucun : « none running », sans zéro.
/** @param {Fabrique} doc @param {CooksEnCours} cooks */
export function cooksDeLaBande(doc, { nombre, tickets }) {
  const pose = noeud(doc, "span", "bande-part bande-cooks");
  if (nombre === 0) {
    pose.append(noeud(doc, "span", "bande-nom", "Cooks"), noeud(doc, "span", "bande-doux", "none running"));
    return pose;
  }
  const detail = tickets.length > 0 ? tickets.join(" · ") : nombre === 1 ? "one cook, on the ticket in Taken" : "one cook per ticket in Taken";
  return chiffre(doc, pose, "Cooks", String(nombre), "running", detail);
}

// Le dernier merge : depuis combien de temps le plus récent des tickets mesurés a été mergé (`mergedAt` des
// enregistrements de la station), à l'heure `maintenant` ; sa date et son ticket au survol. Null sans ticket mesuré.
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps @param {string} maintenant */
export function dernierMergeDeLaBande(doc, temps, maintenant) {
  /** @type {{ ticket: number, le: number } | undefined} */
  let dernier;
  for (const lu of temps?.enregistrements ?? []) {
    const e = /** @type {{ ticket?: unknown, mergedAt?: unknown } | null} */ (lu);
    const le = typeof e?.mergedAt === "string" ? Date.parse(e.mergedAt) : Number.NaN;
    if (typeof e?.ticket === "number" && !Number.isNaN(le) && (dernier === undefined || le > dernier.le)) dernier = { ticket: e.ticket, le };
  }
  const a = Date.parse(maintenant);
  if (dernier === undefined || Number.isNaN(a)) return null;
  const quand = new Date(dernier.le).toISOString().slice(0, 16).replace("T", " ");
  // Au-delà d'un jour, des jours : « 3 d », pas « 72 h 4 min ».
  const secondes = Math.max(0, a - dernier.le) / 1000;
  const depuis = secondes < 86_400 ? dureeEnClair(secondes) : `${Math.floor(secondes / 86_400)} d`;
  return chiffre(doc, noeud(doc, "span", "bande-part bande-dernier-merge"), "Last merge", depuis, "ago", `#${dernier.ticket}, merged ${quand} UTC.`);
}

// La bande entière : chaque chiffre qui a une valeur, dans l'ordre de la maquette. `cooks` n'y est que quand le rail est
// lu : sans lecture, les cooks ne s'inventent pas. `apres` : ce qui se pose au bout de la ligne — l'âge du rail montré.
/**
 * @param {Fabrique} doc
 * @param {{ temps: TempsDuProjet | undefined, maintenant: string, cooks?: CooksEnCours, apres?: any[] }} lu
 */
export function poserBandeRail(doc, { temps, maintenant, cooks, apres = [] }) {
  const bande = noeud(doc, "div", "bande-rail");
  bande.role = "group";
  bande.ariaLabel = "The project's figures";
  const chiffres = [
    tempsDeLaBande(doc, temps),
    premierCoupDeLaBande(doc, temps),
    cooks === undefined ? null : cooksDeLaBande(doc, cooks),
    dernierMergeDeLaBande(doc, temps, maintenant),
  ];
  bande.append(...chiffres.filter((pose) => pose !== null), ...apres);
  return bande;
}
