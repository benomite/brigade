// @ts-check
// Les plafonds de durée, sur Kitchen > Health (ticket 2490, épique 2484) : au-delà, la cuisine signale la dérive. Le
// seuil du temps perdu par ticket (ticket 2670, `lostTimeMaxMin`), tel que la station le publie, puis les seuils `drift.*` que le dépôt du projet
// déclare (`.claude/brigade/projet.json`) — les durées en tête, les autres repliés derrière une ligne. Chaque seuil est
// une rangée de réglage (components/setting, ticket 2920) : son nom, sa valeur en vigueur et d'où elle vient, son champ,
// qui s'applique dès qu'il change — pas de « save ». Gardé dans le dépôt, un seuil changé s'y propose par une pull
// request (caps-duration.ts), et sa rangée le dit ; la valeur montrée reste celle en vigueur jusqu'au merge. Vide, le
// seuil se propose retiré. Le seuil du temps perdu ne se change pas encore d'ici : sa rangée le dit, la raison au
// survol. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { folded, hover } from "../../bricks.js";
import { lineError } from "../../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../../components/setting/setting.js";
import { READ_OF } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../caps-duration.ts").CapRead} Cap */
/** @typedef {import("../../../caps-duration.ts").ReadOfCaps} Reading */
/** @typedef {import("../../../closer-health.ts").Calibration} Calibration */
// Ce que le dernier changement a rendu : la PR ouverte et la valeur qu'elle propose (null : le retrait), la valeur déjà
// là, ou le refus.
/** @typedef {{ pr: string, numero: number, valeur: number | Calibration | null } | { fait: string } | { refus: string, detail?: string }} SaysOfChange */
// L'état d'un plafond entre deux poses : ce que le chef a tapé sans l'avoir appliqué, le changement en cours, ce qu'il a rendu.
/** @typedef {{ choisi?: string, enCours?: boolean, dit?: SaysOfChange }} State */

export const TITLE = "Duration caps";
export const HELP =
  "Above a cap, the kitchen flags the drift. Kept in the project's repository (.claude/brigade/projet.json): a change here opens a pull request on its integration branch, and the station applies it once merged, at its next fetch. Empty, the cap's removal is proposed.";
export const IN_PROGRESS = "opening the pull request…";
export const LOST_MAX = { nom: "Lost time per ticket", source: "median of recent tickets, published by the station", fige: "not editable here yet" };
export const LOST_MAX_WHY =
  "The station caps the median lost time of recent tickets (waiting for the manager's judgement, waiting for a claim, failed cooks, send-backs) with lostTimeMaxMin, read from its own clone of projet.json, outside the drift thresholds this block changes: it cannot be changed from the app yet. A ticket's total time has no cap, its size varies.";
export const OTHERS = "Other drift thresholds";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

/** @param {number} value @param {string} unite */
const withUnite = (value, unite) => `${value.toLocaleString("en-US")} ${unite}`;

// Ce que le champ propose, et s'il change la valeur du dépôt : vide, c'est retirer une valeur posée.
/** @param {Cap} cap @param {string | undefined} chosen */
export function changeTheValue(cap, chosen) {
  if (chosen === undefined) return false;
  const tape = chosen.trim();
  if (tape === "") return cap.valeur !== null;
  return Number(tape) !== cap.valeur;
}

// Ce que la rangée dit sous son champ : le changement en cours, puis ce qu'il a rendu — la PR ouverte se dit avec la
// valeur qu'elle propose, `dire` la met en mots.
/**
 * @param {Fabrique} doc @param {State | undefined} state @param {(value: any) => string} tell
 * @param {((url: string) => void) | undefined} open
 */
export function saysOfCap(doc, state, tell, open) {
  if (state?.enCours === true) return saysOfSetting(doc, { enCours: IN_PROGRESS });
  const said = state?.dit;
  if (said !== undefined && "pr" in said) return saysOfSetting(doc, { pr: said.pr, numero: said.numero, valeur: said.valeur === null ? "removal" : tell(said.valeur) }, open === undefined ? {} : { ouvrir: open });
  return saysOfSetting(doc, said);
}

// La rangée d'un plafond : son nom, sa valeur en vigueur et d'où elle vient, son champ, puis ce que le dernier changement
// a rendu. Le champ s'applique à son `change` — quitté ou validé par Entrée — quand il change la valeur du dépôt.
// `choisir` garde ce que le chef tape — sans reposer la page : il est en train d'écrire.
/**
 * @param {Fabrique} doc
 * @param {{ plafond: Cap, etat: State | undefined, choisir: (chosen: string) => void, changer: (input: string) => void, ouvrir?: (url: string) => void }} options
 */
export function setOneCap(doc, { plafond: cap, etat: state, choisir: choose, changer: change, ouvrir: open }) {
  const saidOne = created(doc, "strong", cap.valeur === null ? "not set" : withUnite(cap.valeur, cap.unite));
  saidOne.className = "mono";
  const source = created(doc, "small", cap.valeur !== null ? "in the repository" : cap.defaut === null ? "the station's, if any" : `the station's, or ${withUnite(cap.defaut, cap.unite)}`);
  source.className = "source";

  const busy = state?.enCours === true;
  const input = created(doc, "input");
  input.type = "text";
  input.inputMode = cap.entier ? "numeric" : "decimal";
  input.ariaLabel = `${cap.nom}, in ${cap.unite}`;
  input.spellcheck = false;
  input.placeholder = cap.defaut === null ? "—" : String(cap.defaut);
  input.value = state?.choisi ?? (cap.valeur === null ? "" : String(cap.valeur));
  input.disabled = busy;
  input.addEventListener("input", () => choose(input.value));
  input.addEventListener("change", () => {
    if (!busy && changeTheValue(cap, input.value)) change(input.value.trim());
  });
  const unite = created(doc, "span", cap.unite);
  unite.className = "unite";
  return rowOfSetting(doc, {
    nom: cap.nom,
    cle: cap.cle,
    valeur: [saidOne, source],
    controle: [input, unite],
    depot: true,
    dessous: saysOfCap(doc, state, (value) => withUnite(value, cap.unite), open),
  });
}

// La rangée du seuil du temps perdu par ticket : sa valeur, telle que la station la publie, sans champ.
/** @param {Fabrique} doc @param {number | undefined} lostTimeMaxMin */
function setTheLostMax(doc, lostTimeMaxMin) {
  const saidOne = created(doc, "strong", lostTimeMaxMin === undefined ? "not known yet" : `${lostTimeMaxMin} min`);
  saidOne.className = "mono";
  const source = created(doc, "small", lostTimeMaxMin === undefined ? "the station does not publish it yet" : LOST_MAX.source);
  source.className = "source";
  const frozen = created(doc, "span", LOST_MAX.fige);
  frozen.className = "fige";
  return rowOfSetting(doc, { nom: LOST_MAX.nom, cle: "lostTimeMaxMin", valeur: [saidOne, source], controle: [frozen, hover(doc, LOST_MAX_WHY)], depot: false });
}

// Le bloc : le seuil du temps perdu par ticket, puis les plafonds du dépôt — tant qu'ils ne sont pas lus, une ligne le dit ;
// une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Reading, lostTimeMaxMin?: number, etats?: ReadonlyMap<string, State>, autresOuverts?: boolean, basculerAutres?: (opened: boolean) => void, choisir?: (key: string, chosen: string) => void, changer?: (key: string, input: string) => void, ouvrir?: (url: string) => void }} [options]
 */
export function setBlockCapsDuration(doc, { lecture: reading, lostTimeMaxMin, etats: states = new Map(), autresOuverts: othersOpen = false, basculerAutres: toggleOthers, choisir: choose = () => {}, changer: change = () => {}, ouvrir: open = () => {} } = {}) {
  const block = doc.createElement("section");
  block.className = "bloc-du-projet";
  block.dataset.bloc = "plafonds-duree";
  block.ariaLabel = TITLE;
  const title = doc.createElement("h3");
  title.textContent = TITLE;
  title.append(hover(doc, HELP));
  block.append(title, setTheLostMax(doc, lostTimeMaxMin));
  if (reading === undefined) {
    const wait = created(doc, "p", READ_OF("the caps of the repository"));
    wait.className = "plafonds-lecture";
    block.append(wait);
    return block;
  }
  if ("sans" in reading) {
    block.append(lineError(doc, reading.sans, reading.detail ?? ""));
    return block;
  }
  /** @param {Cap} cap */
  const line = (cap) => setOneCap(doc, { plafond: cap, etat: states.get(cap.cle), choisir: (chosen) => choose(cap.cle, chosen), changer: (input) => change(cap.cle, input), ouvrir: open });
  const others = reading.plafonds.filter(({ duree: duration }) => !duration);
  const poses = others.filter(({ valeur: value }) => value !== null).length;
  block.append(
    ...reading.plafonds.filter(({ duree: duration }) => duration).map(line),
    folded(doc, { titre: OTHERS, resume: poses === 0 ? "none set in the repository" : `${poses} set in the repository`, ouvert: othersOpen, ...(toggleOthers === undefined ? {} : { basculer: toggleOthers }) }, others.map(line)),
  );
  return block;
}
