// @ts-check
// Ce que fait le cook d'un ticket, sur sa fiche (ticket 1846) : à la place de son terminal, que l'app ne suit pas, ce
// que le process principal en lit sur GitHub (tableau/read.ts, ticket 2061) — sa station, depuis sa prise, ce que la
// cuisine en fait, sa PR. Tant qu'il tourne : sa pilule `cooking`, sa station, depuis quand ; ce qu'il fait en ce
// moment. Ses tours, ses tokens et ses gestes ne sont que dans le journal de sa station : la fiche les montre quand
// ils sont donnés. La fiche se repose à chaque lecture du rail : ce qu'elle montre suit le cook, daté par cette lecture.
// Un ticket sans cook n'a pas de section.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";
import { lineError } from "./composants/line-error/line-error.js";
import { button } from "./composants/button/button.js";
import { lineEmpty } from "./composants/line-empty/line-empty.js";
import { NON_ATTEINT, CET_ORDINATEUR } from "./lexique.js";
import { PR_DU_TICKET } from "./pr-du-ticket.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../tableau/read.ts").ActivityDuCook} Activity */
/** @typedef {import("../tableau/read.ts").StepDuCook} Step */
/**
 * Ce que le process principal envoie d'un projet, à chaque lecture de son rail : l'heure de la lecture et l'activité de
 * ses cooks — ou pourquoi elle ne se lit pas.
 * @typedef {{ projet: string, lu: string, activites: readonly Activity[] } | { projet: string, sans: string }} Publiees
 */

export const TITRE = "its cook";
export const EN_COURS = "cooking";
export const SANS_PR = "it opened no PR";
export const INDISPONIBLE = NON_ATTEINT("its cook's activity");
// D'où vient ce que la section dit, au survol de sa dernière ligne.
export const SOURCE = `What GitHub says of the cook — the claim comment of its station, its PR — read with ${CET_ORDINATEUR}'s GitHub account, nothing else. It is read again with the rail, every 30 seconds, and this sheet follows it.`;

// Comment un cook a fini (`fin`, tableau/read.ts), en mots, et la couleur de sa pilule. Un mot qui n'y
// est pas se dit tel quel, pilule grise.
/** @type {Readonly<Record<string, { mot: string, ton: string }>>} */
export const FINS = {
  ok: { mot: "finished", ton: "vert" },
  neutral: { mot: "finished, nothing to deliver", ton: "gris" },
  failed: { mot: "failed", ton: "rouge" },
  guard: { mot: "stopped by a guardrail", ton: "rouge" },
  refused: { mot: "refused", ton: "rouge" },
  stop: { mot: "stopped", ton: "jaune" },
  interrupted: { mot: "interrupted", ton: "jaune" },
};

/** @param {string} fin */
export const finDite = (fin) => FINS[fin] ?? { mot: fin, ton: "gris" };

// Une durée, comme `status` la dit (tableau/rail.ts, `dureeEn`).
/** @param {number} ms */
export function duree(ms) {
  const secondes = Math.max(0, Math.round(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} d`;
}

// Une heure de la box, en UTC, comme l'histoire de la fiche les dit (histoire.ts, `instant`), sans le jour.
/** @param {string} iso */
export const heureUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

/** @param {Step} etape */
export const action = ({ faitEn, cible }) => (cible === null ? faitEn : `${faitEn} ${cible}`);

// Le cook du ticket que la lecture publie : rien quand elle ne le nomme pas.
/** @param {Publiees | undefined} publiees @param {number} ticket @returns {Activity | undefined} */
export function cookDuTicket(publiees, ticket) {
  return publiees === undefined || "sans" in publiees ? undefined : publiees.activites.find((activity) => activity.ticket === ticket);
}

// La ligne de tête : sa station, depuis quand ou quand il a fini, ses tours et ses tokens — ce que la box a dit seulement.
/** @param {Activity} cook @param {string} lu */
export function teteDuCook(cook, lu) {
  const fini = cook.finiLe !== null;
  const time = fini ? `at ${heureUtc(/** @type {string} */ (cook.finiLe))}, after ${duree(Date.parse(/** @type {string} */ (cook.finiLe)) - Date.parse(cook.lanceLe))}` : `for ${duree(Date.parse(lu) - Date.parse(cook.lanceLe))}`;
  return [
    time,
    ...(cook.station === null ? [] : [`on ${cook.station}`]),
    ...(cook.tours === null ? [] : [`${cook.tours} turn${cook.tours === 1 ? "" : "s"}`]),
    ...(cook.tokens === null ? [] : [`${cook.tokens.toLocaleString("en-US")} tokens`]),
  ].join(" · ");
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La section de la fiche : rien pour un ticket que la lecture ne nomme pas, ni avant la première lecture.
// `pastille` : celle de la vue (le mot et son ton). `ouvrirPr` : ouvre la PR du cook — son adresse reste au process principal.
/**
 * @param {Fabrique} doc
 * @param {{ publiees: Publiees | undefined, ticket: number, pastille: (word: string, ton: string | undefined) => any, ouvrirPr: () => void }} options
 */
export function poserLActivityDuCook(doc, { publiees, ticket, pastille: pill, ouvrirPr }) {
  if (publiees === undefined) return null;
  const section = cree(doc, "section");
  section.className = "activite-du-cook";
  section.ariaLabel = `what #${ticket}'s cook is doing`;
  if ("sans" in publiees) {
    section.append(cree(doc, "h4", TITRE), lineError(doc, INDISPONIBLE, publiees.sans));
    return section;
  }
  const cook = cookDuTicket(publiees, ticket);
  if (cook === undefined) return null;
  const fini = cook.finiLe !== null;
  const { mot: word, ton } = fini ? finDite(cook.fin ?? "") : { mot: EN_COURS, ton: "vert" };
  const pilule = cree(doc, "span");
  pilule.className = "pilule";
  pilule.dataset.ton = ton;
  pilule.append(pill(word, ton), cree(doc, "strong", word));
  const state = cree(doc, "p");
  state.className = "etat";
  state.append(pilule, cree(doc, "small", teteDuCook(cook, publiees.lu)));
  section.append(cree(doc, "h4", TITRE), state);
  // Ce qu'il fait en ce moment, tant qu'il tourne : son geste, et depuis quand.
  if (!fini) {
    const maintenant = cree(doc, "p");
    maintenant.className = "maintenant";
    if (cook.maintenant === null) {
      const tu = lineEmpty(doc, "its station does not say what it is doing", { classe: "sans", balise: "span" });
      maintenant.append(cree(doc, "span", "now"), tu);
    } else maintenant.append(cree(doc, "span", "now"), cree(doc, "strong", action(cook.maintenant)), cree(doc, "small", `for ${duree(Date.parse(publiees.lu) - Date.parse(cook.maintenant.depuis))}`));
    section.append(maintenant);
  }
  // Ses derniers gestes, le plus ancien d'abord — celui de maintenant est dit au-dessus.
  const passees = fini || cook.maintenant === null ? cook.etapes : cook.etapes.slice(0, -1);
  if (passees.length > 0) {
    const liste = cree(doc, "ol");
    liste.className = "etapes";
    liste.ariaLabel = "its latest steps";
    for (const step of passees) {
      const line = cree(doc, "li");
      line.append(cree(doc, "span", action(step)), cree(doc, "time", heureUtc(step.depuis)));
      liste.append(line);
    }
    section.append(cree(doc, "p", fini ? "its last steps" : "before that"), liste);
  }
  // Sa PR, dès que la box la connaît — dite par son ticket (ticket 3716) ; fini sans PR, une ligne le dit.
  if (cook.pr !== null) {
    const ouvre = button(doc, cook.pr.numero === null ? "open its PR" : `open the ${PR_DU_TICKET(ticket)}`, () => ouvrirPr());
    ouvre.className = "pr";
    ouvre.title = `open #${ticket}'s PR in the browser`;
    section.append(ouvre);
  } else if (fini) {
    const sans = lineEmpty(doc, SANS_PR, { classe: "sans" });
    section.append(sans);
  }
  const source = cree(doc, "small", `as GitHub said at ${heureUtc(publiees.lu)}`);
  source.className = "source";
  source.append(survol(doc, SOURCE));
  section.append(source);
  return section;
}
