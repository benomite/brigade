// @ts-check
// Les réglages du projet sur sa page (ticket 1309, épique 1301) : sa branche d'intégration, les calibrages par défaut
// de son manager et de son reviewer, son plafond de calibrage, et ceux de son closer (ticket 1685). Chacun est la rangée
// de réglage de l'app (components/setting, ticket 2920) : sa valeur en vigueur et d'où elle vient, et de quoi la changer
// — un champ, un nom ou un nombre, ou un modèle et un effort. Ils vivent dans le dépôt du projet : la rangée le dit
// (`PAR_PR`), et un changement ouvre une PR dès qu'il est fait — le `change` du champ, ou d'une des deux listes —, sans
// bouton. La pass retient la PR pour le chef, et rien ne se pose sur la box. La valeur montrée reste celle en vigueur —
// la PR vaut une fois mergée : ce qui est dit sous la rangée, avec de quoi ouvrir la PR. Refusé — une valeur qui est à
// la machine, rien qui change —, le refus se dit sous la rangée, et le champ revient à la valeur en vigueur. Ce module
// ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hover } from "../bricks.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { lineError } from "../components/line-error/line-error.js";
import { levelOf } from "../levels.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../settings-of-project.ts").SettingSeen} Seen */
/** @typedef {import("../../settings-of-project.ts").ReadOfSettings} Reading */
/** @typedef {import("../../settings-of-project.ts").ChoiceOfSetting} Choice */
/** @typedef {import("../../settings-of-project.ts").Key} Key */
// Ce que le dernier changement a rendu : la PR ouverte et la valeur qu'elle propose, ou le refus et son détail.
/** @typedef {{ propose: string, pr: string, numero: number, valeur: string } | { refus: string, detail?: string }} Says */
// L'état d'un réglage entre deux poses : ce que le chef écrit sans l'avoir encore changé, la proposition en route, ce
// qu'elle a rendu.
/** @typedef {{ choisi?: string | { modele: string, effort: string }, enCours?: boolean, dit?: Says }} State */

// Les rangées que l'artboard `Settings.dc.html` dessine, dans son ordre (« Label in the bar » est celle du sigle, posée
// à part) ; les autres réglages, réels eux aussi, suivent plus bas, sous la couleur.
/** @type {readonly Key[]} */
const DRAWN = ["branche", "manager", "reviewer", "plafond", "closer-tokens"];
export const TITLE = "Project settings";
export const HELP =
  "Kept in the project's repository (.claude/brigade/projet.json), for everyone who clones it. A change is proposed as a pull request, held for you: it applies once merged. Nothing is saved on the box.";
// Ce que la rangée dit tant que la proposition est en route.
export const IN_PROGRESS = "proposing…";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Une liste déroulante : ses valeurs, celle qui est choisie — une valeur que rien ne dit ouvre sur « — ». `input` garde
// le choix ; `change` le fait.
/** @param {Fabrique} doc @param {string} wording @param {readonly string[]} values @param {string} chosenOne @param {(value: string) => void} keep @param {(value: string) => void} change */
function list(doc, wording, values, chosenOne, keep, change) {
  const select = created(doc, "select");
  select.ariaLabel = wording;
  const options = chosenOne === "" ? ["", ...values] : values;
  select.append(
    ...options.map((value) => {
      const option = created(doc, "option", value === "" ? "—" : value);
      option.value = value;
      option.selected = value === chosenOne;
      return option;
    }),
  );
  select.value = chosenOne;
  select.addEventListener("input", () => keep(select.value));
  select.addEventListener("change", () => change(select.value));
  return select;
}

// Ce que le choix dit, et s'il change quelque chose à la valeur en vigueur.
/** @param {Seen} seenOne @param {State["choisi"]} chosen */
function choiceOf(seenOne, chosen) {
  if ("valeur" in seenOne) {
    const value = typeof chosen === "string" ? chosen : seenOne.valeur;
    return { dit: value.trim(), change: value.trim() !== "" && value.trim() !== seenOne.valeur, choix: /** @type {Choice} */ ({ cle: seenOne.cle, valeur: value.trim() }) };
  }
  const { modele: model, effort } = typeof chosen === "object" ? chosen : { modele: seenOne.modele, effort: seenOne.effort };
  return { dit: `${model} / ${effort}`, change: model !== "" && effort !== "" && (model !== seenOne.modele || effort !== seenOne.effort), choix: /** @type {Choice} */ ({ cle: seenOne.cle, modele: model, effort }) };
}

// Un réglage : la rangée de réglage, son niveau « project » — elle dit qu'un changement ouvre une PR —, sa valeur en
// vigueur et d'où elle vient, son champ, puis ce que le dernier changement a rendu. `choisir` garde ce que le chef écrit
// — sans reposer la page : il est en train d'écrire ; le `change` du champ le propose, s'il change la valeur en vigueur.
/**
 * @param {Fabrique} doc
 * @param {{ vu: Seen, modeles: readonly string[], efforts: readonly string[], etat: State | undefined, choisir: (chosen: string | { modele: string, effort: string }) => void, proposer: (choice: Choice, said: string) => void, ouvrir: (url: string) => void }} options
 */
export function setOneSetting(doc, { vu: seenOne, modeles: models, efforts, etat: state, choisir: choose, proposer: propose, ouvrir: open }) {
  const saidOne = created(doc, "strong", seenOne.dit ?? "not set");
  saidOne.className = "mono";
  const source = created(doc, "small", seenOne.source);
  source.className = "source";

  const busy = state?.enCours === true;
  let chosen = state?.choisi;
  /** @param {string | { modele: string, effort: string }} fresh */
  const keep = (fresh) => {
    chosen = fresh;
    choose(fresh);
  };
  /** @param {string | { modele: string, effort: string }} fresh */
  const change = (fresh) => {
    keep(fresh);
    const { change, choix: choice, dit: said } = choiceOf(seenOne, chosen);
    if (change) propose(choice, said);
  };
  /** @type {any[]} */
  const control = [];
  if ("valeur" in seenOne) {
    const input = created(doc, "input");
    input.type = "text";
    // Un nombre du closer s'écrit en chiffres ; le runtime juge s'il est admis.
    if (seenOne.cle !== "branche") input.inputMode = "numeric";
    input.ariaLabel = seenOne.nom;
    input.spellcheck = false;
    input.value = typeof chosen === "string" ? chosen : seenOne.valeur;
    input.disabled = busy;
    input.addEventListener("input", () => keep(input.value));
    input.addEventListener("change", () => change(input.value));
    control.push(input);
  } else {
    const current = typeof chosen === "object" ? chosen : { modele: seenOne.modele, effort: seenOne.effort };
    const withIt = (/** @type {Partial<{ modele: string, effort: string }>} */ taken) => ({ ...(typeof chosen === "object" ? chosen : current), ...taken });
    const model = list(doc, `${seenOne.nom}: model`, models, current.modele, (taken) => keep(withIt({ modele: taken })), (taken) => change(withIt({ modele: taken })));
    const effort = list(doc, `${seenOne.nom}: effort`, efforts, current.effort, (taken) => keep(withIt({ effort: taken })), (taken) => change(withIt({ effort: taken })));
    model.disabled = busy;
    effort.disabled = busy;
    control.push(model, created(doc, "span", " / "), effort);
  }

  // Ce que le dernier changement a rendu, sous la rangée : la proposition en route, la PR ouverte, ou le refus.
  const said = busy ? { enCours: IN_PROGRESS } : state?.dit;
  return rowOfSetting(doc, {
    nom: seenOne.nom,
    cle: seenOne.cle,
    niveau: levelOf(doc, seenOne.cle),
    valeur: [saidOne, source],
    controle: control,
    dessous: saysOfSetting(doc, said, { ouvrir: open }),
  });
}

// La section des réglages, ou null tant que rien n'est lu. Une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture: Reading | undefined, etats: ReadonlyMap<Key, State>, choisir: (key: Key, chosen: string | { modele: string, effort: string }) => void, proposer: (choice: Choice, said: string) => void, ouvrir: (url: string) => void, groupe?: "dessines" | "en-plus" }} options
 */
export function setTheSettings(doc, { lecture: reading, etats: states, choisir: choose, proposer: propose, ouvrir: open, groupe: group = "dessines" }) {
  if (reading === undefined) return null;
  const extra = group === "en-plus";
  if (extra && "sans" in reading) return null;
  const section = created(doc, "section");
  section.className = "reglages-du-projet";
  section.ariaLabel = TITLE;
  // Sa tête est une rangée sans contrôle : son titre, où ses réglages sont gardés au survol.
  if (!extra) {
    const title = rowOfSetting(doc, { nom: TITLE, classe: "tete" });
    title.children[0]?.append(hover(doc, HELP));
    section.append(title);
  }
  if ("sans" in reading) {
    section.append(lineError(doc, reading.sans, reading.detail ?? ""));
    return section;
  }
  const { modeles: models, efforts } = reading.vus;
  const settings = reading.vus.reglages.filter((seenOne) => DRAWN.includes(seenOne.cle) !== extra);
  // L'ordre de l'artboard, non celui de la lecture.
  if (!extra) settings.sort((a, b) => DRAWN.indexOf(a.cle) - DRAWN.indexOf(b.cle));
  section.append(
    ...settings.map((seenOne) => setOneSetting(doc, { vu: seenOne, modeles: models, efforts, etat: states.get(seenOne.cle), choisir: (chosen) => choose(seenOne.cle, chosen), proposer: propose, ouvrir: open })),
  );
  return section;
}
