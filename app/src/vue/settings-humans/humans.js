// @ts-check
// Les humains du projet sous Settings (ticket 2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare
// (`humans`, ticket 2759), une rangée chacun — son login et ses rôles. Ajouter un humain par une rangée neuve, changer ses
// rôles ou le retirer s'applique au changement, sans « Save » : chaque geste part tout de suite au service. Les humains
// vivent dans le dépôt : un changement s'y écrit par une PR, et la rangée le dit — puis le lien de la PR, une fois
// ouverte. Chaque rangée est la rangée de réglage de l'app (components/setting, ticket 2920) : la ligne qui dit la PR
// (`PAR_PR`) et ce que le dernier geste a rendu (`ditDuReglage`) s'y disent comme partout ailleurs. Refusé (login inconnu, pas d'accès au dépôt), le refus se dit en une ligne sur la rangée du login concerné,
// et la rangée revient à ce qui était : elle ne dit pas le changement fait.
//
// Le service a ce contrat : `list()` rend les humains ; `save(humain)` en ajoute ou en change un ; `remove(login)` en
// retire un ; chaque écriture rend le lien de la PR, ou un refus d'une ligne. Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (bricks.js), et le conteneur où se poser.

import { buttonAction, caseATick, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { CANCEL, NOT_REACHED } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {"product" | "design" | "review" | "client-contact"} Role */
/** @typedef {{ login: string, roles: Role[] }} Human */
// Ce qu'une écriture rend : le lien de la PR ouverte, ou le refus en une ligne — son détail, s'il y en a, au survol.
/** @typedef {{ pr: string } | { refus: string, detail?: string }} Rendered */
// `list` rend `undefined` quand le pont ne porte pas les humains (un téléphone) : la section ne se pose pas ; `{ sans }` quand
// ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Human[] | { sans: string, detail?: string } | undefined>, save(human: Human): Promise<Rendered>, remove(login: string): Promise<Rendered> }} Service */
// Une rangée : le login, les rôles montrés, ceux d'avant le dernier geste — ce qui revient sur un refus —, ceux que
// projet.json déclare, si c'est une rangée neuve, le geste en cours, la PR ouverte et ce qu'elle fait, ou le refus.
/**
 * @typedef {{
 *   cle: string,
 *   login: string,
 *   roles: Role[],
 *   avant: Role[],
 *   declares: Role[],
 *   neuve: boolean,
 *   enCours?: boolean,
 *   pr?: { url: string, retrait: boolean },
 *   refus?: { ligne: string, detail: string },
 * }} Row
 */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Row[] }} State */

export const ROLES = /** @type {const} */ (["product", "design", "review", "client-contact"]);
export const TITLE = "humans";
export const WORDS = {
  aide: "The people who work on this project, with their roles. They are kept in the project's repository (.claude/brigade/projet.json): each change is proposed as a pull request, and applies once merged.",
  enCours: "writing to projet.json…",
  retrait: "removal",
  sansRole: "no role",
  pasDeclare: "not declared",
  vide: "No human is declared for this project.",
  premier: "add the first human",
  ajouter: "add a human",
  retirer: "remove",
  annuler: CANCEL,
  login: "GitHub login",
  indisponible: NOT_REACHED("humans"),
  rienEnvoye: "nothing was written: no answer from the service",
};

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le numéro d'une PR, lu dans son lien ; un lien sans numéro se dit « pull request ».
/** @param {string} url */
export function nameOfThePr(url) {
  const number = /\/pull\/(\d+)/.exec(url)?.[1];
  return number === undefined ? "pull request" : `PR #${number}`;
}

// Ce que les gestes de la rangée ont rendu, sous elle, dit comme sous toute rangée de réglage : l'écriture en route, ou
// la PR ouverte — celle du retrait se dit « removal » —, puis le refus du dernier geste. Une PR ouverte reste dite sous
// un refus qui la suit : elle est toujours ouverte.
/** @param {Fabrique} doc @param {Row} row @param {(url: string) => void} open */
function saysOfTheRow(doc, row, open) {
  /** @type {any[]} */
  const said = [];
  if (row.enCours === true) said.push(...saysOfSetting(doc, { enCours: WORDS.enCours }));
  else if (row.pr !== undefined) {
    const { url, retrait: removal } = row.pr;
    const number = /\/pull\/(\d+)/.exec(url)?.[1];
    const [line] = saysOfSetting(doc, { pr: url, numero: Number(number ?? 0), valeur: removal ? WORDS.retrait : "" }, { ouvrir: open });
    // Un lien sans numéro se dit « pull request », sans numéro deviné.
    const button = number === undefined ? line?.children?.[1]?.children?.[0] : undefined;
    if (button !== undefined) button.textContent = nameOfThePr(url);
    said.push(line);
  }
  if (row.refus !== undefined) said.push(...saysOfSetting(doc, { refus: row.refus.ligne, detail: row.refus.detail }));
  return said;
}

// Les rôles que projet.json déclare pour le login, en vigueur tant qu'aucune PR n'est mergée.
/** @param {Fabrique} doc @param {Row} row */
function inForce(doc, row) {
  if (row.neuve) return [created(doc, "small", WORDS.pasDeclare)];
  const roles = created(doc, "strong", row.declares.length === 0 ? WORDS.sansRole : row.declares.join(", "));
  roles.className = "roles";
  return [roles];
}

// Une rangée : le login — un champ, sur une rangée neuve —, les rôles en vigueur, ses rôles en cases et « remove » ;
// dessous, la ligne qui dit qu'un changement ouvre une PR, puis ce que le dernier geste a rendu.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Row, gestes: { ecrire: (row: Row, roles: Role[], login: string) => void, retirer: (row: Row) => void, annuler: (row: Row) => void, ouvrir: (url: string) => void } }} options
 */
export function setOneHuman(doc, { rangee: row, gestes: actions }) {
  const busy = row.enCours === true;
  // Une rangée dont le retrait est proposé ne se change plus : sa PR est ouverte.
  const frozen = busy || row.pr?.retrait === true;

  /** @type {any} */
  let input;
  /** @type {any} */
  let login;
  if (row.neuve && row.pr === undefined) {
    input = created(doc, "input");
    input.type = "text";
    input.className = "login mono";
    input.ariaLabel = WORDS.login;
    input.placeholder = WORDS.login;
    input.spellcheck = false;
    input.value = row.login;
    input.disabled = busy;
    // Le login s'écrit sans rien envoyer ; il part quand le champ change — Entrée, ou le focus qui s'en va.
    input.addEventListener("input", () => {
      row.login = input.value;
    });
    input.addEventListener("change", () => {
      if (input.value.trim() !== "") actions.ecrire(row, row.roles, input.value.trim());
    });
    login = input;
  } else {
    login = created(doc, "strong", row.login);
    login.className = "login mono";
  }

  /** @type {any[]} */
  const field = [];
  for (const role of ROLES) {
    const ticked = caseATick(doc, { nom: role, dit: "", cochee: row.roles.includes(role) }, (tickedOne) => {
      const roles = ROLES.filter((taken) => (taken === role ? tickedOne : row.roles.includes(taken)));
      // Une rangée neuve sans login garde ses cases : rien ne part tant qu'il n'est pas écrit.
      if (row.neuve && row.pr === undefined && row.login.trim() === "") row.roles = roles;
      else actions.ecrire(row, roles, row.login.trim());
    });
    ticked.className = "role";
    /** @type {any} */
    const caseTicked = ticked.children[0];
    if (caseTicked !== undefined) caseTicked.disabled = frozen;
    field.push(ticked);
  }
  const keepTheRow = row.neuve && row.pr === undefined;
  const action = buttonAction(doc, keepTheRow ? WORDS.annuler : WORDS.retirer, () => (keepTheRow ? actions.annuler(row) : actions.retirer(row)), { sorte: keepTheRow ? "discret" : "danger" });
  action.className = keepTheRow ? "action annuler" : "action retirer";
  /** @type {any} */
  const button = action.children[0];
  if (button !== undefined) {
    button.disabled = frozen;
    if (!keepTheRow) button.ariaLabel = `remove ${row.login}`;
  }
  field.push(action);

  const root = rowOfSetting(doc, { nom: "", valeur: inForce(doc, row), controle: field, depot: true, dessous: saysOfTheRow(doc, row, actions.ouvrir) });
  root.className = row.neuve ? "reglage humain neuf" : "reglage humain";
  root.dataset.login = row.login;
  // Le nom de la rangée est le login : écrit, ou son champ sur une rangée neuve.
  root.children[0].append(login);
  return root;
}

// La section : son titre, son aide au survol et « add a human » ; puis une rangée par humain — ou, sans aucun, la ligne
// vide et de quoi ajouter le premier. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { ajouter: () => void, ecrire: (row: Row, roles: Role[], login: string) => void, retirer: (row: Row) => void, annuler: (row: Row) => void, ouvrir: (url: string) => void } }} options
 */
export function setTheHumans(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
  const section = created(doc, "section");
  section.className = "humains-du-projet";
  section.ariaLabel = "The project's humans";
  const head = created(doc, "div");
  head.className = "tete";
  const title = created(doc, "span", TITLE);
  title.className = "nom";
  title.append(hover(doc, WORDS.aide));
  head.append(title);
  section.append(head);
  if (state.lecture === "refus") {
    section.append(lineError(doc, state.ligne, state.detail));
    return section;
  }
  if (state.rangees.length === 0) {
    const empty = created(doc, "div");
    empty.className = "aucun";
    empty.append(lineEmpty(doc, WORDS.vide, { classe: "", balise: "span" }));
    const first = buttonAction(doc, WORDS.premier, actions.ajouter, { recommande: true });
    first.className = "action ajouter";
    empty.append(first);
    section.append(empty);
    return section;
  }
  const add = buttonAction(doc, WORDS.ajouter, actions.ajouter);
  add.className = "action ajouter";
  head.append(add);
  section.append(...state.rangees.map((row) => setOneHuman(doc, { rangee: row, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'une écriture a rendu, lu : un lien de PR, ou un refus — toute autre réponse est un refus, jamais une PR devinée.
/** @param {unknown} rendered @returns {{ pr: string } | { refus: string, detail: string }} */
export function renderedRead(rendered) {
  if (typeof rendered === "object" && rendered !== null) {
    const { pr, refus: refusal, detail } = /** @type {Record<string, unknown>} */ (rendered);
    if (typeof pr === "string" && pr.trim() !== "") return { pr: pr.trim() };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...remains] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...remains, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: WORDS.rienEnvoye, detail: rendered === undefined ? "" : JSON.stringify(rendered) };
}

// L'état des humains de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page : une PR ouverte
// reste dite tant que la page vit.
/** @type {WeakMap<object, Map<string, State>>} */
const statesOfContainers = new WeakMap();
let freshOnes = 0;

// Monte la section dans son conteneur, pour un projet : lit les humains, les pose, et répond aux gestes. Le conteneur
// retient le projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} container
 * @param {{ projet: string, service: Service, ouvrir: (url: string) => void }} options
 */
export async function mountTheHumans(doc, container, { projet: project, service, ouvrir: open }) {
  container.dataset.projet = project;
  /** @type {Map<string, State>} */
  const states = statesOfContainers.get(container) ?? new Map();
  statesOfContainers.set(container, states);
  const set = () => {
    if (container.dataset.projet !== project) return;
    const pose = setTheHumans(doc, { etat: states.get(project) ?? { lecture: "en-cours" }, gestes: actions });
    container.hidden = pose === null;
    container.replaceChildren(...(pose === null ? [] : [pose]));
  };
  const rows = () => {
    const state = states.get(project);
    return state?.lecture === "lue" ? state.rangees : null;
  };

  /** @param {Row} row @param {Role[]} roles @param {string} login */
  async function write(row, roles, login) {
    if (row.enCours === true) return;
    row.login = login;
    row.roles = roles;
    row.enCours = true;
    row.refus = undefined;
    set();
    /** @type {unknown} */
    let received;
    try {
      received = await service.save({ login, roles });
    } catch (error) {
      received = { refus: WORDS.rienEnvoye, detail: message(error) };
    }
    const readOne = renderedRead(received);
    row.enCours = false;
    if ("pr" in readOne) {
      row.pr = { url: readOne.pr, retrait: false };
      row.avant = roles;
    } else {
      row.refus = { ligne: readOne.refus, detail: readOne.detail };
      // Rien n'a changé : les rôles reviennent à ce qui était.
      row.roles = row.avant;
    }
    set();
  }

  /** @param {Row} row */
  async function remove(row) {
    if (row.enCours === true) return;
    row.enCours = true;
    row.refus = undefined;
    set();
    /** @type {unknown} */
    let received;
    try {
      received = await service.remove(row.login);
    } catch (error) {
      received = { refus: WORDS.rienEnvoye, detail: message(error) };
    }
    const readOne = renderedRead(received);
    row.enCours = false;
    if ("pr" in readOne) row.pr = { url: readOne.pr, retrait: true };
    else row.refus = { ligne: readOne.refus, detail: readOne.detail };
    set();
  }

  const actions = {
    ajouter: () => {
      const list = rows();
      if (list === null) return;
      list.push({ cle: `neuve-${++freshOnes}`, login: "", roles: [], avant: [], declares: [], neuve: true });
      set();
    },
    /** @param {Row} row @param {Role[]} roles @param {string} login */
    ecrire: (row, roles, login) => void write(row, roles, login),
    /** @param {Row} row */
    retirer: (row) => void remove(row),
    /** @param {Row} row */
    annuler: (row) => {
      const list = rows();
      if (list === null) return;
      states.set(project, { lecture: "lue", rangees: list.filter((other) => other !== row) });
      set();
    },
    ouvrir: open,
  };

  // Une lecture déjà faite se pose tout de suite, avec ce que le chef y a fait ; la relecture la remplace sans perdre
  // une PR ouverte ni une rangée neuve.
  set();
  /** @type {State} */
  let readOne;
  try {
    const humans = await service.list();
    if (humans === undefined) readOne = { lecture: "sans" };
    else if (!Array.isArray(humans)) readOne = { lecture: "refus", ligne: typeof humans?.sans === "string" ? humans.sans : WORDS.indisponible, detail: humans?.detail ?? JSON.stringify(humans) };
    else {
      const before = rows() ?? [];
      const declares = humans.map((human) => {
        const roles = ROLES.filter((role) => human.roles.includes(role));
        const heldOne = before.find((row) => row.login.toLowerCase() === human.login.toLowerCase());
        // Une rangée tenue — sa PR ouverte, son geste en route — reste la même : ses gestes la tiennent. Ce que projet.json
        // déclare y est mis à jour.
        if (heldOne !== undefined && (heldOne.pr !== undefined || heldOne.enCours === true)) {
          heldOne.declares = roles;
          return heldOne;
        }
        return { cle: human.login, login: human.login, roles, avant: roles, declares: roles, neuve: false };
      });
      // Une rangée neuve écrite depuis, que le dépôt déclare maintenant, n'est plus neuve.
      const remaining = before.filter((row) => row.neuve && !declares.some((declare) => declare.login.toLowerCase() === row.login.toLowerCase()));
      readOne = { lecture: "lue", rangees: [...declares, ...remaining] };
    }
  } catch (error) {
    readOne = { lecture: "refus", ligne: WORDS.indisponible, detail: message(error) };
  }
  states.set(project, readOne);
  set();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la
// section ne se pose pas — et une écriture le dit en refus.
/**
 * @param {Partial<Pick<import("../bridge.d.ts").Bridge, "listerLesHumains" | "enregistrerUnHumain" | "retirerUnHumain">>} bridge
 * @param {string} project
 * @returns {Service}
 */
export function serviceOfBridge(bridge, project) {
  return {
    list: async () => (typeof bridge.listerLesHumains === "function" ? bridge.listerLesHumains(project) : undefined),
    save: async (human) => (typeof bridge.enregistrerUnHumain === "function" ? bridge.enregistrerUnHumain(project, human) : { refus: WORDS.rienEnvoye }),
    remove: async (login) => (typeof bridge.retirerUnHumain === "function" ? bridge.retirerUnHumain(project, login) : { refus: WORDS.rienEnvoye }),
  };
}
