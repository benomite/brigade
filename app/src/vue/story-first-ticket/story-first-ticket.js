// @ts-check
// Le premier ticket du premier projet du chef, raconté pas à pas, à mesure qu'il se passe (ticket 3302) : plutôt qu'un
// tutoriel, une ligne courte à chaque vraie étape, au-dessus du rail — un cook l'a pris, et travaille dans sa propre copie ;
// sa pull request est ouverte ; la pass la juge (gates, CI, relecture) ; elle l'a renvoyé, et pourquoi ; elle l'a mergé —
// avec le lien de la pull request. Chaque ligne dit le mot de la cuisine (docs/glossary.md), puis ce qu'il veut dire.
//
// Ce qui est raconté :
//   - le premier projet du chef : le premier qu'« Add a project » ajoute quand le fichier des projets n'en a pas d'autre
//     que benomite/brigade (visit/visit.js), que l'app ajoutait d'elle-même avant le ticket 4087 ; un chef qui en avait
//     déjà n'a rien de raconté ;
//   - son premier ticket : le premier qu'une lecture du rail montre pris ou en pass, après l'ajout du projet ;
//   - une étape, quand une lecture du rail la montre (`etapesDesTickets` du tableau, facts.ts) : une étape passée entre
//     deux lectures n'est pas inventée — sauf le renvoi, dont la marque reste sur l'issue avec son rang et sa raison.
// Le récit se garde dans le stockage de la vue, d'un lancement à l'autre ; il reste après le service, jusqu'à ce que le
// chef le range d'un geste — rangé, il ne revient plus. Un stockage illisible ne décide rien : rien n'est raconté, et rien
// n'est écrit par-dessus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { tellLaPrParSonTicket, PR_DU_TICKET } from "../pr-du-ticket.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../facts.ts").StepDuTicket} StepDuTicket */
/** @typedef {{ numero: number | null, url: string }} Pr */
/**
 * Une ligne du récit : l'étape, l'heure où elle a été vue, et ce qu'elle dit de plus — la PR, la raison d'un renvoi et
 * son rang.
 * @typedef {{ cle: "pris" | "repris" | "pr" | "pass" | "renvoi" | "servi", le: string, pr?: Pr, n?: number, raison?: string }} Line
 */
/**
 * Ce qui se garde : le premier projet du chef — nul, le chef en avait déjà un quand celui-ci a été ajouté —, son premier
 * ticket une fois pris, les lignes vues, et s'il est rangé.
 * @typedef {{ projet: string | null, ticket?: number, lignes: Line[], range?: true }} Story
 */

// La trace, dans le stockage de la vue, du récit du premier ticket.
export const CLE_DU_FIRST_TICKET = "brigade.recit-premier-ticket";

/** @param {number} ticket */
export const TITRE = (ticket) => `Your first ticket, #${ticket}, step by step`;
export const RANGER = "dismiss";
// Le mot de chaque étape, tel que le rail et le glossaire le disent.
export const MOTS = { pris: "Taken", repris: "Taken again", pr: "Pull request", pass: "In pass", renvoi: "Sent back", servi: "Served" };
/** @param {number} ticket */
export const TAKEN = (ticket) => `A cook took #${ticket}: a claude session that works in its own copy of the repository (a worktree), so nothing it does touches your files until it is merged.`;
/** @param {number} ticket */
export const REPRIS = (ticket) => `A cook took #${ticket} again, in its own copy, to fix what the pass said.`;
/** @param {number} ticket @param {number | null} numero */
export const PR_OUVERTE = (ticket, numero) => `The cook handed over its work as a pull request${numero === null ? "" : ` (the ${PR_DU_TICKET(ticket)})`}: the change it proposes to your repository, open for checking.`;
export const EN_PASS = "The pass is checking the pull request: the gates (the project's own checks), the CI, and a review by another session that did not write it.";
export const RENVOYE = "The pass sent the work back to a cook, because:";
/** @param {number} ticket @param {number | null} numero */
export const SERVED = (ticket, numero) => `The pass merged ${numero === null ? "the pull request" : `the ${PR_DU_TICKET(ticket)}`}: #${ticket} is done, and its change is in your repository.`;
/** @param {number} ticket @param {number | null} numero */
export const OUVRIR_LA_PR = (ticket, numero) => (numero === null ? "open the pull request" : `open the ${PR_DU_TICKET(ticket)}`);

// Les mots d'état d'un ticket qu'un cook tient, et ceux de la pass (rail/github.ts, `MOT_DE_L_ETAT`).
const TAKEN_MOTS = ["pris"];
const PASS_MOTS = ["en pass", "base rouge"];
const SERVED_WORD = "servi";

// Le premier ticket à raconter : le plus petit numéro qu'une lecture montre pris ou en pass — ou rien.
/** @param {readonly StepDuTicket[]} steps @returns {number | undefined} */
export function firstTaken(steps) {
  const tenus = steps.filter(({ etat: state }) => TAKEN_MOTS.includes(state) || PASS_MOTS.includes(state)).map(({ ticket }) => ticket);
  return tenus.length === 0 ? undefined : Math.min(...tenus);
}

// Les lignes du récit, une lecture de plus vue : ce que l'étape lue ajoute à ce qui est déjà dit. Un tour du ticket va
// d'une prise à la pass ; un renvoi en ouvre un autre. Dans un tour, chaque étape ne se dit qu'une fois ; la PR ne se redit
// pas quand c'est la même, reprise par le cook suivant. Servi, le récit est fini : rien ne s'y ajoute plus.
/** @param {readonly Line[]} lines @param {StepDuTicket} step @param {string} maintenant @returns {Line[]} */
export function avancer(lines, step, maintenant) {
  if (lines.some(({ cle }) => cle === "servi")) return [...lines];
  const dites = [...lines];
  /** @param {Line} line */
  const tell = (line) => dites.push(line);
  const depuisLeSendBack = () => {
    const rang = dites.map(({ cle }) => cle).lastIndexOf("renvoi");
    return dites.slice(rang + 1);
  };
  const pr = step.pr ?? undefined;
  if (step.etat === SERVED_WORD) {
    tell({ cle: "servi", le: maintenant, ...(pr === undefined ? {} : { pr }) });
    return dites;
  }
  const taken = TAKEN_MOTS.includes(step.etat);
  const enPass = PASS_MOTS.includes(step.etat);
  if (!taken && !enPass) return dites;
  if (!dites.some(({ cle }) => cle === "pris")) tell({ cle: "pris", le: maintenant });
  const dejaRenvoye = Math.max(0, ...dites.flatMap(({ cle, n }) => (cle === "renvoi" && n !== undefined ? [n] : [])));
  if (step.renvoi !== null && step.renvoi.n > dejaRenvoye) {
    tell({ cle: "renvoi", le: maintenant, n: step.renvoi.n, raison: step.renvoi.raison });
    if (taken) tell({ cle: "repris", le: maintenant });
  }
  const tour = depuisLeSendBack();
  if (pr !== undefined && !dites.some((line) => line.cle === "pr" && line.pr?.url === pr.url) && !tour.some(({ cle }) => cle === "pr")) tell({ cle: "pr", le: maintenant, pr });
  if (enPass && !tour.some(({ cle }) => cle === "pass")) tell({ cle: "pass", le: maintenant });
  return dites;
}

// Un récit relu du stockage, champ pour champ ; rien, s'il n'en a pas la forme.
/** @param {unknown} brut @returns {Story | undefined} */
export function storyLu(brut) {
  if (typeof brut !== "object" || brut === null) return undefined;
  const lu = /** @type {Record<string, unknown>} */ (brut);
  if (lu.projet !== null && typeof lu.projet !== "string") return undefined;
  if (lu.ticket !== undefined && !Number.isSafeInteger(lu.ticket)) return undefined;
  if (!Array.isArray(lu.lignes)) return undefined;
  const cles = Object.keys(MOTS);
  /** @type {Line[]} */
  const lines = [];
  for (const line of lu.lignes) {
    if (typeof line !== "object" || line === null || !cles.includes(line.cle) || typeof line.le !== "string") return undefined;
    lines.push(line);
  }
  return { projet: lu.projet, ...(lu.ticket === undefined ? {} : { ticket: /** @type {number} */ (lu.ticket) }), lignes: lines, ...(lu.range === true ? { range: /** @type {const} */ (true) } : {}) };
}

// Le récit tenu pour la vue, gardé dans `stockage`. `rendre` : il a changé.
/** @param {{ stockage: { getItem(cle: string): string | null, setItem(cle: string, valeur: string): void } | undefined, rendre: () => void, maintenant?: () => string }} options */
export function holdLeStoryDuFirstTicket({ stockage, rendre, maintenant = () => new Date().toISOString() }) {
  // `illisible` : le stockage tient une trace que la vue ne sait pas lire — rien n'est raconté, rien n'est écrit dessus.
  let illisible = false;
  /** @type {Story | undefined} */
  let story;
  try {
    const brut = stockage?.getItem(CLE_DU_FIRST_TICKET) ?? null;
    if (brut !== null) {
      story = storyLu(JSON.parse(brut));
      illisible = story === undefined;
    }
  } catch {
    illisible = true;
  }
  /** @param {Story} nouveau */
  const garder = (nouveau) => {
    story = nouveau;
    try {
      stockage?.setItem(CLE_DU_FIRST_TICKET, JSON.stringify(nouveau));
    } catch {
      // Un stockage plein ou refusé : le récit se tient le temps que l'app tourne.
    }
    rendre();
  };
  return {
    // Un projet qu'« Add a project » vient d'ajouter. `autres` : le fichier des projets en a d'autres que la cuisine de
    // démonstration — ce n'est pas le premier du chef. Seul le premier ajout décide.
    /** @param {string} project @param {boolean} autres */
    projetAjoute(project, autres) {
      if (illisible || story !== undefined) return;
      garder({ projet: autres ? null : project, lignes: [] });
    },
    // Une lecture du rail de `projet` : ses tickets, où ils en sont.
    /** @param {string} project @param {readonly StepDuTicket[] | undefined} steps */
    observer(project, steps) {
      if (illisible || story === undefined || story.range === true || story.projet !== project || steps === undefined) return;
      const ticket = story.ticket ?? firstTaken(steps);
      if (ticket === undefined) return;
      const step = steps.find((candidate) => candidate.ticket === ticket);
      const lines = step === undefined ? story.lignes : avancer(story.lignes, step, maintenant());
      if (story.ticket === ticket && lines.length === story.lignes.length) return;
      garder({ ...story, ticket, lignes: lines });
    },
    // Le récit à montrer sur la page de `projet` : son ticket et ses lignes ; rien s'il n'y en a pas, ou qu'il est rangé.
    /** @param {string} project @returns {{ ticket: number, lignes: Line[] } | undefined} */
    de(project) {
      if (illisible || story === undefined || story.range === true || story.projet !== project || story.ticket === undefined || story.lignes.length === 0) return undefined;
      return { ticket: story.ticket, lignes: story.lignes };
    },
    ranger() {
      if (illisible || story === undefined || story.range === true) return;
      garder({ ...story, range: true });
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
/** @param {Line} ligne @param {number} ticket */
function explanation({ cle, pr }, ticket) {
  const numero = pr?.numero ?? null;
  if (cle === "pris") return TAKEN(ticket);
  if (cle === "repris") return REPRIS(ticket);
  if (cle === "pr") return PR_OUVERTE(ticket, numero);
  if (cle === "pass") return EN_PASS;
  if (cle === "renvoi") return RENVOYE;
  return SERVED(ticket, numero);
}

// Le récit, au-dessus du rail : son titre et le geste qui le range, puis une ligne par étape, dans l'ordre où elles ont
// été vues — son mot, ce qu'il veut dire, la raison d'un renvoi, et le lien de la PR où elle s'ouvre. `ouvrir` ouvre la
// PR du ticket : la vue nomme le ticket, le process principal tient l'adresse.
/** @param {Fabrique} doc @param {{ ticket: number, lignes: readonly Line[] }} recit @param {{ ouvrir: () => void, ranger: () => void }} action */
export function poserStoryDuFirstTicket(doc, { ticket, lignes: lines }, action) {
  const racine = cree(doc, "section");
  racine.className = "recit-premier-ticket";
  racine.ariaLabel = TITRE(ticket);
  const tete = cree(doc, "p");
  tete.className = "tete";
  tete.append(cree(doc, "strong", TITRE(ticket)), buttonAction(doc, RANGER, action.ranger));
  const liste = cree(doc, "ol");
  liste.className = "etapes";
  for (const line of lines) {
    const pose = cree(doc, "li");
    pose.className = "etape";
    pose.dataset.etape = line.cle;
    const word = cree(doc, "strong", MOTS[line.cle]);
    word.className = "mot";
    const dit = cree(doc, "span", explanation(line, ticket));
    dit.className = "dit";
    pose.append(word, dit);
    if (line.cle === "renvoi" && line.raison !== undefined && line.raison.trim() !== "") {
      const raison = cree(doc, "p", tellLaPrParSonTicket(line.raison, ticket));
      raison.className = "raison";
      pose.append(raison);
    }
    const pr = line.pr;
    if (pr !== undefined && (line.cle === "pr" || line.cle === "servi")) pose.append(buttonAction(doc, OUVRIR_LA_PR(ticket, pr.numero), action.ouvrir));
    liste.append(pose);
  }
  racine.append(tete, liste);
  return racine;
}
