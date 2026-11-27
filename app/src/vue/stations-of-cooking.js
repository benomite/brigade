// @ts-check
// Ce que les stations d'un projet font tourner, et la ligne d'alerte de Rail (ticket 1185).
//   - Les cooks en cours d'une station, une ligne chacun — et, avant eux, ce qu'elle fait tourner à côté (ticket 1971) : la
//     pass qui juge une livraison, le manager qui juge ou découpe une issue, le triage, le closer qui nettoie le projet —,
//     sur la carte de chaque station de l'onglet Stations (stations-tab/, ticket 3195).
//   - Dans « Details » de la carte d'une station, le plafond du projet sur elle comme sa box le dit (ticket 1292), et en une
//     phrase ce qui la sature quand elle l'est.
//   - Sur l'onglet Rail, la ligne qui dit ce qui, du côté des cooks, demande un geste au chef — une station saturée, un
//     projet refusé, l'accès au dépôt bloqué — avec de quoi ouvrir l'onglet Stations. Une seule ligne, quel que soit le
//     nombre de causes ; aucune quand rien ne le demande.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { button } from "./components/button/button.js";
import { rowOfSetting } from "./components/setting/setting.js";
import { levelOf } from "./levels.js";
import { lineEmpty } from "./components/line-empty/line-empty.js";
import { pan } from "./components/pan/pan.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../facts.ts").Cook} Cook */
/** @typedef {import("../cooking.ts").AgentOfStation} Agent */
/** @typedef {import("../projects/request.ts").AccessBlocked} Access */
/** @typedef {import("../projects/request.ts").Refusal} Refusal */
/** @typedef {import("../projects/request.ts").FailureOfClone} Clone */
/** @typedef {import("../home.ts").CapsOfStation} Caps */

export const NOTHING_NOT_RUNS = "nothing running";
// Ce que la cuisine fait tourner hors des cooks de ticket (ticket 1971) : le mot de chaque rôle sur sa carte, et ce qu'il
// est, au survol. Un rôle que l'app ne connaît pas se dit tel quel, sans survol.
/** @type {Readonly<Record<string, string>>} */
export const ROLES_IN_PROGRESS = {
  pass: "the pass judges a delivery: its gates, its CI and the reviewer's review, then merges it or sends it back",
  manager: "the manager judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket",
  triage: "the triage takes up a card that would go to you, and settles it when it can",
  closer: "the closer cleans the project up when you ask it to, and delivers what it removes as a PR",
};
export const OPEN_COOKS = "open Cooks";
// Le plafond de cooks du projet sur une station (ticket 1292) : le nom de sa rangée.
export const CAP = "Cooks at once";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Ce qu'un agent fait, et depuis quand : la durée à la lecture, l'heure au survol.
/** @param {Fabrique} doc @param {Agent} agent */
function whatItDone(doc, { fait: done, pour: forIt, depuis: since }) {
  const said = created(doc, "span", `${done} · for ${forIt}`);
  said.className = "agent-fait";
  said.title = `since ${since}`;
  return said;
}

// Son rôle, au mot de sa carte, et ce qu'il est au survol.
/** @param {Fabrique} doc @param {string} role */
function wordOfRole(doc, role) {
  const word = created(doc, "strong", role);
  word.className = "agent-role";
  const hover = Object.hasOwn(ROLES_IN_PROGRESS, role) ? ROLES_IN_PROGRESS[role] : undefined;
  if (hover !== undefined) word.title = hover;
  return word;
}

// Les cooks en cours d'une station, une ligne chacun : son ticket et son titre (l'écran étroit) — après ce qu'elle fait
// tourner d'autre, une ligne chacun : son rôle, son ticket, ce qu'il fait. `cuit` : la lecture dit encore vrai et la
// station cuit — chaque ligne porte alors, à son bout, la poêle qui grésille (ticket 2984).
/** @param {import("./components/pan/pan.js").Fabrique} doc @param {readonly Cook[]} itsOwn @param {readonly Agent[]} agents @param {boolean} [cooked] */
export function linesOfCooks(doc, itsOwn, agents, cooked = false) {
  const enCooking = () => (cooked ? [pan(doc)] : []);
  const cooks = created(doc, "ul");
  cooks.className = "cooks";
  if (itsOwn.length === 0 && agents.length === 0) cooks.className = "cooks vide";
  cooks.append(
    ...agents.map((agent) => {
      const line = created(doc, "li");
      line.className = "agent";
      line.dataset.role = agent.role;
      const number = agent.ticket === null ? [] : [created(doc, "strong", `#${agent.ticket}`)];
      for (const fort of number) fort.className = "mono";
      line.append(wordOfRole(doc, agent.role), ...number, whatItDone(doc, agent), ...enCooking());
      return line;
    }),
    ...(itsOwn.length === 0 && agents.length === 0
      ? [lineEmpty(doc, NOTHING_NOT_RUNS, { classe: "", balise: "li" })]
      : itsOwn.map(({ ticket, titre: title }) => {
          const cook = created(doc, "li");
          const number = created(doc, "strong", `#${ticket}`);
          number.className = "mono";
          const said = created(doc, "span", title);
          said.title = title;
          cook.append(number, said, ...enCooking());
          return cook;
        })),
  );
  return cooks;
}

// Le plafond du projet sur une station, comme sa box le dit (`3 at most — 8 cores`) : une rangée qui se lit — le champ qui le
// change est celui de sa déclaration (project/stations/StationSettings.js), qui la remplace quand le projet la déclare
// (`declaree`).
/** @param {Fabrique} doc @param {Caps} cap @param {{ declaree: boolean }} options */
export function capRead(doc, cap, { declaree: declaredOne }) {
  const lines = declaredOne ? [] : [rowOfSetting(doc, { nom: CAP, cle: "cooks", niveau: levelOf(doc, "cooks"), valeur: [created(doc, "strong", cap.plafond.dit)], controle: [], dessous: [] })];
  return lines;
}

// Le détail de git, que la raison d'un accès bloqué porte entre parenthèses à sa fin : au survol (repository-held.js).
const DETAIL_OF_GIT = /\s*\(git: ([^)]*)\)\.?$/;

// La ligne d'alerte de l'onglet Rail, ou null : rien, du côté des cooks, ne demande un geste au chef.
// `refusee` : l'une d'elles y dit déjà un refus ;
// `acces`, `refus` : ce que la station du projet publie de l'accès au dépôt et de son refus (projets/demande.ts).
// Plusieurs causes tiennent sur la même ligne, la plus urgente d'abord : l'accès, que seul le chef lève.
// `clone` : le clone du dépôt en échec (ticket 1390) — sa cause dit plus que le refus qui l'accompagne, et le remplace.
/**
 * @param {Fabrique} doc
 * @param {{ refusee: boolean, acces: Access | null, clone?: Clone | null, refus: Refusal | null, ouvrir: () => void }} options
 */
export function lineOfAlert(doc, { refusee: refused, acces: access, clone = null, refus: refusal, ouvrir: open }) {
  const causes = [
    ...(access === null ? [] : [access.raison.replace(DETAIL_OF_GIT, "").replace(/\.$/, "")]),
    ...(access !== null || clone === null ? [] : [clone.raison.replace(/\.$/, "")]),
    ...(refusal === null || refused || clone !== null ? [] : [refusal.message.replace(/\.$/, "")]),
  ];
  if (causes.length === 0) return null;
  const pose = created(doc, "p");
  pose.className = "alerte-de-cuisine";
  pose.role = "alert";
  const said = created(doc, "span", `${causes.join(" · ")}.`);
  const link = button(doc, OPEN_COOKS, open);
  link.className = "lien";
  pose.append(said, link);
  return pose;
}
