// @ts-check
// L'onglet Agents de la vue d'un projet (ticket 4224, épique 4117), à côté de Rail, Stations et Settings : une carte par
// agent que le runtime publie. Chaque carte dit son nom, son rôle en une phrase, son état — idle, working on #N, broken —,
// sa prochaine passe, et ses chiffres des 7 derniers jours, chacun avec ce qu'il veut dire à côté. Ses réglages sont sur la
// même carte : une rangée de réglage chacun (components/setting) — un champ pour un réglage modifiable, qui s'applique dès
// qu'il change, sans « save » ; pour un autre, où il se change (`livesIn`), sans champ. Un changement dit, sous sa rangée,
// quand il a été fait et par qui ; un refus dit sa raison, et la valeur en vigueur reste. Un clic sur le nom d'un agent
// ouvre ses derniers gestes, chacun avec sa raison ; un nouveau clic les referme.
// Les données passent par agents/source.js, et par lui seul. Une lecture qui échoue, ou qui ne se lit pas, se dit en une
// ligne, son détail au survol ; rien ne s'invente à sa place.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hourUtc } from "../activity-of-cook.js";
import { button } from "../components/button/button.js";
import { toggleSwitch } from "../components/switch/switch.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { RECORDING, READING, READ_OF, NOT_REACHED, NOT_STILL } from "../lexicon.js";
import { source } from "./source.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Field} Field */
/** @typedef {import("./source.js").Action} Action */
/** @typedef {{ ligne: string, detail: string }} Failure */

const TITLE = "The agents";
const NO_AGENT = NOT_STILL("agent");
const SEVEN_DAYS = "Last 7 days";
const NEXT = "next run:";
const ITS_SETTINGS = "Settings";
const ITS_ACTIONS = "Last gestures";
const NO_ACTION = NOT_STILL("gesture");
const WHY = "why:";
const ONE_NUMBER = "a number is expected";
/** @param {string} what */
const UNREADABLE = (what) => `${what} is not readable`;
// Les niveaux d'autonomie (spec 2026-11-23-autonomy-trust-control.md, C4), dans l'ordre où l'agent gagne la confiance du chef.
const LEVELS = ["observe", "propose", "act"];

/** @param {any} oneOf */
const isOneFigure = (oneOf) => typeof oneOf?.label === "string" && typeof oneOf.value === "string" && typeof oneOf.meaning === "string";
// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((oneOf: any) => boolean)[]} */
const AGENT = [
  (oneOf) => typeof oneOf?.id === "string",
  (oneOf) => typeof oneOf.name === "string",
  (oneOf) => typeof oneOf.role === "string",
  (oneOf) => ["idle", "working", "broken"].includes(oneOf.state),
  (oneOf) => typeof oneOf.nextRun === "string",
  (oneOf) => Array.isArray(oneOf.figures) && oneOf.figures.every(isOneFigure),
];
/** @type {((oneOf: any) => boolean)[]} */
const FIELD = [
  (oneOf) => typeof oneOf?.key === "string",
  (oneOf) => typeof oneOf.label === "string",
  (oneOf) => typeof oneOf.editable === "boolean",
];
/** @type {((oneOf: any) => boolean)[]} */
const ACTION = [
  (oneOf) => typeof oneOf?.at === "string",
  (oneOf) => typeof oneOf.summary === "string",
  (oneOf) => typeof oneOf.reason === "string",
];
/** @param {unknown} readOnes @param {((oneOf: any) => boolean)[]} shape */
const listOf = (readOnes, shape) => Array.isArray(readOnes) && readOnes.every((oneOf) => shape.every((door) => door(oneOf)));

/** @param {Error | unknown} error */
const detailOf = (error) => (error instanceof Error ? error.message : String(error));
/** @param {string} iso */
const when = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${hourUtc(iso)}`);
// L'état d'un agent, en mots : idle, working on #N — son issue —, broken.
/** @param {Agent} agent */
export const stateSays = (agent) => (agent.state === "working" && typeof agent.workingOn === "number" ? `working on #${agent.workingOn}` : agent.state);
// Ce qu'une rangée dit de son dernier changement : quand, et par qui.
/** @param {Field} champ */
export const changeSays = ({ changedAt, changedBy }) => [`changed`, ...(changedAt === null ? [] : [when(changedAt)]), ...(changedBy === null ? [] : [`by ${changedBy}`])].join(" ");

// L'onglet, posé dans `element`. `lire(projet)` relit les agents ; `montrer(projet)` les relit seulement pour un autre projet
// que celui lu. `valeurs()` : les modèles et les efforts que l'app connaît, pour les listes de ces deux réglages.
/** @param {Fabrique} doc @param {{ valeurs?: () => { modeles: readonly string[], efforts: readonly string[] } }} [options] */
export function holdTheAgents(doc, { valeurs: values = () => ({ modeles: [], efforts: [] }) } = {}) {
  const element = doc.createElement("section");
  element.className = "agents";
  element.ariaLabel = TITLE;
  // Le projet dont l'onglet montre les agents : sa box répond (source.js).
  /** @type {string | undefined} */
  let project;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {Failure | null} */
  let failure = null;
  let request = 0;
  // Les réglages de chaque agent : lus, ou l'échec de leur lecture ; rien tant qu'ils sont en route.
  /** @type {Map<string, Field[] | Failure>} */
  const settings = new Map();
  // Ce que le dernier changement de chaque réglage a rendu (`<agent> <clé>`) : en route, ou son refus.
  /** @type {Map<string, import("../components/setting/setting.js").Says>} */
  const saidOnes = new Map();
  // La valeur que chaque changement en route envoie : son champ la montre jusqu'à la réponse.
  /** @type {Map<string, unknown>} */
  const sent = new Map();
  // L'agent dont les gestes sont ouverts, et ce que leur lecture a rendu.
  /** @type {string | null} */
  let opened = null;
  /** @type {Action[] | Failure | null} */
  let actions = null;

  /** @param {string} name */
  const read = (name) => {
    project = name;
    opened = null;
    actions = null;
    const the = ++request;
    void Promise.resolve()
      .then(() => source.lire(name))
      .then(
        (readOnes) => {
          if (the !== request) return;
          if (listOf(readOnes, AGENT)) [agents, failure] = [/** @type {Agent[]} */ (readOnes), null];
          else [agents, failure] = [null, { ligne: UNREADABLE("The agents' reading"), detail: JSON.stringify(readOnes ?? null).slice(0, 400) }];
          settings.clear();
          saidOnes.clear();
          render();
          for (const agent of agents ?? []) readTheSettings(agent.id, the);
        },
        (/** @type {unknown} */ error) => {
          if (the !== request) return;
          [agents, failure] = [null, { ligne: NOT_REACHED("the agents"), detail: detailOf(error) }];
          render();
        },
      );
  };

  /** @param {string} id @param {number} the */
  const readTheSettings = (id, the) => {
    void Promise.resolve()
      .then(() => source.reglages(String(project), id))
      .then(
        (readOnes) => {
          const fields = /** @type {{ fields?: unknown } | null | undefined} */ (readOnes)?.fields;
          settings.set(id, listOf(fields, FIELD) ? /** @type {Field[]} */ (fields) : { ligne: UNREADABLE("Its settings' reading"), detail: JSON.stringify(readOnes ?? null).slice(0, 400) });
        },
        (/** @type {unknown} */ error) => void settings.set(id, { ligne: NOT_REACHED("its settings"), detail: detailOf(error) }),
      )
      .then(() => {
        if (the === request) render();
      });
  };

  /** @param {string} name */
  const show = (name) => {
    if (name !== project) read(name);
  };

  const render = () => {
    if (failure !== null) return void element.replaceChildren(lineError(doc, failure.ligne, failure.detail));
    if (agents === null) return void element.replaceChildren(lineEmpty(doc, READ_OF("the agents")));
    if (agents.length === 0) return void element.replaceChildren(lineEmpty(doc, NO_AGENT));
    element.replaceChildren(...agents.map(card));
  };

  /** @param {Agent} agent */
  const card = (agent) => {
    const pose = doc.createElement("article");
    pose.className = `agent-carte ${agent.state}`;
    pose.dataset.etat = agent.state;
    pose.ariaLabel = agent.name;
    const head = doc.createElement("header");
    head.className = "tete";
    const name = button(doc, agent.name, () => toggle(agent.id), { sorte: "discret" });
    name.className = `${name.className} nom`;
    name.ariaExpanded = String(opened === agent.id);
    head.append(name, text("span", "etat", stateSays(agent)));
    pose.append(head, text("p", "role", agent.role), text("p", "prochaine", `${NEXT} ${agent.nextRun}`), figures(agent));
    pose.append(itsSettings(agent));
    if (opened === agent.id) pose.append(itsActions());
    return pose;
  };

  /** @param {Agent} agent */
  const figures = (agent) => {
    const pose = doc.createElement("section");
    pose.className = "chiffres";
    pose.append(text("h4", "", SEVEN_DAYS));
    const list = doc.createElement("ul");
    for (const { label, value, meaning } of agent.figures) {
      const line = doc.createElement("li");
      // Le libellé et son sens, nus dans la ligne de leur valeur : rien ne les sépare d'elle.
      line.append(text("strong", "valeur", value), `${label} — ${meaning}`);
      list.append(line);
    }
    pose.append(list);
    return pose;
  };

  /** @param {Agent} agent */
  const itsSettings = (agent) => {
    const pose = doc.createElement("section");
    pose.className = "reglages";
    pose.append(text("h4", "", ITS_SETTINGS));
    const readOnes = settings.get(agent.id);
    if (readOnes === undefined) pose.append(lineEmpty(doc, READING));
    else if (!Array.isArray(readOnes)) pose.append(lineError(doc, readOnes.ligne, readOnes.detail));
    else if (readOnes.length === 0) pose.append(lineEmpty(doc, NOT_STILL("setting")));
    else pose.append(...readOnes.map((field) => row(agent, field)));
    return pose;
  };

  /** @param {Agent} agent @param {Field} field */
  const row = (agent, field) => {
    const said = saidOnes.get(`${agent.id} ${field.key}`);
    const value = [text("strong", "mono", String(field.value ?? "")), text("small", "source", field.source ?? "")];
    const change = field.changedAt === null && field.changedBy === null ? [] : [text("p", "change", changeSays(field))];
    // Sans contrôle, la rangée dit où il se change, sous son nom.
    if (!field.editable) return rowOfSetting(doc, { nom: field.label, cle: field.key, niveau: text("small", "vit", field.livesIn ?? ""), valeur: value, dessous: change, classe: "fige" });
    const enRoute = said !== undefined && "enCours" in said;
    return rowOfSetting(doc, { nom: field.label, cle: field.key, valeur: value, controle: [control(agent, field, enRoute)], dessous: [...change, ...saysOfSetting(doc, said)] });
  };

  // Le contrôle d'un réglage : une glissière pour un oui / non (la pause), une liste pour le modèle, l'effort et le niveau
  // d'autonomie, un champ de nombre pour une limite, un champ de texte sinon.
  /** @param {Agent} agent @param {Field} field @param {boolean} enRoute */
  const control = (agent, field, enRoute) => {
    if (field.kind === "boolean") return toggleSwitch(doc, { texte: field.value === true ? "on" : "off", allume: field.value === true, libelle: field.label, actif: !enRoute }, (lit) => change(agent, field, lit));
    const list = { model: values().modeles, effort: values().efforts, autonomy: LEVELS }[field.key];
    const entry = doc.createElement(list === undefined ? "input" : "select");
    if (list !== undefined) {
      for (const choice of new Set([...list, String(field.value ?? "")])) {
        const option = text("option", "", choice);
        option.value = choice;
        entry.append(option);
      }
    } else entry.type = field.kind === "number" ? "number" : "text";
    entry.ariaLabel = field.label;
    entry.value = String((enRoute ? sent.get(`${agent.id} ${field.key}`) : field.value) ?? "");
    entry.disabled = enRoute;
    entry.addEventListener("change", () => {
      if (field.kind !== "number") return change(agent, field, entry.value);
      const count = Number(entry.value);
      if (entry.value.trim() === "" || !Number.isFinite(count)) {
        saidOnes.set(`${agent.id} ${field.key}`, { refus: ONE_NUMBER });
        return render();
      }
      change(agent, field, count);
    });
    return entry;
  };

  /** @param {Agent} agent @param {Field} field @param {unknown} value */
  const change = (agent, field, value) => {
    const key = `${agent.id} ${field.key}`;
    const the = request;
    saidOnes.set(key, { enCours: RECORDING });
    sent.set(key, value);
    render();
    void Promise.resolve()
      .then(() => source.changer(String(project), agent.id, field.key, value))
      .then(
        (rendered) => {
          saidOnes.delete(key);
          const readOnes = settings.get(agent.id);
          if (listOf([rendered], FIELD) && Array.isArray(readOnes)) settings.set(agent.id, readOnes.map((oneOf) => (oneOf.key === field.key ? /** @type {Field} */ (rendered) : oneOf)));
          else readTheSettings(agent.id, the);
        },
        (/** @type {unknown} */ error) => void saidOnes.set(key, { refus: detailOf(error) }),
      )
      .then(() => {
        if (the === request) render();
      });
  };

  /** @param {string} id */
  const toggle = (id) => {
    opened = opened === id ? null : id;
    actions = null;
    render();
    if (opened === null) return;
    void Promise.resolve()
      .then(() => source.gestes(String(project), id))
      .then(
        (readOnes) => void (actions = listOf(readOnes, ACTION) ? /** @type {Action[]} */ (readOnes) : { ligne: UNREADABLE("Its gestures' reading"), detail: JSON.stringify(readOnes ?? null).slice(0, 400) }),
        (/** @type {unknown} */ error) => void (actions = { ligne: NOT_REACHED("its gestures"), detail: detailOf(error) }),
      )
      .then(() => {
        if (opened === id) render();
      });
  };

  const itsActions = () => {
    const pose = doc.createElement("section");
    pose.className = "gestes";
    pose.append(text("h4", "", ITS_ACTIONS));
    if (actions === null) pose.append(lineEmpty(doc, READING));
    else if (!Array.isArray(actions)) pose.append(lineError(doc, actions.ligne, actions.detail));
    else if (actions.length === 0) pose.append(lineEmpty(doc, NO_ACTION));
    else {
      const list = doc.createElement("ol");
      for (const { at, summary, reason, issue } of actions) {
        const line = doc.createElement("li");
        line.append(text("span", "quoi", `${summary} — ${WHY} ${reason}`), text("small", "quand", [when(at), ...(typeof issue === "number" ? [`#${issue}`] : [])].join(" · ")));
        list.append(line);
      }
      pose.append(list);
    }
    return pose;
  };

  /** @param {string} balise @param {string} classe @param {string} said */
  const text = (balise, classe, said) => {
    const pose = doc.createElement(balise);
    if (classe !== "") pose.className = classe;
    pose.textContent = said;
    return pose;
  };

  render();
  return { element, lire: read, montrer: show };
}
