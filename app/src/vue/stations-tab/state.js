// @ts-check
// L'onglet Stations d'un projet (ticket 3195, épique 3194) : qui le cuit, est-ce que ça marche, comment le changer. Ce
// module tient ce que l'onglet dit, sans rien poser : la vue lui donne ce qu'elle a lu, il rend un état.
//   - Les stations qui servent le projet : celles que sa cuisson nomme (cooking.ts) — une qui le refuse comprise : elle est
//     des siennes, et sa carte dit pourquoi elle ne le cuit pas —, et celles qui le disent dans leur document sur GitHub (`StationVue.projets`, stations/stations.ts) — elles seules ont une
//     carte. Une station qui ne le sert pas n'est nommée que comme l'origine d'un déménagement en cours. Celle de cet
//     ordinateur le sert quand sa liste de projets servis porte son dépôt (projets-servis/, ticket 3399) : une cuisine qui
//     tourne ici pour le projet sans qu'il soit sur la liste ne le cuit pas, quoi que dise sa ligne de cuisson.
//   - La ligne du haut, dans exactement un de cinq états : `cuit` (une station en ligne le cuit, ou attend son prochain
//     ticket), `deplacement` (un déménagement de sa cuisine en route), `eteint` (le projet est éteint : rien n'y cuit, quoi
//     que disent ses stations — ticket 3454), `hors-ligne` (celles qui le servent sont toutes hors ligne : rien ne cuit),
//     `personne` (aucune ne le sert). Seul `cuit` est vert.
//   - Le déménagement suivi : celui que les stations publient (projects.ts, `demenagementDe`), sinon celui que le chef vient
//     de demander d'ici, tant que la station visée ne le sert pas. Pas fini au bout d'une minute, il dit ce qui le bloque.

import { durationInClear } from "../project/delay.js";
import { THIS_COMPUTER } from "../lexicon.js";
import { HELD } from "../stations-of-account.js";
import { statusRead } from "../engine/engines.js";

/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */
/** @typedef {import("../../projects/projects.ts").MoveInProgress} MoveInProgress */
/** @typedef {import("../../cooking.ts").LineOfStation} LineOfStation */
/** @typedef {import("../../facts.ts").Cook} Cook */
/** @typedef {import("../../cooking.ts").AgentOfStation} AgentOfStation */

// Ce qu'est une station pour le chef : cet ordinateur, une box toujours allumée, ou un autre ordinateur.
/** @typedef {"ici" | "box" | "ordinateur"} Kind */
// Son état à l'instant : en ligne, hors ligne (son `dit` dit depuis quand), illisible, qui refuse le projet, ou qui démarre —
// la station où la cuisine déménage, tant qu'elle ne la sert pas encore — ou qui redémarre : la station de cet ordinateur,
// dont la mise à jour remplace le process (ticket 3637), n'est pas hors ligne.
/** @typedef {"en-ligne" | "hors-ligne" | "illisible" | "refuse" | "demarre" | "redemarre"} StateOfStation */
/**
 * Une station qui sert le projet, telle que sa carte la montre : son état et ses mots (`dit`) ; `note` : ce qui la retient
 * encore — sa machine pleine, la limite de GitHub, son refus et sa raison. `cooks`, `agents` : ce qu'elle tient du projet à
 * l'instant. `prise` : le nom sous lequel sa cuisson la nomme (`<machine>/claude`), quand elle la nomme — celui de sa
 * déclaration et de son plafond. `moteur` : l'état de son moteur, tel que sa ligne de cuisson le publie (ticket 3746).
 * @typedef {{ id: string, nom: string, prise?: string, ici: boolean, sorte: Kind, etat: StateOfStation, dit: string, note?: string, lacks?: string, cooks: Cook[], agents: AgentOfStation[], moteur?: import("../engine/engines.js").Status }} Serving
 */
/**
 * Un déménagement en route : d'où, vers où, depuis quand (`depuis`, en ms), son étape, ce que la station en dit (`dit`), et
 * si chacune des deux est en ligne.
 * @typedef {{ de: string, vers: string, depuis: number, etape: "demandee" | "acceptee" | "remise", dit: string, deEnLigne: boolean, versEnLigne: boolean }} Displacement
 */
/**
 * La ligne du haut. Éteint, `dit` : sa phrase ; `releve` : la ligne `manager` de la
 * box ; `servi` : une station le sert — « Add a station » plutôt que « Choose who cooks it ».
 * @typedef {{ etat: "cuit", vert: true, stations: string[], cooks: number }
 *   | { etat: "deplacement", vert: false, de: string, vers: string, attend: string, depuis: number, bloque: string | null }
 *   | { etat: "eteint", vert: false, dit: string, releve: string, servi: boolean }
 *   | { etat: "hors-ligne", vert: false, station: string, ici: boolean, sorte: Kind, dit: string }
 *   | { etat: "redemarre", vert: false, station: string, dit: string }
 *   | { etat: "personne", vert: false, fire?: number }} Top
 */

// Au-delà d'une minute, un déménagement qui n'est pas fini dit ce qui le bloque.
export const ONE_MINUTE_MS = 60_000;

// Le nom sous lequel une station prend les tickets d'un projet : `<machine>/claude`, la machine tirée du nom qu'elle publie
// (`stationOf` de vue/cooks/taken.ts, que la vue redit sans l'importer).
/** @param {string} name */
export const nameOfTaking = (name) => `${name.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station"}/claude`;

// La station appairée d'une ligne de cuisson : celle qui porte son nom, ou dont le nom de prise est le sien.
/** @param {readonly StationVue[]} stations @param {string} name */
const pairedOf = (stations, name) => stations.find((station) => station.nom === name || nameOfTaking(station.nom) === name);

// La box dont une ligne de cuisson est la cuisine du projet, sous un autre nom que sa déclaration (ticket 3868) : la ligne
// dit `<machine>/claude` (`box/claude`), la station s'est inscrite sous un nom qui finit par cette machine (`parade-box`) —
// une seule machine, une seule carte. Elle doit servir le projet, n'être pas un ordinateur, et n'être pas déjà prise.
/** @param {readonly StationVue[]} stations @param {ReadonlySet<string>} taken @param {string} project @param {string} name */
const sameBoxThat = (stations, taken, project, name) => {
  const machine = name.endsWith("/claude") ? name.slice(0, -"/claude".length) : "";
  if (machine === "") return undefined;
  const candidates = stations.filter((station) => !taken.has(station.id) && station.projets.includes(project) && !isOneComputer(station) && nameOfTaking(station.nom).slice(0, -"/claude".length).endsWith(`-${machine}`));
  return candidates.length === 1 ? candidates[0] : undefined;
};

// Une station qui tourne sur un ordinateur — un Mac, un PC —, tel que sa machine le dit (projects.ts, `estUnOrdinateur`, que
// la vue redit sans l'importer) : elle s'arrête avec lui. Une autre est une box, toujours allumée.
/** @param {Pick<StationVue, "machine">} station */
export const isOneComputer = ({ machine }) => /^(macOS|Windows)\b/.test(machine);

// Ce qu'est une station pour le chef : cet ordinateur, un autre ordinateur, ou une box.
/** @param {StationVue} station @param {string | null | undefined} locale @returns {Kind} */
export const kindOf = (station, locale) => (station.id === locale ? "ici" : isOneComputer(station) ? "ordinateur" : "box");

// Les mots d'une ligne de cuisson (cooking.ts) qui disent qu'elle prend les tickets du projet — elle cuit, attend le
// prochain, ou n'a plus de place mais tient les siens. Les autres disent qu'elle ne cuit pas à l'instant : tue, arrêtée,
// que la cuisine ne voit pas, ou qui refuse le projet.
const TAKES = new Set(["cooking", "idle"]);
const REFUSES = "refused";
// Le mot d'une station distante que la cuisine ne voit pas (cooking.ts, `ABSENTE`).
const ABSENT = "not cooking";
export const REFUSING = "refusing it";
// Une station déclarée que rien d'autre ne nomme : elle ne s'est pas encore annoncée.
export const NOT_ANNOUNCED = "not signed in yet";

// Une ligne en ligne : elle prend les tickets et n'est pas dite hors d'atteinte. Au repos, il faut un signe de vie lu : une
// distante dont rien ne dit qu'elle est là n'est pas dite en ligne (la règle du vert de ticket 3189).
/** @param {Pick<LineOfStation, "etat" | "presente" | "distante">} ligne */
export const inLineOf = ({ etat: state, presente, distante: remote }) => TAKES.has(state) && (state === "idle" ? presente === true || (presente === undefined && !remote) : presente !== false);

// Ce que dit une ligne qui sert le projet sans cuire : ce qui l'arrête ; ou, distante, que la cuisine ne la voit pas (ticket 1830) ;
// ou depuis quand elle s'est tue.
/** @param {LineOfStation} ligne @param {number} now */
function outsideLineOf({ etat: state, vueLe: vueThe, dit: said, presente }, now) {
  if (state === "stopped") return `stopped ${said}`.trim();
  const since = vueThe === null || vueThe === undefined ? Number.NaN : Date.parse(vueThe);
  const when = Number.isNaN(since) ? "" : ` for ${durationInClear(now - since)}`;
  return state === ABSENT || (presente === false && state !== "silent") ? `not seen by the kitchen${when}` : `offline${when}`;
}

/**
 * Les stations qui servent le projet, une carte chacune, cet ordinateur d'abord :
 *   - celles que sa cuisson nomme (`lignes`, cooking.ts — ses `facts`, ou ses stations sur GitHub), sauf celles qui le
 *     refusent : en ligne quand elles prennent ses tickets, sinon hors ligne ;
 *   - puis les stations appairées qui disent le servir dans leur document sur GitHub (`StationVue.projets`) ;
 *   - puis celles que le projet déclare (`declarees`, le contrôle de son installation) et que rien d'autre ne nomme :
 *     elles ne se sont pas encore annoncées ;
 *   - enfin la station où sa cuisine déménage (`vers`), qui démarre tant qu'elle ne le sert pas.
 * Une station appairée dite hors ligne l'est, quoi que dise la cuisson. `ici` : le projet cuit sur ce poste — sa station
 * de la box est celle de cet ordinateur (config.ts, `ici`). `lu` : l'instant de la lecture de la cuisson, d'où se compte
 * depuis quand une ligne s'est tue (à défaut, `maintenant`).
 * `iciSert` : ce que la liste de la station de cet ordinateur dit du projet, lue sur ce disque (ticket 3402) — indéfinie
 * si elle ne l'est pas. Elle fait foi pour cet ordinateur, avant que sa station ne publie ce qu'elle sert : sans le
 * projet, cet ordinateur n'a pas de carte ; avec lui, il en a une, au nom de sa station (`hote`, le nom d'hôte que la
 * station publie, à défaut).
 * `redemarre` : la version que la mise à jour de la station de cet ordinateur vise tant qu'elle la redémarre (ticket 3637) :
 * sa carte, hors ligne ou pas encore annoncée, dit « restarting » à la place — elle n'est pas hors ligne, elle se relance.
 * @param {{ projet: string, lignes?: readonly LineOfStation[], stations?: readonly StationVue[], declarees?: readonly { nom: string, distante: boolean }[], locale?: string | null, ici?: boolean, vers?: string, maintenant: number, lu?: number, iciSert?: boolean, hote?: string, redemarre?: string }} lu
 * @returns {Serving[]}
 */
export function servingOf({ projet: project, lignes: lines = [], stations = [], declarees: declaredEntries = [], locale, ici: here = false, vers: to, maintenant: now, lu: readOne = now, iciSert: hereServes, hote: host = THIS_COMPUTER, redemarre: restarts }) {
  /** @type {Serving[]} */
  const servingOnes = [];
  const taken = new Set();
  for (const line of lines) {
    // La station de ce poste, quand le projet cuit ici : la ligne de la box qui n'est pas distante est la sienne, quel que
    // soit le nom sous lequel le journal la déclare — une seule carte pour cet ordinateur.
    const hereSame = here && !line.distante && locale !== null && locale !== undefined && !taken.has(locale) ? stations.find(({ id }) => id === locale) : undefined;
    const pairedOne = pairedOf(stations, line.station) ?? hereSame ?? (line.distante ? sameBoxThat(stations, taken, project, line.station) : undefined);
    if (pairedOne !== undefined) taken.add(pairedOne.id);
    const refuses = line.etat === REFUSES;
    const outsideLine = pairedOne?.etat === "hors-ligne" || !inLineOf(line);
    // En ligne, une station que la limite de GitHub retient
    // (ticket 2443), jusqu'à quand — elle sert ses projets, son signe de vie attend la fin de la limite. Refusant le projet,
    // elle dit pourquoi.
    const note = refuses ? line.dit : outsideLine ? "" : line.retenue !== undefined ? HELD(line.retenue) : "";
    const engine = statusRead(line.engine);
    servingOnes.push({
      id: pairedOne?.id ?? "",
      nom: pairedOne?.nom ?? line.station,
      prise: line.station,
      ici: pairedOne === undefined ? here && !line.distante : pairedOne.id === locale,
      sorte: pairedOne === undefined ? (here && !line.distante ? "ici" : line.distante ? "ordinateur" : "box") : kindOf(pairedOne, locale),
      etat: refuses ? "refuse" : outsideLine ? "hors-ligne" : "en-ligne",
      dit: refuses ? REFUSING : !outsideLine ? "online" : pairedOne?.etat === "hors-ligne" ? pairedOne.dit : outsideLineOf(line, readOne),
      ...(note === "" ? {} : { note }),
      ...(engine === undefined ? {} : { moteur: engine }),
      ...(line.lacks === undefined ? {} : { lacks: line.lacks }),
      cooks: line.cooks,
      agents: line.agents,
    });
  }
  for (const station of stations) {
    if (taken.has(station.id) || !(station.projets.includes(project) || station.nom === to)) continue;
    const serves = station.projets.includes(project);
    servingOnes.push({ id: station.id, nom: station.nom, ici: station.id === locale, sorte: kindOf(station, locale), etat: serves ? station.etat : "demarre", dit: station.dit, cooks: [], agents: [] });
  }
  const named = (/** @type {string} */ name) => lines.some(({ station }) => station === name) || servingOnes.some((servingOne) => servingOne.nom === name || nameOfTaking(servingOne.nom) === name);
  for (const { nom: name, distante: remote } of declaredEntries) {
    if (named(name)) continue;
    servingOnes.push({ id: "", nom: name, ici: here && !remote, sorte: here && !remote ? "ici" : remote ? "ordinateur" : "box", etat: "illisible", dit: NOT_ANNOUNCED, cooks: [], agents: [] });
  }
  if (to !== undefined && !servingOnes.some(({ nom: name }) => name === to)) servingOnes.push({ id: "", nom: to, ici: false, sorte: "ordinateur", etat: "demarre", dit: "", cooks: [], agents: [] });
  // La liste de cet ordinateur fait foi pour lui : retiré, sa carte part ; ajouté, il a la sienne dès qu'elle est écrite.
  // Une cuisine qui tourne ici pour le projet sans qu'il soit sur la liste ne le cuit donc pas (ticket 3399).
  const kept = hereServes === false ? servingOnes.filter((servingOne) => !servingOne.ici) : servingOnes;
  if (hereServes === true && !kept.some((servingOne) => servingOne.ici)) {
    const itsOwnOne = stations.find(({ id }) => id === locale);
    kept.push(
      itsOwnOne === undefined
        ? { id: "", nom: host, ici: true, sorte: "ici", etat: "illisible", dit: NOT_ANNOUNCED, cooks: [], agents: [] }
        : { id: itsOwnOne.id, nom: itsOwnOne.nom, ici: true, sorte: "ici", etat: itsOwnOne.etat, dit: itsOwnOne.dit, cooks: [], agents: [] },
    );
  }
  const relaunched = restarts === undefined ? kept : kept.map((servingOne) => (servingOne.ici && (servingOne.etat === "hors-ligne" || servingOne.etat === "illisible") ? { ...servingOne, etat: /** @type {const} */ ("redemarre"), dit: RESTARTS(restarts) } : servingOne));
  return [...relaunched.filter((servingOne) => servingOne.ici), ...relaunched.filter((servingOne) => !servingOne.ici)];
}

/**
 * Le déménagement que la ligne du haut suit, ou null. `publie` : celui que les stations publient — refusé, il n'est plus en
 * route : sa phrase se dit à part. `demande` : celui que le chef vient de demander d'ici, tant que les stations n'en
 * publient rien ; il est fini quand la station visée sert le projet et que l'autre ne le sert plus. `servantes` : les
 * stations qui le servent (`servantesDe`, sans `vers`) ; `stations` : les appairées, qui disent qui est en ligne.
 * @param {{ publie: MoveInProgress | null | undefined, demande?: { de: string, vers: string, depuis: number }, servantes: readonly Serving[], stations?: readonly StationVue[] }} lu
 * @returns {Displacement | null}
 */
export function displacementTracking({ publie: published, demande: request, servantes: servingOnes, stations = [] }) {
  const inLine = (/** @type {string} */ name) => servingOnes.some((servingOne) => servingOne.nom === name && servingOne.etat === "en-ligne") || stations.some((station) => station.nom === name && station.etat === "en-ligne");
  const serves = (/** @type {string} */ name) => servingOnes.some((servingOne) => servingOne.nom === name && servingOne.etat !== "demarre");
  if (published !== null && published !== undefined && published.etape !== "refusee" && published.etape !== "recue") {
    const since = Date.parse(published.demandeLe);
    return { de: published.de, vers: published.vers, depuis: Number.isNaN(since) ? (request?.depuis ?? 0) : since, etape: published.etape, dit: published.dit, deEnLigne: inLine(published.de), versEnLigne: inLine(published.vers) };
  }
  if (request === undefined || (published !== null && published !== undefined)) return null;
  if (serves(request.vers) && !serves(request.de)) return null;
  return { de: request.de, vers: request.vers, depuis: request.depuis, etape: "demandee", dit: "", deEnLigne: inLine(request.de), versEnLigne: inLine(request.vers) };
}

// Ce qu'un déménagement attend, à son étape.
/** @param {Displacement} deplacement */
export const expectedOf = ({ de: of, vers: to, etape: step }) =>
  step === "acceptee" ? `${of} to close its kitchen` : step === "remise" ? `${to} to open the kitchen` : `${to} to take the kitchen over`;

// Ce qui bloque un déménagement qui n'est pas fini au bout d'une minute : ce que la station en dit, sinon celle des deux qui
// est hors ligne, sinon celle qui ne répond pas, et depuis quand.
/** @param {Displacement} deplacement @param {number} now */
export function blockageOf({ de: of, vers: to, etape: step, dit: said, deEnLigne: ofInLine, versEnLigne: toInLine, depuis: since }, now) {
  if (said.trim() !== "") return said.trim();
  if (!toInLine) return `${to} is offline: it takes the kitchen over when it is back`;
  if (!ofInLine && step !== "remise") return `${of} is offline: it hands its kitchen over when it is back`;
  return `${step === "acceptee" ? of : to} has not answered for ${durationInClear(now - since)}`;
}

/**
 * La ligne du haut, dans exactement un de cinq états. Un déménagement en route l'emporte ; puis le projet éteint (`eteint`, ce
 * que la bande en dit — indéfini quand il est allumé, pas encore lu ou pas lu : ce n'est pas « éteint ») : aucune station ne
 * le cuit, en ligne ou non (ticket 3454) ; puis les stations en ligne qui servent le projet ; puis celles qui le servent,
 * toutes hors ligne ; sinon, personne — et, lu, combien de tickets `fire` attendent sur son rail (`fire`, le compteur « rail »
 * de son tableau).
 * @param {{ servantes: readonly Serving[], deplacement: Displacement | null, maintenant: number, fire?: number, eteint?: { dit: string, releve: string } }} lu
 * @returns {Top}
 */
export function topOf({ servantes: servingOnes, deplacement: displacement, maintenant: now, fire, eteint: off }) {
  if (displacement !== null) {
    const blocked = now - displacement.depuis >= ONE_MINUTE_MS ? blockageOf(displacement, now) : null;
    return { etat: "deplacement", vert: false, de: displacement.de, vers: displacement.vers, attend: expectedOf(displacement), depuis: displacement.depuis, bloque: blocked };
  }
  if (off !== undefined) return { etat: "eteint", vert: false, dit: off.dit, releve: off.releve, servi: servingOnes.some(({ etat: state }) => state !== "demarre") };
  const inLine = servingOnes.filter(({ etat: state }) => state === "en-ligne");
  if (inLine.length > 0) return { etat: "cuit", vert: true, stations: inLine.map(({ nom: name }) => name), cooks: inLine.reduce((sum, { cooks }) => sum + cooks.length, 0) };
  const relaunch = servingOnes.find(({ etat: state }) => state === "redemarre");
  if (relaunch !== undefined) return { etat: "redemarre", vert: false, station: relaunch.nom, dit: relaunch.dit };
  const absent = servingOnes.find(({ etat: state }) => state !== "demarre");
  if (absent !== undefined) return { etat: "hors-ligne", vert: false, station: absent.nom, ici: absent.ici, sorte: absent.sorte, dit: absent.dit };
  return { etat: "personne", vert: false, ...(fire === undefined ? {} : { fire }) };
}

// Les mots de la ligne du haut.
/** @param {number} howMany */
const cooksAtWork = (howMany) => `${howMany} cook${howMany > 1 ? "s" : ""} at work`;
export const AT_REST = "idle, nothing on the rail";
/** @param {readonly string[]} stations @param {number} cooks */
export const COOKED_BY = (stations, cooks) => `Cooked by ${stations.join(", ")} · online · ${cooks === 0 ? AT_REST : cooksAtWork(cooks)}`;
// L'heure d'un instant, telle que l'app la dit ailleurs (project/delay.js) : en UTC.
/** @param {number} instant */
const hour = (instant) => `${new Date(instant).toISOString().slice(11, 16)} UTC`;
/** @param {string} of @param {string} to @param {string} awaiting @param {number} since */
export const IN_DISPLACEMENT = (of, to, awaiting, since) => `Moving from ${of} to ${to}: waiting for ${awaiting}, since ${hour(since)}`;
/** @param {string} blocked */
export const BLOCKED = (blocked) => `Not done after a minute: ${blocked}`;
/** @param {string} station @param {string} said */
export const OUTSIDE_LINE = (station, said) => `${station} cooks this project, but it is ${said}: nothing cooks`;
/** @param {string} version */
export const RESTARTS = (version) => `restarting: update to ${version}`;
/** @param {string} station @param {string} said */
export const IN_RESTART = (station, said) => `${station} cooks this project, it is ${said}`;
export const NOBODY = "No station cooks this project";
// Le projet éteint : la phrase de la bande, celle de la tête du rail, en tête de ligne.
/** @param {string} said */
export const OFF = (said) => `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
/** @param {number} howMany */
export const FIRE_QUEUED = (howMany) => `${howMany} fire ticket${howMany === 1 ? "" : "s"} waiting`;
export const CHOOSE = "Choose who cooks it";
export const TO_HERE = `Move to ${THIS_COMPUTER}`;
export const COOK_HERE = `Cook it on ${THIS_COMPUTER}`;

/** @param {Top} top */
export function sentenceOfTop(top) {
  if (top.etat === "cuit") return COOKED_BY(top.stations, top.cooks);
  if (top.etat === "deplacement") return IN_DISPLACEMENT(top.de, top.vers, top.attend, top.depuis);
  if (top.etat === "eteint") return OFF(top.dit);
  if (top.etat === "hors-ligne") return OUTSIDE_LINE(top.station, top.dit);
  if (top.etat === "redemarre") return IN_RESTART(top.station, top.dit);
  return top.fire === undefined ? NOBODY : `${NOBODY} · ${FIRE_QUEUED(top.fire)}`;
}
