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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { tellThePrParItsTicket, PR_OF_TICKET } from "../pr-of-ticket.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../facts.ts").StepOfTicket} StepOfTicket */
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
export const KEY_OF_FIRST_TICKET = "brigade.recit-premier-ticket";

/** @param {number} ticket */
export const TITLE = (ticket) => `Your first ticket, #${ticket}, step by step`;
export const TIDY = "dismiss";
// Le mot de chaque étape, tel que le rail et le glossaire le disent.
export const WORDS = { pris: "Taken", repris: "Taken again", pr: "Pull request", pass: "In pass", renvoi: "Sent back", servi: "Served" };
/** @param {number} ticket */
export const TAKEN = (ticket) => `A cook took #${ticket}: a claude session that works in its own copy of the repository (a worktree), so nothing it does touches your files until it is merged.`;
/** @param {number} ticket */
export const RESUMED = (ticket) => `A cook took #${ticket} again, in its own copy, to fix what the pass said.`;
/** @param {number} ticket @param {number | null} number */
export const PR_OPEN = (ticket, number) => `The cook handed over its work as a pull request${number === null ? "" : ` (the ${PR_OF_TICKET(ticket)})`}: the change it proposes to your repository, open for checking.`;
export const EN_PASS = "The pass is checking the pull request: the gates (the project's own checks), the CI, and a review by another session that did not write it.";
export const SENT_BACK = "The pass sent the work back to a cook, because:";
/** @param {number} ticket @param {number | null} number */
export const SERVED = (ticket, number) => `The pass merged ${number === null ? "the pull request" : `the ${PR_OF_TICKET(ticket)}`}: #${ticket} is done, and its change is in your repository.`;
/** @param {number} ticket @param {number | null} number */
export const OPEN_THE_PR = (ticket, number) => (number === null ? "open the pull request" : `open the ${PR_OF_TICKET(ticket)}`);

// Les mots d'état d'un ticket qu'un cook tient, et ceux de la pass (rail/github.ts, `MOT_DE_L_ETAT`).
const TAKEN_WORDS = ["pris"];
const PASS_WORDS = ["en pass", "base rouge"];
const SERVED_WORD = "servi";

// Le premier ticket à raconter : le plus petit numéro qu'une lecture montre pris ou en pass — ou rien.
/** @param {readonly StepOfTicket[]} steps @returns {number | undefined} */
export function firstTaken(steps) {
  const heldOnes = steps.filter(({ etat: state }) => TAKEN_WORDS.includes(state) || PASS_WORDS.includes(state)).map(({ ticket }) => ticket);
  return heldOnes.length === 0 ? undefined : Math.min(...heldOnes);
}

// Les lignes du récit, une lecture de plus vue : ce que l'étape lue ajoute à ce qui est déjà dit. Un tour du ticket va
// d'une prise à la pass ; un renvoi en ouvre un autre. Dans un tour, chaque étape ne se dit qu'une fois ; la PR ne se redit
// pas quand c'est la même, reprise par le cook suivant. Servi, le récit est fini : rien ne s'y ajoute plus.
/** @param {readonly Line[]} lines @param {StepOfTicket} step @param {string} now @returns {Line[]} */
export function advance(lines, step, now) {
  if (lines.some(({ cle: key }) => key === "servi")) return [...lines];
  const saidEntries = [...lines];
  /** @param {Line} line */
  const tell = (line) => saidEntries.push(line);
  const sinceTheSendBack = () => {
    const rank = saidEntries.map(({ cle: key }) => key).lastIndexOf("renvoi");
    return saidEntries.slice(rank + 1);
  };
  const pr = step.pr ?? undefined;
  if (step.etat === SERVED_WORD) {
    tell({ cle: "servi", le: now, ...(pr === undefined ? {} : { pr }) });
    return saidEntries;
  }
  const taken = TAKEN_WORDS.includes(step.etat);
  const enPass = PASS_WORDS.includes(step.etat);
  if (!taken && !enPass) return saidEntries;
  if (!saidEntries.some(({ cle: key }) => key === "pris")) tell({ cle: "pris", le: now });
  const alreadySentBack = Math.max(0, ...saidEntries.flatMap(({ cle: key, n }) => (key === "renvoi" && n !== undefined ? [n] : [])));
  if (step.renvoi !== null && step.renvoi.n > alreadySentBack) {
    tell({ cle: "renvoi", le: now, n: step.renvoi.n, raison: step.renvoi.raison });
    if (taken) tell({ cle: "repris", le: now });
  }
  const tour = sinceTheSendBack();
  if (pr !== undefined && !saidEntries.some((line) => line.cle === "pr" && line.pr?.url === pr.url) && !tour.some(({ cle: key }) => key === "pr")) tell({ cle: "pr", le: now, pr });
  if (enPass && !tour.some(({ cle: key }) => key === "pass")) tell({ cle: "pass", le: now });
  return saidEntries;
}

// Un récit relu du stockage, champ pour champ ; rien, s'il n'en a pas la forme.
/** @param {unknown} raw @returns {Story | undefined} */
export function storyRead(raw) {
  if (typeof raw !== "object" || raw === null) return undefined;
  const readOne = /** @type {Record<string, unknown>} */ (raw);
  if (readOne.projet !== null && typeof readOne.projet !== "string") return undefined;
  if (readOne.ticket !== undefined && !Number.isSafeInteger(readOne.ticket)) return undefined;
  if (!Array.isArray(readOne.lignes)) return undefined;
  const keys = Object.keys(WORDS);
  /** @type {Line[]} */
  const lines = [];
  for (const line of readOne.lignes) {
    if (typeof line !== "object" || line === null || !keys.includes(line.cle) || typeof line.le !== "string") return undefined;
    lines.push(line);
  }
  return { projet: readOne.projet, ...(readOne.ticket === undefined ? {} : { ticket: /** @type {number} */ (readOne.ticket) }), lignes: lines, ...(readOne.range === true ? { range: /** @type {const} */ (true) } : {}) };
}

// Le récit tenu pour la vue, gardé dans `stockage`. `rendre` : il a changé.
/** @param {{ stockage: { getItem(key: string): string | null, setItem(key: string, value: string): void } | undefined, rendre: () => void, maintenant?: () => string }} options */
export function holdTheStoryOfFirstTicket({ stockage: storage, rendre: render, maintenant: now = () => new Date().toISOString() }) {
  // `illisible` : le stockage tient une trace que la vue ne sait pas lire — rien n'est raconté, rien n'est écrit dessus.
  let unreadable = false;
  /** @type {Story | undefined} */
  let story;
  try {
    const raw = storage?.getItem(KEY_OF_FIRST_TICKET) ?? null;
    if (raw !== null) {
      story = storyRead(JSON.parse(raw));
      unreadable = story === undefined;
    }
  } catch {
    unreadable = true;
  }
  /** @param {Story} newOne */
  const keep = (newOne) => {
    story = newOne;
    try {
      storage?.setItem(KEY_OF_FIRST_TICKET, JSON.stringify(newOne));
    } catch {
      // Un stockage plein ou refusé : le récit se tient le temps que l'app tourne.
    }
    render();
  };
  return {
    // Un projet qu'« Add a project » vient d'ajouter. `autres` : le fichier des projets en a d'autres que la cuisine de
    // démonstration — ce n'est pas le premier du chef. Seul le premier ajout décide.
    /** @param {string} project @param {boolean} others */
    projetAjoute(project, others) {
      if (unreadable || story !== undefined) return;
      keep({ projet: others ? null : project, lignes: [] });
    },
    // Une lecture du rail de `projet` : ses tickets, où ils en sont.
    /** @param {string} project @param {readonly StepOfTicket[] | undefined} steps */
    observer(project, steps) {
      if (unreadable || story === undefined || story.range === true || story.projet !== project || steps === undefined) return;
      const ticket = story.ticket ?? firstTaken(steps);
      if (ticket === undefined) return;
      const step = steps.find((candidate) => candidate.ticket === ticket);
      const lines = step === undefined ? story.lignes : advance(story.lignes, step, now());
      if (story.ticket === ticket && lines.length === story.lignes.length) return;
      keep({ ...story, ticket, lignes: lines });
    },
    // Le récit à montrer sur la page de `projet` : son ticket et ses lignes ; rien s'il n'y en a pas, ou qu'il est rangé.
    /** @param {string} project @returns {{ ticket: number, lignes: Line[] } | undefined} */
    de(project) {
      if (unreadable || story === undefined || story.range === true || story.projet !== project || story.ticket === undefined || story.lignes.length === 0) return undefined;
      return { ticket: story.ticket, lignes: story.lignes };
    },
    ranger() {
      if (unreadable || story === undefined || story.range === true) return;
      keep({ ...story, range: true });
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Ce qu'une ligne dit, après son mot.
/** @param {Line} ligne @param {number} ticket */
function explanation({ cle: key, pr }, ticket) {
  const number = pr?.numero ?? null;
  if (key === "pris") return TAKEN(ticket);
  if (key === "repris") return RESUMED(ticket);
  if (key === "pr") return PR_OPEN(ticket, number);
  if (key === "pass") return EN_PASS;
  if (key === "renvoi") return SENT_BACK;
  return SERVED(ticket, number);
}

// Le récit, au-dessus du rail : son titre et le geste qui le range, puis une ligne par étape, dans l'ordre où elles ont
// été vues — son mot, ce qu'il veut dire, la raison d'un renvoi, et le lien de la PR où elle s'ouvre. `ouvrir` ouvre la
// PR du ticket : la vue nomme le ticket, le process principal tient l'adresse.
/** @param {Fabrique} doc @param {{ ticket: number, lignes: readonly Line[] }} recit @param {{ ouvrir: () => void, ranger: () => void }} action */
export function setStoryOfFirstTicket(doc, { ticket, lignes: lines }, action) {
  const root = created(doc, "section");
  root.className = "recit-premier-ticket";
  root.ariaLabel = TITLE(ticket);
  const head = created(doc, "p");
  head.className = "tete";
  head.append(created(doc, "strong", TITLE(ticket)), buttonAction(doc, TIDY, action.ranger));
  const list = created(doc, "ol");
  list.className = "etapes";
  for (const line of lines) {
    const pose = created(doc, "li");
    pose.className = "etape";
    pose.dataset.etape = line.cle;
    const word = created(doc, "strong", WORDS[line.cle]);
    word.className = "mot";
    const said = created(doc, "span", explanation(line, ticket));
    said.className = "dit";
    pose.append(word, said);
    if (line.cle === "renvoi" && line.raison !== undefined && line.raison.trim() !== "") {
      const reason = created(doc, "p", tellThePrParItsTicket(line.raison, ticket));
      reason.className = "raison";
      pose.append(reason);
    }
    const pr = line.pr;
    if (pr !== undefined && (line.cle === "pr" || line.cle === "servi")) pose.append(buttonAction(doc, OPEN_THE_PR(ticket, pr.numero), action.ouvrir));
    list.append(pose);
  }
  root.append(head, list);
  return root;
}
