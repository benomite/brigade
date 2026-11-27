// @ts-check
// Le journal du jour et la carte du digest de la veille, dans la vue du projet (ticket 4274, épique 4025, spec
// 2026-11-23-autonomy-trust-control.md, T1). Le journal se tire des fils des agents (projects/log-of-day.ts) : quatre
// groupes — livré, cassé, réparé par le système, non réparé avec les erreurs du système lui-même —, chaque entrée avec
// l'agent dont elle vient, sa raison au survol. La carte du digest se pose en tête de la vue à la première ouverture du
// projet dans le jour, le nombre de pannes vues d'abord par le chef avant toute autre ligne. L'un et l'autre se lisent :
// ce ne sont pas des alertes, rien d'ici ne demande une notification.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hourUtc } from "../activity-of-cook.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/log-of-day.ts").EntryOfLog} Entry */
/** @typedef {NonNullable<import("../../facts.ts").Board["journal"]>} Log */
/** @typedef {NonNullable<import("../../facts.ts").Board["digest"]>} Digest */
/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} Storage */

const TITLE_OF_LOG = "Today's logbook";
const TITLE_OF_DIGEST = "Yesterday";
const GROUPS = /** @type {const} */ ([
  ["delivered", "Delivered"],
  ["broke", "Broke"],
  ["fixedBySelf", "Fixed by the system"],
  ["notFixed", "Not fixed"],
]);
const ERRORS = "The system's own mistakes";
const NOTHING = "nothing";
/** @param {number} n */
const UNREADABLE = (n) => `${n} ${n === 1 ? "gesture" : "gestures"} of the threads not readable`;
/** @param {number} n */
const NOT_RANGES = (n) => `${n} ${n === 1 ? "gesture" : "gestures"} of the day of a kind the logbook does not know`;
const KEY = "brigade.digest-vu";

// Le jour du chef, sur l'horloge de son ordinateur : la carte est celle de son matin.
/** @param {Date} when */
export const dayOf = (when) => `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;

// Quand montrer la carte du digest : à la première ouverture du projet dans le jour, et tant que la vue reste ouverte ce
// jour-là ; pas à une autre ouverture le même jour. Le jour vu est gardé par projet dans `stockage`. Un stockage qui ne se lit
// pas, ou absent, ne cache jamais la carte : mieux vaut la revoir que la perdre ; un stockage qui refuse l'écriture non plus.
/** @param {Storage | undefined} storage */
export function holdTheCardOfMorning(storage) {
  /** @type {Map<string, string>} */
  const shown = new Map();
  /** @returns {Record<string, string>} */
  const seenOnes = () => {
    try {
      const readOnes = JSON.parse(storage?.getItem(KEY) ?? "{}");
      return typeof readOnes === "object" && readOnes !== null && !Array.isArray(readOnes) ? readOnes : {};
    } catch {
      return {};
    }
  };
  /** @param {string} project @param {string} day @returns {boolean} */
  const aShow = (project, day) => {
    if (shown.get(project) === day) return true;
    const alreadySeen = seenOnes();
    if (alreadySeen[project] === day) return false;
    shown.set(project, day);
    try {
      storage?.setItem(KEY, JSON.stringify({ ...alreadySeen, [project]: day }));
    } catch {
      // Rien n'est gardé : la prochaine ouverture du jour remontrera la carte.
    }
    return true;
  };
  return { aMontrer: aShow };
}

// La carte du digest de la veille : le compte des pannes vues d'abord par le chef en premier, puis les autres lignes dans
// l'ordre du digest. Texte seul.
/** @param {Fabrique} doc @param {Digest} digest */
export function setTheCardOfDigest(doc, digest) {
  const card = doc.createElement("section");
  card.className = "digest-du-matin";
  card.ariaLabel = TITLE_OF_DIGEST;
  const title = doc.createElement("h3");
  title.textContent = TITLE_OF_DIGEST;
  card.append(title);
  if ("illisible" in digest) {
    card.append(lineError(doc, digest.illisible));
    return card;
  }
  // La ligne des pannes vues d'abord par le chef, trouvée à la lecture (log/threads.ts), passe devant les autres.
  const lines = [digest.vuesParLeChef, ...digest.lignes];
  const list = doc.createElement("ul");
  for (const [rank, said] of lines.entries()) {
    const line = doc.createElement("li");
    line.textContent = said;
    if (rank === 0) line.className = "vues-par-le-chef";
    list.append(line);
  }
  card.append(list);
  return card;
}

// Le journal du jour : ses quatre groupes, toujours tous les quatre — un groupe vide le dit en un mot.
/** @param {Fabrique} doc @param {Log} log */
export function setTheLog(doc, log) {
  const section = doc.createElement("section");
  section.className = "journal-du-jour";
  section.ariaLabel = TITLE_OF_LOG;
  const title = doc.createElement("h3");
  title.textContent = TITLE_OF_LOG;
  section.append(title);
  if ("illisible" in log) {
    section.append(lineError(doc, log.illisible));
    return section;
  }
  const groups = doc.createElement("div");
  groups.className = "groupes";
  for (const [key, name] of GROUPS) {
    const group = doc.createElement("section");
    group.className = "groupe";
    group.dataset.groupe = key;
    const head = doc.createElement("h4");
    head.textContent = name;
    group.append(head, entries(doc, log[key]));
    if (key === "notFixed" && log.mistakes.length > 0) {
      const underHead = doc.createElement("h5");
      underHead.textContent = ERRORS;
      group.append(underHead, entries(doc, log.mistakes));
    }
    groups.append(group);
  }
  section.append(groups);
  if (log.illisibles > 0) section.append(lineError(doc, UNREADABLE(log.illisibles)));
  if (log.nonRanges > 0) section.append(lineError(doc, NOT_RANGES(log.nonRanges)));
  return section;
}

// Les entrées d'un groupe, une ligne chacune : l'heure, l'agent dont le fil la dit, le geste et son issue ; sa raison au
// survol. Sans entrée, « nothing ».
/** @param {Fabrique} doc @param {Entry[]} list */
function entries(doc, list) {
  if (list.length === 0) return lineEmpty(doc, NOTHING);
  const ul = doc.createElement("ul");
  for (const { agent, at, line, reason, outcome } of list) {
    const li = doc.createElement("li");
    li.textContent = `${hourUtc(at)} · ${agent} · ${line} — ${outcome}`;
    li.title = reason;
    ul.append(li);
  }
  return ul;
}
