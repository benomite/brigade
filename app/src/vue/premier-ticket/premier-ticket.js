// @ts-check
// Le premier ticket du premier projet du chef, raconté pas à pas, à mesure qu'il se passe (ticket 3302) : plutôt qu'un
// tutoriel, une ligne courte à chaque vraie étape, au-dessus du rail — un cook l'a pris, et travaille dans sa propre copie ;
// sa pull request est ouverte ; la pass la juge (gates, CI, relecture) ; elle l'a renvoyé, et pourquoi ; elle l'a mergé —
// avec le lien de la pull request. Chaque ligne dit le mot de la cuisine (docs/glossary.md), puis ce qu'il veut dire.
//
// Ce qui est raconté :
//   - le premier projet du chef : le premier qu'« Add a project » ajoute quand le fichier des projets n'en a pas d'autre
//     que la cuisine de démonstration de la visite (visite/visite.js) ; un chef qui en avait déjà n'a rien de raconté ;
//   - son premier ticket : le premier qu'une lecture du rail montre pris ou en pass, après l'ajout du projet ;
//   - une étape, quand une lecture du rail la montre (`etapesDesTickets` du tableau, faits.ts) : une étape passée entre
//     deux lectures n'est pas inventée — sauf le renvoi, dont la marque reste sur l'issue avec son rang et sa raison.
// Le récit se garde dans le stockage de la vue, d'un lancement à l'autre ; il reste après le service, jusqu'à ce que le
// chef le range d'un geste — rangé, il ne revient plus. Un stockage illisible ne décide rien : rien n'est raconté, et rien
// n'est écrit par-dessus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../faits.ts").EtapeDuTicket} EtapeDuTicket */
/** @typedef {{ numero: number | null, url: string }} Pr */
/**
 * Une ligne du récit : l'étape, l'heure où elle a été vue, et ce qu'elle dit de plus — la PR, la raison d'un renvoi et
 * son rang.
 * @typedef {{ cle: "pris" | "repris" | "pr" | "pass" | "renvoi" | "servi", le: string, pr?: Pr, n?: number, raison?: string }} Ligne
 */
/**
 * Ce qui se garde : le premier projet du chef — nul, le chef en avait déjà un quand celui-ci a été ajouté —, son premier
 * ticket une fois pris, les lignes vues, et s'il est rangé.
 * @typedef {{ projet: string | null, ticket?: number, lignes: Ligne[], range?: true }} Recit
 */

// La trace, dans le stockage de la vue, du récit du premier ticket.
export const CLE_DU_PREMIER_TICKET = "brigade.premier-ticket";

/** @param {number} ticket */
export const TITRE = (ticket) => `Your first ticket, #${ticket}, step by step`;
export const RANGER = "dismiss";
// Le mot de chaque étape, tel que le rail et le glossaire le disent.
export const MOTS = { pris: "Taken", repris: "Taken again", pr: "Pull request", pass: "In pass", renvoi: "Sent back", servi: "Served" };
/** @param {number} ticket */
export const PRIS = (ticket) => `A cook took #${ticket}: a claude session that works in its own copy of the repository (a worktree), so nothing it does touches your files until it is merged.`;
/** @param {number} ticket */
export const REPRIS = (ticket) => `A cook took #${ticket} again, in its own copy, to fix what the pass said.`;
/** @param {number | null} numero */
export const PR_OUVERTE = (numero) => `The cook handed over its work as a pull request${numero === null ? "" : ` (#${numero})`}: the change it proposes to your repository, open for checking.`;
export const EN_PASS = "The pass is checking the pull request: the gates (the project's own checks), the CI, and a review by another session that did not write it.";
export const RENVOYE = "The pass sent the work back to a cook, because:";
/** @param {number} ticket @param {number | null} numero */
export const SERVI = (ticket, numero) => `The pass merged the pull request${numero === null ? "" : ` #${numero}`}: #${ticket} is done, and its change is in your repository.`;
/** @param {number | null} numero */
export const OUVRIR_LA_PR = (numero) => (numero === null ? "open the pull request" : `open pull request #${numero}`);

// Les mots d'état d'un ticket qu'un cook tient, et ceux de la pass (rail/github.ts, `MOT_DE_L_ETAT`).
const PRIS_MOTS = ["pris"];
const PASS_MOTS = ["en pass", "base rouge"];
const SERVI_MOT = "servi";

// Le premier ticket à raconter : le plus petit numéro qu'une lecture montre pris ou en pass — ou rien.
/** @param {readonly EtapeDuTicket[]} etapes @returns {number | undefined} */
export function premierPris(etapes) {
  const tenus = etapes.filter(({ etat }) => PRIS_MOTS.includes(etat) || PASS_MOTS.includes(etat)).map(({ ticket }) => ticket);
  return tenus.length === 0 ? undefined : Math.min(...tenus);
}

// Les lignes du récit, une lecture de plus vue : ce que l'étape lue ajoute à ce qui est déjà dit. Un tour du ticket va
// d'une prise à la pass ; un renvoi en ouvre un autre. Dans un tour, chaque étape ne se dit qu'une fois ; la PR ne se redit
// pas quand c'est la même, reprise par le cook suivant. Servi, le récit est fini : rien ne s'y ajoute plus.
/** @param {readonly Ligne[]} lignes @param {EtapeDuTicket} etape @param {string} maintenant @returns {Ligne[]} */
export function avancer(lignes, etape, maintenant) {
  if (lignes.some(({ cle }) => cle === "servi")) return [...lignes];
  const dites = [...lignes];
  /** @param {Ligne} ligne */
  const dire = (ligne) => dites.push(ligne);
  const depuisLeRenvoi = () => {
    const rang = dites.map(({ cle }) => cle).lastIndexOf("renvoi");
    return dites.slice(rang + 1);
  };
  const pr = etape.pr ?? undefined;
  if (etape.etat === SERVI_MOT) {
    dire({ cle: "servi", le: maintenant, ...(pr === undefined ? {} : { pr }) });
    return dites;
  }
  const pris = PRIS_MOTS.includes(etape.etat);
  const enPass = PASS_MOTS.includes(etape.etat);
  if (!pris && !enPass) return dites;
  if (!dites.some(({ cle }) => cle === "pris")) dire({ cle: "pris", le: maintenant });
  const dejaRenvoye = Math.max(0, ...dites.flatMap(({ cle, n }) => (cle === "renvoi" && n !== undefined ? [n] : [])));
  if (etape.renvoi !== null && etape.renvoi.n > dejaRenvoye) {
    dire({ cle: "renvoi", le: maintenant, n: etape.renvoi.n, raison: etape.renvoi.raison });
    if (pris) dire({ cle: "repris", le: maintenant });
  }
  const tour = depuisLeRenvoi();
  if (pr !== undefined && !dites.some((ligne) => ligne.cle === "pr" && ligne.pr?.url === pr.url) && !tour.some(({ cle }) => cle === "pr")) dire({ cle: "pr", le: maintenant, pr });
  if (enPass && !tour.some(({ cle }) => cle === "pass")) dire({ cle: "pass", le: maintenant });
  return dites;
}

// Un récit relu du stockage, champ pour champ ; rien, s'il n'en a pas la forme.
/** @param {unknown} brut @returns {Recit | undefined} */
export function recitLu(brut) {
  if (typeof brut !== "object" || brut === null) return undefined;
  const lu = /** @type {Record<string, unknown>} */ (brut);
  if (lu.projet !== null && typeof lu.projet !== "string") return undefined;
  if (lu.ticket !== undefined && !Number.isSafeInteger(lu.ticket)) return undefined;
  if (!Array.isArray(lu.lignes)) return undefined;
  const cles = Object.keys(MOTS);
  /** @type {Ligne[]} */
  const lignes = [];
  for (const ligne of lu.lignes) {
    if (typeof ligne !== "object" || ligne === null || !cles.includes(ligne.cle) || typeof ligne.le !== "string") return undefined;
    lignes.push(ligne);
  }
  return { projet: lu.projet, ...(lu.ticket === undefined ? {} : { ticket: /** @type {number} */ (lu.ticket) }), lignes, ...(lu.range === true ? { range: /** @type {const} */ (true) } : {}) };
}

// Le récit tenu pour la vue, gardé dans `stockage`. `rendre` : il a changé.
/** @param {{ stockage: { getItem(cle: string): string | null, setItem(cle: string, valeur: string): void } | undefined, rendre: () => void, maintenant?: () => string }} options */
export function tenirLePremierTicket({ stockage, rendre, maintenant = () => new Date().toISOString() }) {
  // `illisible` : le stockage tient une trace que la vue ne sait pas lire — rien n'est raconté, rien n'est écrit dessus.
  let illisible = false;
  /** @type {Recit | undefined} */
  let recit;
  try {
    const brut = stockage?.getItem(CLE_DU_PREMIER_TICKET) ?? null;
    if (brut !== null) {
      recit = recitLu(JSON.parse(brut));
      illisible = recit === undefined;
    }
  } catch {
    illisible = true;
  }
  /** @param {Recit} nouveau */
  const garder = (nouveau) => {
    recit = nouveau;
    try {
      stockage?.setItem(CLE_DU_PREMIER_TICKET, JSON.stringify(nouveau));
    } catch {
      // Un stockage plein ou refusé : le récit se tient le temps que l'app tourne.
    }
    rendre();
  };
  return {
    // Un projet qu'« Add a project » vient d'ajouter. `autres` : le fichier des projets en a d'autres que la cuisine de
    // démonstration — ce n'est pas le premier du chef. Seul le premier ajout décide.
    /** @param {string} projet @param {boolean} autres */
    projetAjoute(projet, autres) {
      if (illisible || recit !== undefined) return;
      garder({ projet: autres ? null : projet, lignes: [] });
    },
    // Une lecture du rail de `projet` : ses tickets, où ils en sont.
    /** @param {string} projet @param {readonly EtapeDuTicket[] | undefined} etapes */
    observer(projet, etapes) {
      if (illisible || recit === undefined || recit.range === true || recit.projet !== projet || etapes === undefined) return;
      const ticket = recit.ticket ?? premierPris(etapes);
      if (ticket === undefined) return;
      const etape = etapes.find((candidate) => candidate.ticket === ticket);
      const lignes = etape === undefined ? recit.lignes : avancer(recit.lignes, etape, maintenant());
      if (recit.ticket === ticket && lignes.length === recit.lignes.length) return;
      garder({ ...recit, ticket, lignes });
    },
    // Le récit à montrer sur la page de `projet` : son ticket et ses lignes ; rien s'il n'y en a pas, ou qu'il est rangé.
    /** @param {string} projet @returns {{ ticket: number, lignes: Ligne[] } | undefined} */
    de(projet) {
      if (illisible || recit === undefined || recit.range === true || recit.projet !== projet || recit.ticket === undefined || recit.lignes.length === 0) return undefined;
      return { ticket: recit.ticket, lignes: recit.lignes };
    },
    ranger() {
      if (illisible || recit === undefined || recit.range === true) return;
      garder({ ...recit, range: true });
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Ce qu'une ligne dit, après son mot.
/** @param {Ligne} ligne @param {number} ticket */
function explication({ cle, pr }, ticket) {
  const numero = pr?.numero ?? null;
  if (cle === "pris") return PRIS(ticket);
  if (cle === "repris") return REPRIS(ticket);
  if (cle === "pr") return PR_OUVERTE(numero);
  if (cle === "pass") return EN_PASS;
  if (cle === "renvoi") return RENVOYE;
  return SERVI(ticket, numero);
}

// Le récit, au-dessus du rail : son titre et le geste qui le range, puis une ligne par étape, dans l'ordre où elles ont
// été vues — son mot, ce qu'il veut dire, la raison d'un renvoi, et le lien de la PR où elle s'ouvre. `ouvrir` ouvre la
// PR du ticket : la vue nomme le ticket, le process principal tient l'adresse.
/** @param {Fabrique} doc @param {{ ticket: number, lignes: readonly Ligne[] }} recit @param {{ ouvrir: () => void, ranger: () => void }} geste */
export function poserPremierTicket(doc, { ticket, lignes }, geste) {
  const racine = cree(doc, "section");
  racine.className = "premier-ticket";
  racine.ariaLabel = TITRE(ticket);
  const tete = cree(doc, "p");
  tete.className = "tete";
  tete.append(cree(doc, "strong", TITRE(ticket)), boutonAction(doc, RANGER, geste.ranger));
  const liste = cree(doc, "ol");
  liste.className = "etapes";
  for (const ligne of lignes) {
    const pose = cree(doc, "li");
    pose.className = "etape";
    pose.dataset.etape = ligne.cle;
    const mot = cree(doc, "strong", MOTS[ligne.cle]);
    mot.className = "mot";
    const dit = cree(doc, "span", explication(ligne, ticket));
    dit.className = "dit";
    pose.append(mot, dit);
    if (ligne.cle === "renvoi" && ligne.raison !== undefined && ligne.raison.trim() !== "") {
      const raison = cree(doc, "p", ligne.raison);
      raison.className = "raison";
      pose.append(raison);
    }
    const pr = ligne.pr;
    if (pr !== undefined && (ligne.cle === "pr" || ligne.cle === "servi")) pose.append(boutonAction(doc, OUVRIR_LA_PR(pr.numero), geste.ouvrir));
    liste.append(pose);
  }
  racine.append(tete, liste);
  return racine;
}
