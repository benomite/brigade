// @ts-check
// Le journal du jour et la carte du digest de la veille, dans la vue du projet (ticket 4274, épique 4025, spec
// 2026-11-23-autonomy-trust-control.md, T1). Le journal se tire des fils des agents (projects/log-du-day.ts) : quatre
// groupes — livré, cassé, réparé par le système, non réparé avec les erreurs du système lui-même —, chaque entrée avec
// l'agent dont elle vient, sa raison au survol. La carte du digest se pose en tête de la vue à la première ouverture du
// projet dans le jour, le nombre de pannes vues d'abord par le chef avant toute autre ligne. L'un et l'autre se lisent :
// ce ne sont pas des alertes, rien d'ici ne demande une notification.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { heureUtc } from "../activity-du-cook.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/log-du-day.ts").EntreeDuLog} Entree */
/** @typedef {NonNullable<import("../../facts.ts").Tableau["journal"]>} Log */
/** @typedef {NonNullable<import("../../facts.ts").Tableau["digest"]>} Digest */
/** @typedef {{ getItem(cle: string): string | null, setItem(cle: string, valeur: string): void }} Stockage */

const TITRE_DU_LOG = "Today's logbook";
const TITRE_DU_DIGEST = "Yesterday";
const GROUPES = /** @type {const} */ ([
  ["delivered", "Delivered"],
  ["broke", "Broke"],
  ["fixedBySelf", "Fixed by the system"],
  ["notFixed", "Not fixed"],
]);
const ERREURS = "The system's own mistakes";
const RIEN = "nothing";
/** @param {number} n */
const ILLISIBLES = (n) => `${n} ${n === 1 ? "gesture" : "gestures"} of the threads not readable`;
/** @param {number} n */
const NON_RANGES = (n) => `${n} ${n === 1 ? "gesture" : "gestures"} of the day of a kind the logbook does not know`;
const CLE = "brigade.digest-vu";

// Le jour du chef, sur l'horloge de son ordinateur : la carte est celle de son matin.
/** @param {Date} quand */
export const dayDe = (quand) => `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, "0")}-${String(quand.getDate()).padStart(2, "0")}`;

// Quand montrer la carte du digest : à la première ouverture du projet dans le jour, et tant que la vue reste ouverte ce
// jour-là ; pas à une autre ouverture le même jour. Le jour vu est gardé par projet dans `stockage`. Un stockage qui ne se lit
// pas, ou absent, ne cache jamais la carte : mieux vaut la revoir que la perdre ; un stockage qui refuse l'écriture non plus.
/** @param {Stockage | undefined} stockage */
export function holdLaCardDuMatin(stockage) {
  /** @type {Map<string, string>} */
  const montrees = new Map();
  /** @returns {Record<string, string>} */
  const vus = () => {
    try {
      const lus = JSON.parse(stockage?.getItem(CLE) ?? "{}");
      return typeof lus === "object" && lus !== null && !Array.isArray(lus) ? lus : {};
    } catch {
      return {};
    }
  };
  /** @param {string} project @param {string} day @returns {boolean} */
  const aShow = (project, day) => {
    if (montrees.get(project) === day) return true;
    const dejaVus = vus();
    if (dejaVus[project] === day) return false;
    montrees.set(project, day);
    try {
      stockage?.setItem(CLE, JSON.stringify({ ...dejaVus, [project]: day }));
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
export function poserLaCardDuDigest(doc, digest) {
  const card = doc.createElement("section");
  card.className = "digest-du-matin";
  card.ariaLabel = TITRE_DU_DIGEST;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE_DU_DIGEST;
  card.append(titre);
  if ("illisible" in digest) {
    card.append(lineError(doc, digest.illisible));
    return card;
  }
  // La ligne des pannes vues d'abord par le chef, trouvée à la lecture (log/fils.ts), passe devant les autres.
  const lines = [digest.vuesParLeChef, ...digest.lignes];
  const liste = doc.createElement("ul");
  for (const [rang, dit] of lines.entries()) {
    const line = doc.createElement("li");
    line.textContent = dit;
    if (rang === 0) line.className = "vues-par-le-chef";
    liste.append(line);
  }
  card.append(liste);
  return card;
}

// Le journal du jour : ses quatre groupes, toujours tous les quatre — un groupe vide le dit en un mot.
/** @param {Fabrique} doc @param {Log} log */
export function poserLeLog(doc, log) {
  const section = doc.createElement("section");
  section.className = "journal-du-jour";
  section.ariaLabel = TITRE_DU_LOG;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE_DU_LOG;
  section.append(titre);
  if ("illisible" in log) {
    section.append(lineError(doc, log.illisible));
    return section;
  }
  const groupes = doc.createElement("div");
  groupes.className = "groupes";
  for (const [cle, name] of GROUPES) {
    const groupe = doc.createElement("section");
    groupe.className = "groupe";
    groupe.dataset.groupe = cle;
    const tete = doc.createElement("h4");
    tete.textContent = name;
    groupe.append(tete, entrees(doc, log[cle]));
    if (cle === "notFixed" && log.mistakes.length > 0) {
      const sousTete = doc.createElement("h5");
      sousTete.textContent = ERREURS;
      groupe.append(sousTete, entrees(doc, log.mistakes));
    }
    groupes.append(groupe);
  }
  section.append(groupes);
  if (log.illisibles > 0) section.append(lineError(doc, ILLISIBLES(log.illisibles)));
  if (log.nonRanges > 0) section.append(lineError(doc, NON_RANGES(log.nonRanges)));
  return section;
}

// Les entrées d'un groupe, une ligne chacune : l'heure, l'agent dont le fil la dit, le geste et son issue ; sa raison au
// survol. Sans entrée, « nothing ».
/** @param {Fabrique} doc @param {Entree[]} liste */
function entrees(doc, liste) {
  if (liste.length === 0) return lineEmpty(doc, RIEN);
  const ul = doc.createElement("ul");
  for (const { agent, at, line, reason, outcome } of liste) {
    const li = doc.createElement("li");
    li.textContent = `${heureUtc(at)} · ${agent} · ${line} — ${outcome}`;
    li.title = reason;
    ul.append(li);
  }
  return ul;
}
