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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { button } from "./composants/button/button.js";
import { rangeeDeSetting } from "./composants/setting/setting.js";
import { niveauDe } from "./niveaux.js";
import { lineEmpty } from "./composants/line-empty/line-empty.js";
import { pan } from "./composants/pan/pan.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../facts.ts").Cook} Cook */
/** @typedef {import("../cooking.ts").AgentDeStation} Agent */
/** @typedef {import("../projects/request.ts").AccesBlocked} Acces */
/** @typedef {import("../projects/request.ts").Refusal} Refusal */
/** @typedef {import("../projects/request.ts").FailureDuClone} Clone */
/** @typedef {import("../home.ts").CapsDeStation} Caps */

export const RIEN_NE_TOURNE = "nothing running";
// Ce que la cuisine fait tourner hors des cooks de ticket (ticket 1971) : le mot de chaque rôle sur sa carte, et ce qu'il
// est, au survol. Un rôle que l'app ne connaît pas se dit tel quel, sans survol.
/** @type {Readonly<Record<string, string>>} */
export const ROLES_EN_COURS = {
  pass: "the pass judges a delivery: its gates, its CI and the reviewer's review, then merges it or sends it back",
  manager: "the manager judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket",
  triage: "the triage takes up a card that would go to you, and settles it when it can",
  closer: "the closer cleans the project up when you ask it to, and delivers what it removes as a PR",
};
export const OUVRIR_COOKS = "open Cooks";
// Le plafond de cooks du projet sur une station (ticket 1292) : le nom de sa rangée.
export const CAP = "Cooks at once";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Ce qu'un agent fait, et depuis quand : la durée à la lecture, l'heure au survol.
/** @param {Fabrique} doc @param {Agent} agent */
function ceQuIlFait(doc, { fait, pour, depuis }) {
  const dit = cree(doc, "span", `${fait} · for ${pour}`);
  dit.className = "agent-fait";
  dit.title = `since ${depuis}`;
  return dit;
}

// Son rôle, au mot de sa carte, et ce qu'il est au survol.
/** @param {Fabrique} doc @param {string} role */
function wordDuRole(doc, role) {
  const word = cree(doc, "strong", role);
  word.className = "agent-role";
  const survol = Object.hasOwn(ROLES_EN_COURS, role) ? ROLES_EN_COURS[role] : undefined;
  if (survol !== undefined) word.title = survol;
  return word;
}

// Les cooks en cours d'une station, une ligne chacun : son ticket et son titre (l'écran étroit) — après ce qu'elle fait
// tourner d'autre, une ligne chacun : son rôle, son ticket, ce qu'il fait. `cuit` : la lecture dit encore vrai et la
// station cuit — chaque ligne porte alors, à son bout, la poêle qui grésille (ticket 2984).
/** @param {import("./composants/pan/pan.js").Fabrique} doc @param {readonly Cook[]} siens @param {readonly Agent[]} agents @param {boolean} [cuit] */
export function linesDeCooks(doc, siens, agents, cuit = false) {
  const enCooking = () => (cuit ? [pan(doc)] : []);
  const cooks = cree(doc, "ul");
  cooks.className = "cooks";
  if (siens.length === 0 && agents.length === 0) cooks.className = "cooks vide";
  cooks.append(
    ...agents.map((agent) => {
      const line = cree(doc, "li");
      line.className = "agent";
      line.dataset.role = agent.role;
      const numero = agent.ticket === null ? [] : [cree(doc, "strong", `#${agent.ticket}`)];
      for (const fort of numero) fort.className = "mono";
      line.append(wordDuRole(doc, agent.role), ...numero, ceQuIlFait(doc, agent), ...enCooking());
      return line;
    }),
    ...(siens.length === 0 && agents.length === 0
      ? [lineEmpty(doc, RIEN_NE_TOURNE, { classe: "", balise: "li" })]
      : siens.map(({ ticket, titre }) => {
          const cook = cree(doc, "li");
          const numero = cree(doc, "strong", `#${ticket}`);
          numero.className = "mono";
          const dit = cree(doc, "span", titre);
          dit.title = titre;
          cook.append(numero, dit, ...enCooking());
          return cook;
        })),
  );
  return cooks;
}

// Le plafond du projet sur une station, comme sa box le dit (`3 at most — 8 cores`) : une rangée qui se lit — le champ qui le
// change est celui de sa déclaration (project/stations/StationSettings.js), qui la remplace quand le projet la déclare
// (`declaree`).
/** @param {Fabrique} doc @param {Caps} cap @param {{ declaree: boolean }} options */
export function capLu(doc, cap, { declaree }) {
  const lines = declaree ? [] : [rangeeDeSetting(doc, { nom: CAP, cle: "cooks", niveau: niveauDe(doc, "cooks"), valeur: [cree(doc, "strong", cap.plafond.dit)], controle: [], dessous: [] })];
  return lines;
}

// Le détail de git, que la raison d'un accès bloqué porte entre parenthèses à sa fin : au survol (repository-retenu.js).
const DETAIL_DE_GIT = /\s*\(git: ([^)]*)\)\.?$/;

// La ligne d'alerte de l'onglet Rail, ou null : rien, du côté des cooks, ne demande un geste au chef.
// `refusee` : l'une d'elles y dit déjà un refus ;
// `acces`, `refus` : ce que la station du projet publie de l'accès au dépôt et de son refus (projets/demande.ts).
// Plusieurs causes tiennent sur la même ligne, la plus urgente d'abord : l'accès, que seul le chef lève.
// `clone` : le clone du dépôt en échec (ticket 1390) — sa cause dit plus que le refus qui l'accompagne, et le remplace.
/**
 * @param {Fabrique} doc
 * @param {{ refusee: boolean, acces: Acces | null, clone?: Clone | null, refus: Refusal | null, ouvrir: () => void }} options
 */
export function lineDAlert(doc, { refusee, acces, clone = null, refus: refusal, ouvrir }) {
  const causes = [
    ...(acces === null ? [] : [acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.$/, "")]),
    ...(acces !== null || clone === null ? [] : [clone.raison.replace(/\.$/, "")]),
    ...(refusal === null || refusee || clone !== null ? [] : [refusal.message.replace(/\.$/, "")]),
  ];
  if (causes.length === 0) return null;
  const pose = cree(doc, "p");
  pose.className = "alerte-de-cuisine";
  pose.role = "alert";
  const dit = cree(doc, "span", `${causes.join(" · ")}.`);
  const lien = button(doc, OUVRIR_COOKS, ouvrir);
  lien.className = "lien";
  pose.append(dit, lien);
  return pose;
}
