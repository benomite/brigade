// @ts-check
// « Add a server » (ticket 4347) : une station de serveur s'ajoute depuis l'app, sans ouvrir la page d'installation. Offert
// à côté de la liste des stations — l'onglet Stations d'un projet, son choix « Who cooks <projet>? », et la page « who cooks
// it » d'un projet neuf (parcours-premier-projet/). Le panneau dit en une phrase où lancer la ligne d'installation
// (`INSTALLER`, stations-of-account.js, la même que la page d'installation), la donne à copier, dit qu'un Mac fait la même,
// puis attend le serveur : une station enregistrée sous le compte (`stationsDuCompte`) qui n'y était pas à l'ouverture du
// panneau est la sienne — elle s'y inscrit seule, sans code (runtime/src/enregistrement-station/README.md). « check again »
// relit le compte ; le serveur arrivé, le projet lui est confié par le geste de « Choose who cooks it ».
// Le bouton d'entrée ouvre et ferme le panneau de lui-même, et le dit à la vue (`basculer`), qui le repose ensuite.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { COPIED, COPY, INSTALLER } from "../stations-of-account.js";
import { setTheChoice } from "../stations-tab/choice.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../stations-of-account.ts").StationsOfAccount} StationsOfAccount */
/** @typedef {import("../../stations-of-account.ts").StationRecorded} StationRecorded */
// Où en est le serveur attendu : pas encore là, la lecture du compte en échec (sa phrase, son détail au survol), ou arrivé.
/** @typedef {{ etat: "attente" } | { etat: "illisible", raison: string, detail: string } | { etat: "appairee", station: StationRecorded }} ServerSeen */
// Ce que le panneau montre. `projet` : le projet à lui confier, quand l'écran sait le faire.
/** @typedef {{ ouvert: boolean, vu: ServerSeen, copiee?: boolean, projet?: string }} StateOfServer */
/**
 * @typedef {{
 *   basculer?: (opened: boolean) => void,
 *   copier?: (command: string) => void,
 *   verifier?: () => void,
 *   confier?: (station: StationRecorded) => void,
 * }} ActionsOfServer
 */

export const ADD_A_SERVER = "Add a server";
// La ligne d'installation de Linux et de macOS, celle que la page d'installation publie.
export const INSTALL_COMMAND = INSTALLER[0]?.commande ?? "";
export const WHERE_TO_RUN = "Paste this one line in a terminal on any always-on Linux server (Debian or Ubuntu): it installs the station, then signs the server in to GitHub — use this same account — and to your Claude Max subscription.";
export const ON_A_MAC = "On a Mac, it is the same command; the station cooks only while that Mac stays on and connected.";
export const WAITING = "Waiting for its first check-in: the server appears here within a minute after the command ends.";
export const CHECK_AGAIN = "check again";
export const UNREADABLE = "your stations could not be read";
/** @param {string} name */
export const PAIRED = (name) => `${name} checked in: it is one of your stations now.`;
/** @param {string} project */
export const WHO_COOKS_IT = (project) => `Choose who cooks ${project}:`;

// Le serveur attendu, d'après la lecture du compte : `connues`, les stations qu'il avait à l'ouverture du panneau — sans
// elles, aucune n'est dite neuve. Rien encore lu : il attend.
/** @param {ReadonlySet<string> | undefined} known @param {StationsOfAccount | undefined} readEntries @returns {ServerSeen} */
export function serverSeen(known, readEntries) {
  if (readEntries === undefined) return { etat: "attente" };
  if (readEntries.state !== "listed") return { etat: "illisible", raison: readEntries.reason, detail: "detail" in readEntries ? (readEntries.detail ?? "") : "" };
  const freshOne = known === undefined ? undefined : readEntries.stations.find(({ id }) => !known.has(id));
  return freshOne === undefined ? { etat: "attente" } : { etat: "appairee", station: freshOne };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le panneau : la phrase, la ligne et son bouton qui la copie, le mot pour un Mac, puis où en est le serveur.
/** @param {Fabrique} doc @param {StateOfServer} etat @param {ActionsOfServer} actions */
function panel(doc, { vu: seenOne, copiee: copied, projet: project }, actions) {
  const root = created(doc, "section");
  root.className = "ajout-de-serveur";
  root.ariaLabel = ADD_A_SERVER;
  const or = created(doc, "p", WHERE_TO_RUN);
  or.className = "ou";
  const line = created(doc, "p");
  line.className = "commande";
  const code = created(doc, "code", INSTALL_COMMAND);
  code.className = "mono";
  const copy = buttonAction(doc, copied === true ? COPIED : COPY, () => actions.copier?.(INSTALL_COMMAND));
  line.append(code, copy);
  const mac = created(doc, "p", ON_A_MAC);
  mac.className = "mac";
  root.append(or, line, mac);
  if (seenOne.etat === "appairee") {
    const arrival = created(doc, "p", PAIRED(seenOne.station.name));
    arrival.className = "arrivee";
    root.append(arrival);
    const entrust = actions.confier;
    if (project !== undefined && entrust !== undefined) {
      const question = created(doc, "p", WHO_COOKS_IT(project));
      question.className = "qui-le-cuit";
      const oneOf = { cle: seenOne.station.id, nom: seenOne.station.name, horsLigne: !seenOne.station.available, recommande: seenOne.station.available };
      root.append(question, ...setTheChoice(doc, { choix: [oneOf] }, () => entrust(seenOne.station)));
    }
    return root;
  }
  if (seenOne.etat === "illisible") root.append(lineError(doc, `${UNREADABLE}: ${seenOne.raison}`, seenOne.detail, { classe: "erreur" }));
  else {
    const wait = created(doc, "p", WAITING);
    wait.className = "attente";
    wait.ariaLive = "polite";
    root.append(wait);
  }
  const foot = created(doc, "p");
  foot.className = "gestes";
  foot.append(buttonAction(doc, CHECK_AGAIN, () => actions.verifier?.()));
  root.append(foot);
  return root;
}

// Le bouton « Add a server », puis son panneau quand il est ouvert. Un clic l'ouvre ou le ferme de lui-même — fermé, le
// panneau se pose au premier clic —, et le dit à la vue, qui le repose ensuite.
/** @param {Fabrique} doc @param {StateOfServer} state @param {ActionsOfServer} actions */
export function placeAddServer(doc, state, actions) {
  /** @type {any} */
  let pose = state.ouvert ? panel(doc, state, actions) : undefined;
  const entry = button(doc, ADD_A_SERVER, () => {
    if (pose === undefined) {
      pose = panel(doc, { ...state, ouvert: true }, actions);
      pose.hidden = true;
      entry.after(pose);
    }
    pose.hidden = !pose.hidden;
    entry.ariaExpanded = String(!pose.hidden);
    actions.basculer?.(!pose.hidden);
  });
  entry.className = "ajouter-un-serveur";
  entry.ariaExpanded = String(state.ouvert);
  return pose === undefined ? [entry] : [entry, pose];
}
