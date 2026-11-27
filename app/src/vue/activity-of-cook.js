// @ts-check
// Ce que fait le cook d'un ticket, sur sa fiche (ticket 1846) : à la place de son terminal, que l'app ne suit pas, ce
// que le process principal en lit sur GitHub (board/read.ts, ticket 2061) — sa station, depuis sa prise, ce que la
// cuisine en fait, sa PR. Tant qu'il tourne : sa pilule `cooking`, sa station, depuis quand ; ce qu'il fait en ce
// moment. Ses tours, ses tokens et ses gestes ne sont que dans le journal de sa station : la fiche les montre quand
// ils sont donnés. La fiche se repose à chaque lecture du rail : ce qu'elle montre suit le cook, daté par cette lecture.
// Un ticket sans cook n'a pas de section.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.

import { hover } from "./bricks.js";
import { lineError } from "./components/line-error/line-error.js";
import { button } from "./components/button/button.js";
import { lineEmpty } from "./components/line-empty/line-empty.js";
import { NOT_REACHED, THIS_COMPUTER } from "./lexicon.js";
import { PR_OF_TICKET } from "./pr-of-ticket.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../board/read.ts").ActivityOfCook} Activity */
/** @typedef {import("../board/read.ts").StepOfCook} Step */
/**
 * Ce que le process principal envoie d'un projet, à chaque lecture de son rail : l'heure de la lecture et l'activité de
 * ses cooks — ou pourquoi elle ne se lit pas.
 * @typedef {{ projet: string, lu: string, activites: readonly Activity[] } | { projet: string, sans: string }} Published
 */

export const TITLE = "its cook";
export const IN_PROGRESS = "cooking";
export const WITHOUT_PR = "it opened no PR";
export const UNAVAILABLE = NOT_REACHED("its cook's activity");
// D'où vient ce que la section dit, au survol de sa dernière ligne.
export const SOURCE = `What GitHub says of the cook — the claim comment of its station, its PR — read with ${THIS_COMPUTER}'s GitHub account, nothing else. It is read again with the rail, every 30 seconds, and this sheet follows it.`;

// Comment un cook a fini (`fin`, board/read.ts), en mots, et la couleur de sa pilule. Un mot qui n'y
// est pas se dit tel quel, pilule grise.
/** @type {Readonly<Record<string, { mot: string, ton: string }>>} */
export const ENDS = {
  ok: { mot: "finished", ton: "vert" },
  neutral: { mot: "finished, nothing to deliver", ton: "gris" },
  failed: { mot: "failed", ton: "rouge" },
  guard: { mot: "stopped by a guardrail", ton: "rouge" },
  refused: { mot: "refused", ton: "rouge" },
  stop: { mot: "stopped", ton: "jaune" },
  interrupted: { mot: "interrupted", ton: "jaune" },
};

/** @param {string} end */
export const endSaid = (end) => ENDS[end] ?? { mot: end, ton: "gris" };

// Une durée, comme `status` la dit (board/rail.ts, `dureeEn`).
/** @param {number} ms */
export function duration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} d`;
}

// Une heure de la box, en UTC, comme l'histoire de la fiche les dit (story.ts, `instant`), sans le jour.
/** @param {string} iso */
export const hourUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

/** @param {Step} etape */
export const action = ({ faitEn: doneEn, cible: target }) => (target === null ? doneEn : `${doneEn} ${target}`);

// Le cook du ticket que la lecture publie : rien quand elle ne le nomme pas.
/** @param {Published | undefined} published @param {number} ticket @returns {Activity | undefined} */
export function cookOfTicket(published, ticket) {
  return published === undefined || "sans" in published ? undefined : published.activites.find((activity) => activity.ticket === ticket);
}

// La ligne de tête : sa station, depuis quand ou quand il a fini, ses tours et ses tokens — ce que la box a dit seulement.
/** @param {Activity} cook @param {string} readOne */
export function headOfCook(cook, readOne) {
  const finished = cook.finiLe !== null;
  const time = finished ? `at ${hourUtc(/** @type {string} */ (cook.finiLe))}, after ${duration(Date.parse(/** @type {string} */ (cook.finiLe)) - Date.parse(cook.lanceLe))}` : `for ${duration(Date.parse(readOne) - Date.parse(cook.lanceLe))}`;
  return [
    time,
    ...(cook.station === null ? [] : [`on ${cook.station}`]),
    ...(cook.tours === null ? [] : [`${cook.tours} turn${cook.tours === 1 ? "" : "s"}`]),
    ...(cook.tokens === null ? [] : [`${cook.tokens.toLocaleString("en-US")} tokens`]),
  ].join(" · ");
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La section de la fiche : rien pour un ticket que la lecture ne nomme pas, ni avant la première lecture.
// `pastille` : celle de la vue (le mot et son ton). `ouvrirPr` : ouvre la PR du cook — son adresse reste au process principal.
/**
 * @param {Fabrique} doc
 * @param {{ publiees: Published | undefined, ticket: number, pastille: (word: string, your: string | undefined) => any, ouvrirPr: () => void }} options
 */
export function setTheActivityOfCook(doc, { publiees: published, ticket, pastille: pill, ouvrirPr: openPr }) {
  if (published === undefined) return null;
  const section = created(doc, "section");
  section.className = "activite-du-cook";
  section.ariaLabel = `what #${ticket}'s cook is doing`;
  if ("sans" in published) {
    section.append(created(doc, "h4", TITLE), lineError(doc, UNAVAILABLE, published.sans));
    return section;
  }
  const cook = cookOfTicket(published, ticket);
  if (cook === undefined) return null;
  const finished = cook.finiLe !== null;
  const { mot: word, ton: your } = finished ? endSaid(cook.fin ?? "") : { mot: IN_PROGRESS, ton: "vert" };
  const capsule = created(doc, "span");
  capsule.className = "pilule";
  capsule.dataset.ton = your;
  capsule.append(pill(word, your), created(doc, "strong", word));
  const state = created(doc, "p");
  state.className = "etat";
  state.append(capsule, created(doc, "small", headOfCook(cook, published.lu)));
  section.append(created(doc, "h4", TITLE), state);
  // Ce qu'il fait en ce moment, tant qu'il tourne : son geste, et depuis quand.
  if (!finished) {
    const now = created(doc, "p");
    now.className = "maintenant";
    if (cook.maintenant === null) {
      const you = lineEmpty(doc, "its station does not say what it is doing", { classe: "sans", balise: "span" });
      now.append(created(doc, "span", "now"), you);
    } else now.append(created(doc, "span", "now"), created(doc, "strong", action(cook.maintenant)), created(doc, "small", `for ${duration(Date.parse(published.lu) - Date.parse(cook.maintenant.depuis))}`));
    section.append(now);
  }
  // Ses derniers gestes, le plus ancien d'abord — celui de maintenant est dit au-dessus.
  const past = finished || cook.maintenant === null ? cook.etapes : cook.etapes.slice(0, -1);
  if (past.length > 0) {
    const list = created(doc, "ol");
    list.className = "etapes";
    list.ariaLabel = "its latest steps";
    for (const step of past) {
      const line = created(doc, "li");
      line.append(created(doc, "span", action(step)), created(doc, "time", hourUtc(step.depuis)));
      list.append(line);
    }
    section.append(created(doc, "p", finished ? "its last steps" : "before that"), list);
  }
  // Sa PR, dès que la box la connaît — dite par son ticket (ticket 3716) ; fini sans PR, une ligne le dit.
  if (cook.pr !== null) {
    const opens = button(doc, cook.pr.numero === null ? "open its PR" : `open the ${PR_OF_TICKET(ticket)}`, () => openPr());
    opens.className = "pr";
    opens.title = `open #${ticket}'s PR in the browser`;
    section.append(opens);
  } else if (finished) {
    const without = lineEmpty(doc, WITHOUT_PR, { classe: "sans" });
    section.append(without);
  }
  const source = created(doc, "small", `as GitHub said at ${hourUtc(published.lu)}`);
  source.className = "source";
  source.append(hover(doc, SOURCE));
  section.append(source);
  return section;
}
