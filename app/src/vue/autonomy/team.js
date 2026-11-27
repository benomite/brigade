// @ts-check
// L'équipe d'un projet (ticket 4029, épique 4024, spec 2026-11-23-autonomy-trust-control.md, C1, C2, C4) : en tête de la
// vue du projet, un badge par agent — supervisor et closer d'abord, puis manager, pass et chaque cook, dans la même
// forme. Chaque badge tient sur une ligne (ticket 4354) : son nom, un point d'état — au travail, au repos, cassé — et
// l'état en deux ou trois mots, et combien de ses gestes attendent l'OK du chef. Un clic ouvre son fil sous la rangée :
// son dernier geste et quand, sa prochaine passe telle que le runtime la dit, ses derniers gestes, une ligne chacun avec
// sa raison et son issue, ses deux compteurs, son niveau d'autonomie — observe, propose, act — que le chef change d'un
// clic, et les gestes qui attendent son OK, un bouton chacun. Un nouveau clic sur le badge le referme.
// Les données passent par autonomy/source.js, et par lui seul : la vue n'appelle que `source.lire`, `source.regler` et
// `source.approuver`. Une lecture qui ne rend rien ne pose aucune équipe ; une lecture qui échoue, ou qui ne se lit pas,
// se dit en une ligne, son détail au survol ; un geste qui échoue aussi, et rien ne change à l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hourUtc } from "../activity-of-cook.js";
import { button } from "../components/button/button.js";
import { brand } from "../components/pill/pill.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { NOT_REACHED, NOT_STILL } from "../lexicon.js";
import { source } from "./source.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Level} Level */

// Les trois niveaux, dans l'ordre où l'agent gagne la confiance du chef, et ce que chacun veut dire (spec, C4), au survol.
/** @type {readonly Level[]} */
const LEVELS = ["observe", "propose", "act"];
const MEANING = { observe: "It says what it would do.", propose: "It waits for your OK, in one click.", act: "It does it, then says so." };
// Supervisor et closer d'abord, puis manager et pass ; les cooks ensuite, dans l'ordre où le runtime les publie.
const IN_HEAD = ["supervisor", "closer", "manager", "pass"];

const TITLE = "The agents";
const UNAVAILABLE = NOT_REACHED("the agents");
const UNREADABLE = "the agents' reading is not readable";
const LEVEL = "autonomy";
const WITHOUT_COUNTER = "—";
const PINNED = "level pinned";
const BY_IT = "fixed by itself";
const AT_CHEF = "handed to the chef";
const QUEUED = "awaits your OK";
const NO_ACTION = NOT_STILL("gesture");
const OK = "OK";
/** @param {string} agent */
const LEVEL_NOT_CHANGE = (agent) => `${agent}'s level was not changed`;
/** @param {string} agent */
const NOT_APPROVED = (agent) => `${agent}'s gesture was not approved`;

// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((oneOf: any) => boolean)[]} */
const SHAPE = [
  (oneOf) => typeof oneOf?.agent === "string",
  (oneOf) => typeof oneOf.state === "string",
  (oneOf) => typeof oneOf.lastGesture?.line === "string",
  (oneOf) => typeof oneOf.lastGesture.at === "string",
  (oneOf) => typeof oneOf.nextRun?.text === "string",
  (oneOf) => LEVELS.includes(oneOf.autonomy),
  (oneOf) => typeof oneOf.counters?.fixedBySelf === "number",
  (oneOf) => typeof oneOf.counters.handedToChef === "number",
  (oneOf) => Array.isArray(oneOf.gestures),
  (oneOf) => Array.isArray(oneOf.pending),
];
/** @param {unknown} readOnes @returns {readOnes is Agent[]} */
const itselfLit = (readOnes) => Array.isArray(readOnes) && readOnes.every((oneOf) => SHAPE.every((door) => door(oneOf)));

/** @param {Agent[]} agents */
const inTheOrder = (agents) => {
  const rank = (/** @type {Agent} */ oneOf) => (IN_HEAD.includes(oneOf.agent) ? IN_HEAD.indexOf(oneOf.agent) : IN_HEAD.length);
  return [...agents].sort((a, b) => rank(a) - rank(b));
};

/** @param {Error | unknown} error */
const detailOf = (error) => (error instanceof Error ? error.message : String(error));

// L'équipe posée dans `cadre`, la section en tête de la vue du projet. `lire(projet)` la relit — à l'ouverture du
// projet, à chaque lecture de son rail ; `montrer(projet)` la montre pour le projet affiché, et la cache pour tout autre.
// La bande du haut de la vue (cuisine/, ticket 4238) lit un agent de l'équipe lue (`agent`) et ouvre son fil (`ouvrirLeFil`) ;
// `apresLecture(projet)` est appelé quand une lecture change ce que l'équipe dit ; `ouvrirLesAgents()`, au clic d'un badge qui ouvre
// son fil, ouvre aussi l'onglet Agents de la vue du projet (ticket 4224).
/** @param {Fabrique} doc @param {any} frame @param {(project: string) => void} [afterRead] @param {() => void} [openTheAgents] */
export function holdTheTeam(doc, frame, afterRead, openTheAgents) {
  const element = doc.createElement("div");
  element.className = "equipe";
  element.ariaLabel = TITLE;
  frame.replaceChildren(element);
  frame.hidden = true;
  /** @type {string | undefined} */
  let project;
  /** @type {string | undefined} */
  let shows;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {{ ligne: string, detail: string } | null} */
  let failure = null;
  /** @type {string | null} */
  let opened = null;
  let request = 0;
  // Les gestes partis, que le chef ne peut pas refaire tant qu'ils n'ont pas répondu ; et ceux qui ont échoué, par agent.
  /** @type {Set<string>} */
  const gone = new Set();
  /** @type {Map<string, { ligne: string, detail: string }>} */
  const rates = new Map();

  /** @param {string} name */
  const read = (name) => {
    if (name !== project) {
      project = name;
      agents = null;
      failure = null;
      opened = null;
      rates.clear();
    }
    const the = ++request;
    void Promise.resolve()
      .then(() => source.lire(name))
      .then(
        (readOnes) => {
          if (the !== request) return;
          const before = JSON.stringify(agents);
          if (readOnes === null) [agents, failure] = [null, null];
          else if (itselfLit(readOnes)) [agents, failure] = [readOnes, null];
          else [agents, failure] = [null, { ligne: UNREADABLE, detail: JSON.stringify(readOnes).slice(0, 400) }];
          render();
          if (JSON.stringify(agents) !== before) afterRead?.(name);
        },
        (/** @type {unknown} */ error) => {
          if (the !== request) return;
          [agents, failure] = [null, { ligne: UNAVAILABLE, detail: detailOf(error) }];
          render();
        },
      );
  };

  /** @param {string | undefined} name */
  const show = (name) => {
    shows = name;
    render();
  };

  const render = () => {
    frame.hidden = shows === undefined || shows !== project || (agents === null && failure === null);
    if (failure !== null) return void element.replaceChildren(lineError(doc, failure.ligne, failure.detail));
    if (agents === null) return void element.replaceChildren();
    const row = doc.createElement("div");
    row.className = "badges";
    row.role = "group";
    row.ariaLabel = TITLE;
    const inOrder = inTheOrder(agents);
    row.append(...inOrder.map(badge));
    const it = inOrder.find((oneOf) => oneOf.agent === opened);
    element.replaceChildren(row, ...(it === undefined ? [] : [thread(it)]));
  };

  /** @param {Agent} agent */
  const badge = (agent) => {
    const created = doc.createElement("button");
    created.type = "button";
    created.className = agent.agent === opened ? "badge ouvert" : "badge";
    created.dataset.agent = agent.agent;
    created.dataset.etat = agent.state.startsWith("broken") ? "casse" : "";
    created.ariaExpanded = String(agent.agent === opened);
    // Son dernier geste et sa prochaine passe (ticket 4029, critère 2) : au survol, pas en texte — le badge tient sur une ligne (ticket 4354).
    created.title = `${agent.lastGesture.line} · ${hourUtc(agent.lastGesture.at)} — ${agent.nextRun.text}`;
    // Le point : cassé en rouge, au repos en gris, au travail en bleu. L'état trop long pour le badge y est coupé : entier au survol.
    const your = created.dataset.etat === "casse" ? "rouge" : agent.state === "idle" ? "gris" : "bleu";
    created.append(brand(doc, your), text("nom", agent.agent), Object.assign(text("etat", agent.state), { title: agent.state }));
    if (agent.pending.length > 0) created.append(text("attente", `${agent.pending.length} ${QUEUED}`));
    created.addEventListener("click", () => {
      opened = opened === agent.agent ? null : agent.agent;
      render();
      if (opened !== null) openTheAgents?.();
    });
    return created;
  };

  /** @param {Agent} agent */
  const thread = (agent) => {
    const frameOfThread = doc.createElement("section");
    frameOfThread.className = "fil";
    frameOfThread.ariaLabel = `${agent.agent}'s thread`;
    const head = doc.createElement("div");
    head.className = "tete";
    const title = doc.createElement("h3");
    title.textContent = agent.agent;
    const counters = doc.createElement("p");
    counters.className = "compteurs";
    counters.textContent = `${BY_IT} ${agent.counters.fixedBySelf} · ${AT_CHEF} ${agent.counters.handedToChef}`;
    head.append(title, text("geste", `${agent.lastGesture.line} · ${hourUtc(agent.lastGesture.at)}`), text("prochaine", agent.nextRun.text), counters, levels(agent));
    // Le compteur vers le prochain niveau, tel que le runtime le dit : `null` à act, rien tant qu'il ne le dit pas.
    if (agent.progress !== undefined) {
      const to = agent.progress === null ? WITHOUT_COUNTER : `${agent.progress.done} of ${agent.progress.of} toward ${agent.progress.toward}`;
      head.append(text("progression", to));
    }
    if (agent.pinned === true) head.append(text("epingle", PINNED));
    frameOfThread.append(head);
    const rate = rates.get(agent.agent);
    if (rate !== undefined) frameOfThread.append(lineError(doc, rate.ligne, rate.detail, { alerte: true }));
    if (agent.pending.length > 0) frameOfThread.append(wait(agent));
    if (agent.gestures.length === 0) frameOfThread.append(lineEmpty(doc, NO_ACTION));
    else {
      const list = doc.createElement("ul");
      list.className = "derniers-gestes";
      for (const action of agent.gestures) {
        const line = doc.createElement("li");
        line.textContent = `${hourUtc(action.at)} · ${action.line} (${action.reason}): ${action.outcome}`;
        list.append(line);
      }
      frameOfThread.append(list);
    }
    return frameOfThread;
  };

  /** @param {Agent} agent */
  const levels = (agent) => {
    const group = doc.createElement("div");
    group.className = "niveaux";
    group.role = "group";
    group.ariaLabel = `${agent.agent}'s ${LEVEL}`;
    group.append(text("nom", LEVEL));
    for (const level of LEVELS) {
      const choice = button(doc, level, () => set(agent, level), { sorte: "discret" });
      choice.ariaPressed = String(level === agent.autonomy);
      choice.title = MEANING[level];
      choice.disabled = gone.has(`${agent.agent} niveau`);
      group.append(choice);
    }
    return group;
  };

  /** @param {Agent} agent @param {Level} level */
  const set = (agent, level) => {
    const key = `${agent.agent} niveau`;
    if (level === agent.autonomy || gone.has(key)) return;
    gone.add(key);
    rates.delete(agent.agent);
    render();
    void Promise.resolve()
      .then(() => source.regler(agent.agent, level, project ?? ""))
      .then(
        () => void (agent.autonomy = level),
        (/** @type {unknown} */ error) => void rates.set(agent.agent, { ligne: LEVEL_NOT_CHANGE(agent.agent), detail: detailOf(error) }),
      )
      .then(() => {
        gone.delete(key);
        render();
      });
  };

  /** @param {Agent} agent */
  const wait = (agent) => {
    const list = doc.createElement("ul");
    list.className = "en-attente";
    list.ariaLabel = `${agent.agent}: ${QUEUED}`;
    for (const action of agent.pending) {
      const line = doc.createElement("li");
      const ok = button(doc, OK, () => approve(agent, action.id), { sorte: "recommande" });
      ok.disabled = gone.has(`${agent.agent} ${action.id}`);
      line.append(text("ligne", action.line), ok);
      list.append(line);
    }
    return list;
  };

  /** @param {Agent} agent @param {string} id */
  const approve = (agent, id) => {
    const key = `${agent.agent} ${id}`;
    if (gone.has(key)) return;
    gone.add(key);
    rates.delete(agent.agent);
    render();
    void Promise.resolve()
      .then(() => source.approuver(agent.agent, id, project ?? ""))
      .then(
        () => void (agent.pending = agent.pending.filter((action) => action.id !== id)),
        (/** @type {unknown} */ error) => void rates.set(agent.agent, { ligne: NOT_APPROVED(agent.agent), detail: detailOf(error) }),
      )
      .then(() => {
        gone.delete(key);
        render();
      });
  };

  /** @param {string} classe @param {string} said */
  const text = (classe, said) => {
    const pose = doc.createElement("span");
    pose.className = classe;
    pose.textContent = said;
    return pose;
  };

  // L'agent `nom` de l'équipe lue du projet `nom de projet`, ou rien : une autre équipe, ou pas encore lue, ne répond pas.
  /** @param {string} ofProject @param {string} name @returns {Agent | undefined} */
  const agent = (ofProject, name) => (ofProject === project ? agents?.find((oneOf) => oneOf.agent === name) : undefined);
  /** @param {string} name */
  const openTheThread = (name) => {
    opened = name;
    render();
  };

  return { element, lire: read, montrer: show, agent, ouvrirLeFil: openTheThread };
}
