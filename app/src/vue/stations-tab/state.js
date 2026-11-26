// @ts-check
// L'onglet Stations d'un projet (ticket 3195, épique 3194) : qui le cuit, est-ce que ça marche, comment le changer. Ce
// module tient ce que l'onglet dit, sans rien poser : la vue lui donne ce qu'elle a lu, il rend un état.
//   - Les stations qui servent le projet : celles que sa cuisson nomme (cooking.ts) — une qui le refuse comprise : elle est
//     des siennes, et sa carte dit pourquoi elle ne le cuit pas —, et celles qui le disent dans leur document sur GitHub (`StationVue.projets`, stations/stations.ts) — elles seules ont une
//     carte. Une station qui ne le sert pas n'est nommée que comme l'origine d'un déménagement en cours. Celle de cet
//     ordinateur le sert quand sa liste de projets servis porte son dépôt (projects-served/, ticket 3399) : une cuisine qui
//     tourne ici pour le projet sans qu'il soit sur la liste ne le cuit pas, quoi que dise sa ligne de cuisson.
//   - La ligne du haut, dans exactement un de cinq états : `cuit` (une station en ligne le cuit, ou attend son prochain
//     ticket), `deplacement` (un déménagement de sa cuisine en route), `eteint` (le projet est éteint : rien n'y cuit, quoi
//     que disent ses stations — ticket 3454), `hors-ligne` (celles qui le servent sont toutes hors ligne : rien ne cuit),
//     `personne` (aucune ne le sert). Seul `cuit` est vert.
//   - Le déménagement suivi : celui que les stations publient (projects.ts, `demenagementDe`), sinon celui que le chef vient
//     de demander d'ici, tant que la station visée ne le sert pas. Pas fini au bout d'une minute, il dit ce qui le bloque.

import { dureeEnClair } from "../project/delay.js";
import { CET_ORDINATEUR } from "../lexique.js";
import { RETENUE } from "../stations-du-account.js";
import { statusLu } from "../engine/moteurs.js";

/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */
/** @typedef {import("../../projects/projects.ts").DemenagementEnCours} DemenagementEnCours */
/** @typedef {import("../../cooking.ts").LineDeStation} LineDeStation */
/** @typedef {import("../../facts.ts").Cook} Cook */
/** @typedef {import("../../cooking.ts").AgentDeStation} AgentDeStation */

// Ce qu'est une station pour le chef : cet ordinateur, une box toujours allumée, ou un autre ordinateur.
/** @typedef {"ici" | "box" | "ordinateur"} Sorte */
// Son état à l'instant : en ligne, hors ligne (son `dit` dit depuis quand), illisible, qui refuse le projet, ou qui démarre —
// la station où la cuisine déménage, tant qu'elle ne la sert pas encore — ou qui redémarre : la station de cet ordinateur,
// dont la mise à jour remplace le process (ticket 3637), n'est pas hors ligne.
/** @typedef {"en-ligne" | "hors-ligne" | "illisible" | "refuse" | "demarre" | "redemarre"} StateDeStation */
/**
 * Une station qui sert le projet, telle que sa carte la montre : son état et ses mots (`dit`) ; `note` : ce qui la retient
 * encore — sa machine pleine, la limite de GitHub, son refus et sa raison. `cooks`, `agents` : ce qu'elle tient du projet à
 * l'instant. `prise` : le nom sous lequel sa cuisson la nomme (`<machine>/claude`), quand elle la nomme — celui de sa
 * déclaration et de son plafond. `moteur` : l'état de son moteur, tel que sa ligne de cuisson le publie (ticket 3746).
 * @typedef {{ id: string, nom: string, prise?: string, ici: boolean, sorte: Sorte, etat: StateDeStation, dit: string, note?: string, lacks?: string, cooks: Cook[], agents: AgentDeStation[], moteur?: import("../engine/moteurs.js").Status }} Servante
 */
/**
 * Un déménagement en route : d'où, vers où, depuis quand (`depuis`, en ms), son étape, ce que la station en dit (`dit`), et
 * si chacune des deux est en ligne.
 * @typedef {{ de: string, vers: string, depuis: number, etape: "demandee" | "acceptee" | "remise", dit: string, deEnLigne: boolean, versEnLigne: boolean }} Deplacement
 */
/**
 * La ligne du haut. Éteint, `dit` : la phrase de la bande (alerts.ts, `MANAGER_ETEINT`) ; `releve` : la ligne `manager` de la
 * box ; `servi` : une station le sert — « Add a station » plutôt que « Choose who cooks it ».
 * @typedef {{ etat: "cuit", vert: true, stations: string[], cooks: number }
 *   | { etat: "deplacement", vert: false, de: string, vers: string, attend: string, depuis: number, bloque: string | null }
 *   | { etat: "eteint", vert: false, dit: string, releve: string, servi: boolean }
 *   | { etat: "hors-ligne", vert: false, station: string, ici: boolean, sorte: Sorte, dit: string }
 *   | { etat: "redemarre", vert: false, station: string, dit: string }
 *   | { etat: "personne", vert: false, fire?: number }} Haut
 */

// Au-delà d'une minute, un déménagement qui n'est pas fini dit ce qui le bloque.
export const UNE_MINUTE_MS = 60_000;

// Le nom sous lequel une station prend les tickets d'un projet : `<machine>/claude`, la machine tirée du nom qu'elle publie
// (runtime/src/stations-github/stations.ts, `stationDe`, que la vue redit sans l'importer : un test les compare).
/** @param {string} name */
export const nameDeTaking = (name) => `${name.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station"}/claude`;

// La station appairée d'une ligne de cuisson : celle qui porte son nom, ou dont le nom de prise est le sien.
/** @param {readonly StationVue[]} stations @param {string} name */
const appaireeDe = (stations, name) => stations.find((station) => station.nom === name || nameDeTaking(station.nom) === name);

// La box dont une ligne de cuisson est la cuisine du projet, sous un autre nom que sa déclaration (ticket 3868) : la ligne
// dit `<machine>/claude` (`box/claude`), la station s'est inscrite sous un nom qui finit par cette machine (`parade-box`) —
// une seule machine, une seule carte. Elle doit servir le projet, n'être pas un ordinateur, et n'être pas déjà prise.
/** @param {readonly StationVue[]} stations @param {ReadonlySet<string>} prises @param {string} project @param {string} name */
const memeBoxQue = (stations, prises, project, name) => {
  const machine = name.endsWith("/claude") ? name.slice(0, -"/claude".length) : "";
  if (machine === "") return undefined;
  const candidates = stations.filter((station) => !prises.has(station.id) && station.projets.includes(project) && !estUnOrdinateur(station) && nameDeTaking(station.nom).slice(0, -"/claude".length).endsWith(`-${machine}`));
  return candidates.length === 1 ? candidates[0] : undefined;
};

// Une station qui tourne sur un ordinateur — un Mac, un PC —, tel que sa machine le dit (projects.ts, `estUnOrdinateur`, que
// la vue redit sans l'importer) : elle s'arrête avec lui. Une autre est une box, toujours allumée.
/** @param {Pick<StationVue, "machine">} station */
export const estUnOrdinateur = ({ machine }) => /^(macOS|Windows)\b/.test(machine);

// Ce qu'est une station pour le chef : cet ordinateur, un autre ordinateur, ou une box.
/** @param {StationVue} station @param {string | null | undefined} locale @returns {Sorte} */
export const sorteDe = (station, locale) => (station.id === locale ? "ici" : estUnOrdinateur(station) ? "ordinateur" : "box");

// Les mots d'une ligne de cuisson (cooking.ts) qui disent qu'elle prend les tickets du projet — elle cuit, attend le
// prochain, ou n'a plus de place mais tient les siens. Les autres disent qu'elle ne cuit pas à l'instant : tue, arrêtée,
// que la cuisine ne voit pas, ou qui refuse le projet.
const PREND = new Set(["cooking", "idle"]);
const REFUSE = "refused";
// Le mot d'une station distante que la cuisine ne voit pas (cooking.ts, `ABSENTE`).
const ABSENTE = "not cooking";
export const REFUSANT = "refusing it";
// Une station déclarée que rien d'autre ne nomme : elle ne s'est pas encore annoncée.
export const PAS_ANNONCEE = "not signed in yet";

// Une ligne en ligne : elle prend les tickets et n'est pas dite hors d'atteinte. Au repos, il faut un signe de vie lu : une
// distante dont rien ne dit qu'elle est là n'est pas dite en ligne (la règle du vert de ticket 3189).
/** @param {Pick<LineDeStation, "etat" | "presente" | "distante">} ligne */
export const enLineDe = ({ etat: state, presente, distante: remote }) => PREND.has(state) && (state === "idle" ? presente === true || (presente === undefined && !remote) : presente !== false);

// Ce que dit une ligne qui sert le projet sans cuire : ce qui l'arrête ; ou, distante, que la cuisine ne la voit pas (ticket 1830) ;
// ou depuis quand elle s'est tue.
/** @param {LineDeStation} ligne @param {number} maintenant */
function outsideLineDe({ etat: state, vueLe, dit, presente }, maintenant) {
  if (state === "stopped") return `stopped ${dit}`.trim();
  const depuis = vueLe === null || vueLe === undefined ? Number.NaN : Date.parse(vueLe);
  const quand = Number.isNaN(depuis) ? "" : ` for ${dureeEnClair(maintenant - depuis)}`;
  return state === ABSENTE || (presente === false && state !== "silent") ? `not seen by the kitchen${quand}` : `offline${quand}`;
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
 * @param {{ projet: string, lignes?: readonly LineDeStation[], stations?: readonly StationVue[], declarees?: readonly { nom: string, distante: boolean }[], locale?: string | null, ici?: boolean, vers?: string, maintenant: number, lu?: number, iciSert?: boolean, hote?: string, redemarre?: string }} lu
 * @returns {Servante[]}
 */
export function servantesDe({ projet: project, lignes: lines = [], stations = [], declarees = [], locale, ici = false, vers, maintenant, lu = maintenant, iciSert, hote = CET_ORDINATEUR, redemarre }) {
  /** @type {Servante[]} */
  const servantes = [];
  const prises = new Set();
  for (const line of lines) {
    // La station de ce poste, quand le projet cuit ici : la ligne de la box qui n'est pas distante est la sienne, quel que
    // soit le nom sous lequel le journal la déclare — une seule carte pour cet ordinateur.
    const iciMeme = ici && !line.distante && locale !== null && locale !== undefined && !prises.has(locale) ? stations.find(({ id }) => id === locale) : undefined;
    const appairee = appaireeDe(stations, line.station) ?? iciMeme ?? (line.distante ? memeBoxQue(stations, prises, project, line.station) : undefined);
    if (appairee !== undefined) prises.add(appairee.id);
    const refuse = line.etat === REFUSE;
    const outsideLine = appairee?.etat === "hors-ligne" || !enLineDe(line);
    // En ligne, une station que la limite de GitHub retient
    // (ticket 2443), jusqu'à quand — elle sert ses projets, son signe de vie attend la fin de la limite. Refusant le projet,
    // elle dit pourquoi.
    const note = refuse ? line.dit : outsideLine ? "" : line.retenue !== undefined ? RETENUE(line.retenue) : "";
    const engine = statusLu(line.engine);
    servantes.push({
      id: appairee?.id ?? "",
      nom: appairee?.nom ?? line.station,
      prise: line.station,
      ici: appairee === undefined ? ici && !line.distante : appairee.id === locale,
      sorte: appairee === undefined ? (ici && !line.distante ? "ici" : line.distante ? "ordinateur" : "box") : sorteDe(appairee, locale),
      etat: refuse ? "refuse" : outsideLine ? "hors-ligne" : "en-ligne",
      dit: refuse ? REFUSANT : !outsideLine ? "online" : appairee?.etat === "hors-ligne" ? appairee.dit : outsideLineDe(line, lu),
      ...(note === "" ? {} : { note }),
      ...(engine === undefined ? {} : { moteur: engine }),
      ...(line.lacks === undefined ? {} : { lacks: line.lacks }),
      cooks: line.cooks,
      agents: line.agents,
    });
  }
  for (const station of stations) {
    if (prises.has(station.id) || !(station.projets.includes(project) || station.nom === vers)) continue;
    const sert = station.projets.includes(project);
    servantes.push({ id: station.id, nom: station.nom, ici: station.id === locale, sorte: sorteDe(station, locale), etat: sert ? station.etat : "demarre", dit: station.dit, cooks: [], agents: [] });
  }
  const nommee = (/** @type {string} */ name) => lines.some(({ station }) => station === name) || servantes.some((servante) => servante.nom === name || nameDeTaking(servante.nom) === name);
  for (const { nom: name, distante: remote } of declarees) {
    if (nommee(name)) continue;
    servantes.push({ id: "", nom: name, ici: ici && !remote, sorte: ici && !remote ? "ici" : remote ? "ordinateur" : "box", etat: "illisible", dit: PAS_ANNONCEE, cooks: [], agents: [] });
  }
  if (vers !== undefined && !servantes.some(({ nom: name }) => name === vers)) servantes.push({ id: "", nom: vers, ici: false, sorte: "ordinateur", etat: "demarre", dit: "", cooks: [], agents: [] });
  // La liste de cet ordinateur fait foi pour lui : retiré, sa carte part ; ajouté, il a la sienne dès qu'elle est écrite.
  // Une cuisine qui tourne ici pour le projet sans qu'il soit sur la liste ne le cuit donc pas (ticket 3399).
  const gardees = iciSert === false ? servantes.filter((servante) => !servante.ici) : servantes;
  if (iciSert === true && !gardees.some((servante) => servante.ici)) {
    const sienne = stations.find(({ id }) => id === locale);
    gardees.push(
      sienne === undefined
        ? { id: "", nom: hote, ici: true, sorte: "ici", etat: "illisible", dit: PAS_ANNONCEE, cooks: [], agents: [] }
        : { id: sienne.id, nom: sienne.nom, ici: true, sorte: "ici", etat: sienne.etat, dit: sienne.dit, cooks: [], agents: [] },
    );
  }
  const relancees = redemarre === undefined ? gardees : gardees.map((servante) => (servante.ici && (servante.etat === "hors-ligne" || servante.etat === "illisible") ? { ...servante, etat: /** @type {const} */ ("redemarre"), dit: REDEMARRE(redemarre) } : servante));
  return [...relancees.filter((servante) => servante.ici), ...relancees.filter((servante) => !servante.ici)];
}

/**
 * Le déménagement que la ligne du haut suit, ou null. `publie` : celui que les stations publient — refusé, il n'est plus en
 * route : sa phrase se dit à part. `demande` : celui que le chef vient de demander d'ici, tant que les stations n'en
 * publient rien ; il est fini quand la station visée sert le projet et que l'autre ne le sert plus. `servantes` : les
 * stations qui le servent (`servantesDe`, sans `vers`) ; `stations` : les appairées, qui disent qui est en ligne.
 * @param {{ publie: DemenagementEnCours | null | undefined, demande?: { de: string, vers: string, depuis: number }, servantes: readonly Servante[], stations?: readonly StationVue[] }} lu
 * @returns {Deplacement | null}
 */
export function deplacementSuivi({ publie: published, demande: request, servantes, stations = [] }) {
  const enLine = (/** @type {string} */ name) => servantes.some((servante) => servante.nom === name && servante.etat === "en-ligne") || stations.some((station) => station.nom === name && station.etat === "en-ligne");
  const sert = (/** @type {string} */ name) => servantes.some((servante) => servante.nom === name && servante.etat !== "demarre");
  if (published !== null && published !== undefined && published.etape !== "refusee" && published.etape !== "recue") {
    const depuis = Date.parse(published.demandeLe);
    return { de: published.de, vers: published.vers, depuis: Number.isNaN(depuis) ? (request?.depuis ?? 0) : depuis, etape: published.etape, dit: published.dit, deEnLigne: enLine(published.de), versEnLigne: enLine(published.vers) };
  }
  if (request === undefined || (published !== null && published !== undefined)) return null;
  if (sert(request.vers) && !sert(request.de)) return null;
  return { de: request.de, vers: request.vers, depuis: request.depuis, etape: "demandee", dit: "", deEnLigne: enLine(request.de), versEnLigne: enLine(request.vers) };
}

// Ce qu'un déménagement attend, à son étape.
/** @param {Deplacement} deplacement */
export const attenduDe = ({ de, vers, etape: step }) =>
  step === "acceptee" ? `${de} to close its kitchen` : step === "remise" ? `${vers} to open the kitchen` : `${vers} to take the kitchen over`;

// Ce qui bloque un déménagement qui n'est pas fini au bout d'une minute : ce que la station en dit, sinon celle des deux qui
// est hors ligne, sinon celle qui ne répond pas, et depuis quand.
/** @param {Deplacement} deplacement @param {number} maintenant */
export function blockageDe({ de, vers, etape: step, dit, deEnLigne: deEnLine, versEnLigne: versEnLine, depuis }, maintenant) {
  if (dit.trim() !== "") return dit.trim();
  if (!versEnLine) return `${vers} is offline: it takes the kitchen over when it is back`;
  if (!deEnLine && step !== "remise") return `${de} is offline: it hands its kitchen over when it is back`;
  return `${step === "acceptee" ? de : vers} has not answered for ${dureeEnClair(maintenant - depuis)}`;
}

/**
 * La ligne du haut, dans exactement un de cinq états. Un déménagement en route l'emporte ; puis le projet éteint (`eteint`, ce
 * que la bande en dit — indéfini quand il est allumé, pas encore lu ou pas lu : ce n'est pas « éteint ») : aucune station ne
 * le cuit, en ligne ou non (ticket 3454) ; puis les stations en ligne qui servent le projet ; puis celles qui le servent,
 * toutes hors ligne ; sinon, personne — et, lu, combien de tickets `fire` attendent sur son rail (`fire`, le compteur « rail »
 * de son tableau).
 * @param {{ servantes: readonly Servante[], deplacement: Deplacement | null, maintenant: number, fire?: number, eteint?: { dit: string, releve: string } }} lu
 * @returns {Haut}
 */
export function hautDe({ servantes, deplacement, maintenant, fire, eteint }) {
  if (deplacement !== null) {
    const blocked = maintenant - deplacement.depuis >= UNE_MINUTE_MS ? blockageDe(deplacement, maintenant) : null;
    return { etat: "deplacement", vert: false, de: deplacement.de, vers: deplacement.vers, attend: attenduDe(deplacement), depuis: deplacement.depuis, bloque: blocked };
  }
  if (eteint !== undefined) return { etat: "eteint", vert: false, dit: eteint.dit, releve: eteint.releve, servi: servantes.some(({ etat: state }) => state !== "demarre") };
  const enLine = servantes.filter(({ etat: state }) => state === "en-ligne");
  if (enLine.length > 0) return { etat: "cuit", vert: true, stations: enLine.map(({ nom: name }) => name), cooks: enLine.reduce((somme, { cooks }) => somme + cooks.length, 0) };
  const relance = servantes.find(({ etat: state }) => state === "redemarre");
  if (relance !== undefined) return { etat: "redemarre", vert: false, station: relance.nom, dit: relance.dit };
  const absente = servantes.find(({ etat: state }) => state !== "demarre");
  if (absente !== undefined) return { etat: "hors-ligne", vert: false, station: absente.nom, ici: absente.ici, sorte: absente.sorte, dit: absente.dit };
  return { etat: "personne", vert: false, ...(fire === undefined ? {} : { fire }) };
}

// Les mots de la ligne du haut.
/** @param {number} combien */
const cooksAuTravail = (combien) => `${combien} cook${combien > 1 ? "s" : ""} at work`;
export const AU_REPOS = "idle, nothing on the rail";
/** @param {readonly string[]} stations @param {number} cooks */
export const CUIT_PAR = (stations, cooks) => `Cooked by ${stations.join(", ")} · online · ${cooks === 0 ? AU_REPOS : cooksAuTravail(cooks)}`;
// L'heure d'un instant, telle que l'app la dit ailleurs (project/delay.js) : en UTC.
/** @param {number} instant */
const heure = (instant) => `${new Date(instant).toISOString().slice(11, 16)} UTC`;
/** @param {string} de @param {string} vers @param {string} awaiting @param {number} depuis */
export const EN_DEPLACEMENT = (de, vers, awaiting, depuis) => `Moving from ${de} to ${vers}: waiting for ${awaiting}, since ${heure(depuis)}`;
/** @param {string} blocked */
export const BLOCKED = (blocked) => `Not done after a minute: ${blocked}`;
/** @param {string} station @param {string} dit */
export const OUTSIDE_LINE = (station, dit) => `${station} cooks this project, but it is ${dit}: nothing cooks`;
/** @param {string} version */
export const REDEMARRE = (version) => `restarting: update to ${version}`;
/** @param {string} station @param {string} dit */
export const EN_REDEMARRAGE = (station, dit) => `${station} cooks this project, it is ${dit}`;
export const PERSONNE = "No station cooks this project";
// Le projet éteint : la phrase de la bande, celle de la tête du rail, en tête de ligne.
/** @param {string} dit */
export const ETEINT = (dit) => `${dit.charAt(0).toUpperCase()}${dit.slice(1)}`;
/** @param {number} combien */
export const FIRE_QUEUED = (combien) => `${combien} fire ticket${combien === 1 ? "" : "s"} waiting`;
export const CHOISIR = "Choose who cooks it";
export const VERS_ICI = `Move to ${CET_ORDINATEUR}`;
export const CUIRE_ICI = `Cook it on ${CET_ORDINATEUR}`;

/** @param {Haut} haut */
export function phraseDuHaut(haut) {
  if (haut.etat === "cuit") return CUIT_PAR(haut.stations, haut.cooks);
  if (haut.etat === "deplacement") return EN_DEPLACEMENT(haut.de, haut.vers, haut.attend, haut.depuis);
  if (haut.etat === "eteint") return ETEINT(haut.dit);
  if (haut.etat === "hors-ligne") return OUTSIDE_LINE(haut.station, haut.dit);
  if (haut.etat === "redemarre") return EN_REDEMARRAGE(haut.station, haut.dit);
  return haut.fire === undefined ? PERSONNE : `${PERSONNE} · ${FIRE_QUEUED(haut.fire)}`;
}
