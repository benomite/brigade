// @ts-check
// Le closer, sur Kitchen > Health (ticket 2491, épique 2484) : ce qu'il a fait — ses passes, et où en est chacune ; les
// lignes qu'elles ont retirées n'y sont plus, l'onglet Agents dit ses chiffres (ticket 4224) —,
// ce qu'il vérifie en premier sur ce projet, ce que le chef lui demande de vérifier en plus, et ses réglages — son
// calibrage, sa condition de départ, ses plafonds. Tout vient du dépôt du projet, sur GitHub (closer-health.ts) : une
// passe est une issue de fermeture, ce qu'elle a retiré est sa PR mergée ; ce qu'il vérifie en premier, ce que la
// dernière passe lui a remis ; ses vérifications en plus, `.claude/brigade/closer-checks.md` ; ses réglages, `closer.*`
// de `.claude/brigade/projet.json`. Chaque réglage est une rangée de réglage (components/setting, ticket 2920) — un
// réglage chiffré, celle d'un plafond de durée (DurationCaps.js) : son nom, sa valeur en vigueur et d'où elle vient, un
// contrôle qui s'applique dès qu'il change, sans « save » ; gardé dans le dépôt, il s'y propose par une pull request, et
// sa rangée le dit. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { buttonAction, folded, hover } from "../../bricks.js";
import { lineError } from "../../components/line-error/line-error.js";
import { saysOfCap, IN_PROGRESS, setOneCap } from "./DurationCaps.js";
import { saysOfSetting, PAR_PR, rowOfSetting } from "../../components/setting/setting.js";
import { button as buttonOfTheFamily } from "../../components/button/button.js";
import { lineEmpty } from "../../components/line-empty/line-empty.js";
import { PR_OF_TICKET } from "../../pr-of-ticket.js";
import { NOT_STILL, PASS_OF_CLOSING, READ_OF, READING } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../closer-health.ts").ReadOfCloser} Reading */
/** @typedef {import("../../../closer-health.ts").PassRead} Pass */
/** @typedef {import("../../../closer-health.ts").SettingRead} Setting */
/** @typedef {import("../../../closer-health.ts").Calibration} Calibration */
/** @typedef {import("./DurationCaps.js").State} State */
// Ce que le chef tape dans le champ d'une vérification, l'écriture en cours, ce qu'elle a rendu.
// La PR ouverte dit la vérification qu'elle ajoute ou retire.
/** @typedef {{ pr: string, numero: number, geste: "ajouter" | "retirer", verification: string } | { fait: string } | { refus: string, detail?: string }} SaysOfVerifications */
/** @typedef {{ saisie?: string, enCours?: string, dit?: SaysOfVerifications }} StateOfVerifications */

export const TITLE = "Closer";
export const HELP =
  "The closer prunes what the project no longer needs — dead code, duplicates. After 20 merges since its last pass, at most once a day, a station opens a closing issue; a cook cooks it and the pass merges its PR.";
export const DONE = "What it did";
export const EN_FIRST = "What it checks first";
export const EXTRA = "Extra checks";
export const SETTINGS = "Settings";
export const SETTINGS_HELP =
  "Kept in the project's repository (.claude/brigade/projet.json): a change here opens a pull request on its integration branch, and the station applies it once merged, at its next fetch. Empty, the setting's removal is proposed.";
export const WITHOUT_PASS = NOT_STILL(PASS_OF_CLOSING);
export const WITHOUT_PASS_WHY = "A station opens one once the closer is calibrated and 20 merges reached the integration branch since the last pass.";
export const ITS_VERIFICATIONS = "At each pass: the dead code and the duplicates of the base, the drift of the latest merges, and the ticket times.";
export const EXTRA_HELP =
  "Kept in the project's repository (.claude/brigade/closer-checks.md): adding or removing one here opens a pull request on its integration branch, and the list changes once merged. The runtime does not copy them into a pass's issue yet: they wait in the repository until it does.";
export const ADD = { libelle: "add", enCours: "adding…", survol: "opens a pull request that adds it to .claude/brigade/closer-checks.md, towards the project's integration branch, on GitHub", invite: "e.g. unused CSS classes in app/src/vue/vue.css" };
export const REMOVE = { libelle: "remove", enCours: "removing…" };
export const NOT_ON_GITHUB = "not read on GitHub yet";
export const NOT_ON_GITHUB_WHY = "The closer on GitHub reads only its calibration and its removed lines cap: this setting is kept in the repository, and applies once the runtime reads it there.";
export const DEPARTURE = "The pass leaves when fewer cooks than this are in flight: 1, when none is.";
export const CHOOSE_MODEL = "model…";
export const CHOOSE_EFFORT = "effort…";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}
const count = (/** @type {number} */ n) => n.toLocaleString("en-US");
const s = (/** @type {number} */ n) => (n > 1 ? "s" : "");
/** @param {string} iso */
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Un lien vers GitHub : un bouton qui l'ouvre dans le navigateur du poste, l'adresse au survol.
/** @param {Fabrique} doc @param {string} text @param {string} url @param {(url: string) => void} open */
function link(doc, text, url, open) {
  if (!/^https:\/\//.test(url)) {
    const without = created(doc, "span", text);
    without.className = "mono";
    return without;
  }
  const button = buttonOfTheFamily(doc, text, () => open(url), { sorte: "discret" });
  button.className = "lien mono";
  button.title = `open ${url} in your browser`;
  return button;
}

/** @param {Fabrique} doc @param {string} title @param {string} [help] */
function part(doc, title, help) {
  const pose = created(doc, "div");
  pose.className = "closer-partie";
  const head = created(doc, "h4", title);
  if (help !== undefined) head.append(hover(doc, help));
  pose.append(head);
  return pose;
}

// --- Ce qu'il a fait -----------------------------------------------------------------

// Où en est une passe, en une ligne : sa PR mergée — ses chiffres sont dans l'onglet Agents (ticket 4224) — ; rien de
// retiré, sinon — et pourquoi, en mots.
/** @param {Pass} pass */
export function whatItARemoved(pass) {
  const { pr } = pass;
  if (pr?.mergee === true) return { retire: true, dit: "its PR merged", precise: "" };
  if (pass.ouverte) return { retire: false, dit: pr === null ? "in progress — not cooked yet" : "in progress — its PR is in the pass", precise: "" };
  return { retire: false, dit: "nothing removed", precise: pr === null ? "closed with no PR" : "its PR was closed without a merge" };
}

/** @param {Fabrique} doc @param {Pass} pass @param {(url: string) => void} open */
function lineOfPass(doc, pass, open) {
  const row = created(doc, "div");
  row.className = "passe";
  row.dataset.passe = String(pass.numero);
  const who = created(doc, "p");
  who.className = "qui";
  who.append(link(doc, `#${pass.numero}`, pass.url, open), created(doc, "small", day(pass.ouverteLe)));
  const removed = whatItARemoved(pass);
  const what = removed.retire ? created(doc, "p") : lineEmpty(doc, "", { classe: "retire sans" });
  if (removed.retire) what.className = "retire";
  const said = created(doc, "strong", removed.dit);
  if (removed.retire) said.className = "mono";
  what.append(said);
  if (removed.precise !== "") what.append(created(doc, "small", removed.precise));
  const on = created(doc, "p");
  on.className = "sur";
  const total = pass.candidats.length + pass.restants;
  on.append(created(doc, "small", total === 0 ? "no candidate" : `${total} candidate${s(total)}`));
  if (pass.pr !== null) on.append(link(doc, PR_OF_TICKET(pass.numero), pass.pr.url, open));
  row.append(who, what, on);
  return row;
}

/** @param {Fabrique} doc @param {Reading["passes"] | undefined} passes @param {(url: string) => void} open */
function whatItADone(doc, passes, open) {
  const pose = part(doc, DONE);
  pose.dataset.partie = "passes";
  if (passes === undefined) pose.append(created(doc, "p", READ_OF("the closer's passes")));
  else if ("sans" in passes) pose.append(lineError(doc, passes.sans, passes.detail ?? ""));
  else if (passes.liste.length === 0) {
    const empty = lineEmpty(doc, WITHOUT_PASS, { classe: "sans" });
    empty.append(hover(doc, WITHOUT_PASS_WHY));
    pose.append(empty);
  } else pose.append(...passes.liste.map((pass) => lineOfPass(doc, pass, open)));
  return pose;
}

// --- Ce qu'il vérifie en premier -----------------------------------------------------

// Les temps des tickets, tels que la passe les a relevés : stables, une dérive et son ticket de correction, ou non lus.
/** @param {readonly string[]} time */
function theTime(time) {
  const first = time[0];
  if (first === undefined || /^Times not read/.test(first)) return "not read at this pass";
  if (/^Times stable/.test(first)) return "stable since the previous pass";
  const correction = /Correction ticket #(\d+)/.exec(time.join(" "))?.[1];
  return `a drift found${correction === undefined ? "" : ` — correction ticket #${correction}`}`;
}

// Ce que la dernière passe lui a remis, une ligne par vérification : son nom, ce qu'elle a trouvé sur ce projet.
/** @param {Pass} pass */
export function itsVerifications(pass) {
  const dead = pass.candidats.filter(({ id }) => id.startsWith("M")).length;
  const duplicates = pass.candidats.filter(({ id }) => id.startsWith("D")).length;
  const drift = pass.derive.at(-1);
  return [
    { nom: "Dead code", dit: dead === 0 ? "none spotted" : `${dead} export${s(dead)} referenced nowhere, or by tests only`, survol: "" },
    { nom: "Duplicates", dit: duplicates === 0 ? "none spotted" : `${duplicates} passage${s(duplicates)} of identical lines`, survol: "" },
    { nom: "Drift", dit: drift ?? "no merge read", survol: pass.derive.slice(0, -1).join(" · ") },
    { nom: "Ticket times", dit: theTime(pass.temps), survol: pass.temps.join(" ") },
  ];
}

/** @param {Fabrique} doc @param {Reading["passes"] | undefined} passes @param {{ ouverts: boolean, basculer?: (opened: boolean) => void }} replis */
function whatItChecks(doc, passes, { ouverts: openOnes, basculer: toggle }) {
  const pose = part(doc, EN_FIRST, ITS_VERIFICATIONS);
  pose.dataset.partie = "en-premier";
  const last = passes !== undefined && !("sans" in passes) ? passes.liste[0] : undefined;
  if (last === undefined) {
    const said = lineEmpty(doc, passes === undefined ? READING : "its own checks — dead code, duplicates, drift, ticket times — once a pass is opened", { classe: "sans" });
    pose.append(said);
    return pose;
  }
  for (const { nom: name, dit: said, survol: detail } of itsVerifications(last)) {
    const row = created(doc, "p");
    row.className = "verification";
    const called = created(doc, "span", name);
    called.className = "nom";
    row.append(called, created(doc, "span", said));
    if (detail !== "") row.append(hover(doc, detail));
    pose.append(row);
  }
  const total = last.candidats.length;
  if (total > 0) {
    const list = created(doc, "ol");
    list.className = "candidats";
    for (const { id, quoi: what } of last.candidats) {
      const item = created(doc, "li");
      const name = created(doc, "span", id);
      name.className = "nom mono";
      item.append(name, created(doc, "span", what.replace(/`/g, "")));
      list.append(item);
    }
    const resume = `${total} handed to pass #${last.numero}${last.sha === "" ? "" : ` on ${last.sha.slice(0, 7)}`}${last.restants === 0 ? "" : ` · ${last.restants} more left for the next`}`;
    pose.append(folded(doc, { titre: "Candidates", resume, ouvert: openOnes, ...(toggle === undefined ? {} : { basculer: toggle }) }, [list]));
  }
  return pose;
}

// --- Ce qu'il vérifie en plus --------------------------------------------------------

// Ce que le dernier geste a rendu, sous le champ (components/setting) : en route, la PR ouverte — la vérification qu'elle
// ajoute ou retire —, la liste déjà telle quelle, ou le refus.
/** @param {Fabrique} doc @param {StateOfVerifications} state @param {(url: string) => void} open */
function rendered(doc, state, open) {
  if (state.enCours !== undefined) return saysOfSetting(doc, { enCours: IN_PROGRESS });
  const said = state.dit;
  if (said !== undefined && "pr" in said) {
    const value = said.geste === "ajouter" ? `the check “${said.verification}”` : `the removal of “${said.verification}”`;
    return saysOfSetting(doc, { pr: said.pr, numero: said.numero, valeur: value }, { ouvrir: open });
  }
  return saysOfSetting(doc, said);
}

/**
 * @param {Fabrique} doc @param {Reading["verifications"] | undefined} verifications @param {StateOfVerifications} state
 * @param {{ taper: (input: string) => void, changer: (action: "ajouter" | "retirer", input: string) => void, ouvrir: (url: string) => void }} gestes
 */
function whatItChecksExtra(doc, verifications, state, { taper: type, changer: switchTo, ouvrir: open }) {
  const pose = part(doc, EXTRA, EXTRA_HELP);
  pose.dataset.partie = "en-plus";
  if (verifications === undefined) {
    pose.append(created(doc, "p", READ_OF("the extra checks")));
    return pose;
  }
  if ("sans" in verifications) {
    pose.append(lineError(doc, verifications.sans, verifications.detail ?? ""));
    return pose;
  }
  const busy = state.enCours !== undefined;
  if (verifications.liste.length === 0) {
    const empty = lineEmpty(doc, `${NOT_STILL("extra check")} The closer checks only its own.`, { classe: "sans" });
    pose.append(empty);
  } else {
    const list = created(doc, "ul");
    list.className = "en-plus";
    for (const verification of verifications.liste) {
      const item = created(doc, "li");
      const removed = state.enCours === `retirer:${verification}`;
      const button = buttonAction(doc, removed ? REMOVE.enCours : REMOVE.libelle, () => {
        if (!busy) switchTo("retirer", verification);
      });
      button.className = "action retirer-la-verification";
      /** @type {any} */
      const click = button.children[0];
      if (click !== undefined) click.disabled = busy;
      item.append(created(doc, "span", verification), button);
      list.append(item);
    }
    pose.append(list);
  }
  let input = state.saisie ?? "";
  const field = created(doc, "p");
  field.className = "champ ajouter";
  const entry = created(doc, "input");
  entry.type = "text";
  entry.ariaLabel = "a check to add";
  entry.placeholder = ADD.invite;
  entry.spellcheck = false;
  entry.value = input;
  entry.disabled = busy;
  const adds = state.enCours === "ajouter";
  const button = buttonAction(
    doc,
    adds ? ADD.enCours : ADD.libelle,
    () => {
      if (input.trim() !== "") switchTo("ajouter", input.trim());
    },
    { recommande: true },
  );
  button.className = "action ajouter-la-verification";
  /** @type {any} */
  const click = button.children[0];
  const follow = () => {
    if (click !== undefined) click.disabled = busy || input.trim() === "";
  };
  if (click !== undefined) click.title = ADD.survol;
  entry.addEventListener("input", () => {
    input = entry.value;
    type(entry.value);
    follow();
  });
  entry.addEventListener("keydown", (/** @type {{ key?: string }} */ event) => {
    if (event.key === "Enter" && !busy && input.trim() !== "") switchTo("ajouter", input.trim());
  });
  follow();
  field.append(entry, button);
  // Gardées dans le dépôt : la partie le dit comme une rangée de réglage, sous son champ.
  const parPr = created(doc, "p", PAR_PR);
  parPr.className = "par-pr";
  pose.append(field, parPr, ...rendered(doc, state, open));
  return pose;
}

// --- Ses réglages ----------------------------------------------------------------------

// Le calibrage : le modèle et l'effort, choisis ensemble — vides tous deux, le dépôt n'en dit plus rien. Il s'applique
// au `change` d'une liste, dès que les deux disent un calibrage autre que celui en vigueur ; l'un sans l'autre attend.
/**
 * @param {Fabrique} doc
 * @param {{ reglage: Setting, etat: State | undefined, valeurs: { modeles: readonly string[], efforts: readonly string[] }, choisir: (chosen: string) => void, changer: (calibration: Calibration) => void, ouvrir?: (url: string) => void }} options
 */
function lineOfCalibration(doc, { reglage: setting, etat: state, valeurs: values, choisir: choose, changer: switchTo, ouvrir: open }) {
  const readOne = /** @type {Calibration | null} */ (setting.valeur);
  const saidOne = created(doc, "strong", readOne === null ? "not set" : `${readOne.model} / ${readOne.effort}`);
  saidOne.className = "mono";
  const source = created(doc, "small", readOne === null ? "the station's, if any" : "in the repository");
  source.className = "source";
  const busy = state?.enCours === true;
  const [modelChosen, effortChosen] = state?.choisi === undefined ? [readOne?.model ?? "", readOne?.effort ?? ""] : state.choisi.split(" ");
  /** @param {string} prompt @param {readonly string[]} list @param {string} chosenOne */
  const choice = (prompt, list, chosenOne) => {
    const pose = created(doc, "select");
    pose.ariaLabel = `the closer's ${prompt.replace("…", "")}`;
    for (const [text, v] of [[prompt, ""], ...list.map((x) => [x, x])]) {
      const option = created(doc, "option", text);
      option.value = v;
      pose.append(option);
    }
    pose.value = list.includes(chosenOne) ? chosenOne : "";
    pose.disabled = busy;
    return pose;
  };
  const model = choice(CHOOSE_MODEL, values.modeles, modelChosen ?? "");
  const effort = choice(CHOOSE_EFFORT, values.efforts, effortChosen ?? "");
  const change = () => {
    const m = model.value;
    const e = effort.value;
    if ((m === "") !== (e === "")) return false;
    return readOne === null ? m !== "" : m !== readOne.model || e !== readOne.effort;
  };
  for (const list of [model, effort]) {
    list.addEventListener("change", () => {
      choose(`${model.value} ${effort.value}`);
      if (!busy && change()) switchTo({ model: model.value, effort: effort.value });
    });
  }
  return rowOfSetting(doc, {
    nom: setting.nom,
    cle: setting.cle,
    valeur: [saidOne, source],
    controle: [model, effort, hover(doc, "Both chosen together: one without the other makes the start be refused, and is not proposed. Both emptied, the setting's removal is proposed.")],
    depot: true,
    dessous: saysOfCap(doc, state, (value) => `${value.model} / ${value.effort}`, open),
  });
}

// Les réglages : le calibrage, puis les trois nombres, chacun comme un plafond de durée. Celui que le closer sur GitHub
// ne lit pas encore le dit, la raison au survol.
/**
 * @param {Fabrique} doc @param {Reading["reglages"] | undefined} settings
 * @param {{ etats: ReadonlyMap<string, State>, valeurs: { modeles: readonly string[], efforts: readonly string[] }, choisir: (key: string, chosen: string) => void, changer: (key: string, input: string | Calibration) => void, ouvrir: (url: string) => void }} options
 */
function itsSettings(doc, settings, { etats: states, valeurs: values, choisir: choose, changer: switchTo, ouvrir: open }) {
  const pose = part(doc, SETTINGS, SETTINGS_HELP);
  pose.dataset.partie = "reglages";
  if (settings === undefined) {
    pose.append(created(doc, "p", READ_OF("the closer's settings")));
    return pose;
  }
  if ("sans" in settings) {
    pose.append(lineError(doc, settings.sans, settings.detail ?? ""));
    return pose;
  }
  for (const setting of settings.liste) {
    const state = states.get(setting.cle);
    if (setting.cle === "calibration") {
      pose.append(lineOfCalibration(doc, { reglage: setting, etat: state, valeurs: values, choisir: (chosen) => choose(setting.cle, chosen), changer: (calibration) => switchTo(setting.cle, calibration), ouvrir: open }));
      continue;
    }
    const cap = /** @type {any} */ ({ cle: setting.cle, nom: setting.nom, unite: setting.unite, entier: true, duree: false, defaut: setting.defaut, valeur: setting.valeur });
    const row = setOneCap(doc, { plafond: cap, etat: state, choisir: (chosen) => choose(setting.cle, chosen), changer: (input) => switchTo(setting.cle, input), ouvrir: open });
    // La condition de départ se lit en cooks en vol : « 1 », c'est aucun.
    if (setting.cle === "cooksBelow") {
      const [saidOne, source] = row.children[1]?.children ?? [];
      const n = /** @type {number | null} */ (setting.valeur);
      if (saidOne !== undefined && n !== null) saidOne.textContent = n === 1 ? "none in flight" : `fewer than ${count(n)} in flight`;
      if (source !== undefined && n === null) source.textContent = "the station's, or none in flight";
      row.children[0]?.append(hover(doc, DEPARTURE));
    }
    if (!setting.surGithub) {
      const note = created(doc, "small", NOT_ON_GITHUB);
      note.className = "pas-sur-github";
      row.children[1]?.append(note, hover(doc, NOT_ON_GITHUB_WHY));
    }
    pose.append(row);
  }
  return pose;
}

// --- Le bloc -----------------------------------------------------------------------------

// Le bloc entier. `lecture` indéfinie : la première lecture est en route ; chaque partie dit la sienne. `ouvrir` ouvre
// une passe ou sa PR ; `ouvrirLaPr`, la PR qu'un réglage changé a ouverte.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Reading, etats?: ReadonlyMap<string, State>, verifications?: StateOfVerifications, valeurs?: { modeles: readonly string[], efforts: readonly string[] }, candidatsOuverts?: boolean, basculerCandidats?: (opened: boolean) => void, ouvrir?: (url: string) => void, ouvrirLaPr?: (url: string) => void, choisir?: (key: string, chosen: string) => void, changer?: (key: string, input: string | Calibration) => void, taper?: (input: string) => void, changerVerification?: (action: "ajouter" | "retirer", input: string) => void }} [options]
 */
export function setBlockCloser(doc, { lecture: reading, etats: states = new Map(), verifications = {}, valeurs: values = { modeles: [], efforts: [] }, candidatsOuverts: candidatesOpen = false, basculerCandidats: toggleCandidates, ouvrir: open = () => {}, ouvrirLaPr: openThePr = open, choisir: choose = () => {}, changer: switchTo = () => {}, taper: type = () => {}, changerVerification: changeVerification = () => {} } = {}) {
  const block = doc.createElement("section");
  block.className = "bloc-du-projet";
  block.dataset.bloc = "closer";
  block.ariaLabel = TITLE;
  const title = doc.createElement("h3");
  title.textContent = TITLE;
  title.append(hover(doc, HELP));
  block.append(
    title,
    whatItADone(doc, reading?.passes, open),
    whatItChecks(doc, reading?.passes, { ouverts: candidatesOpen, ...(toggleCandidates === undefined ? {} : { basculer: toggleCandidates }) }),
    whatItChecksExtra(doc, reading?.verifications, verifications, { taper: type, changer: changeVerification, ouvrir: openThePr }),
    itsSettings(doc, reading?.reglages, { etats: states, valeurs: values, choisir: choose, changer: switchTo, ouvrir: openThePr }),
  );
  return block;
}
