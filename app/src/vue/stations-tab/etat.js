// @ts-check
// L'onglet Stations d'un projet (ticket 3195, épique 3194) : qui le cuit, est-ce que ça marche, comment le changer. Ce
// module tient ce que l'onglet dit, sans rien poser : la vue lui donne ce qu'elle a lu, il rend un état.
//   - Les stations qui servent le projet : celles que sa cuisson nomme (cuisson.ts) — une qui le refuse comprise : elle est
//     des siennes, et sa carte dit pourquoi elle ne le cuit pas —, et celles qui le disent dans leur document sur GitHub (`StationVue.projets`, stations/stations.ts) — elles seules ont une
//     carte. Une station qui ne le sert pas n'est nommée que comme l'origine d'un déménagement en cours.
//   - La ligne du haut, dans exactement un de quatre états : `cuit` (une station en ligne le cuit, ou attend son prochain
//     ticket), `deplacement` (un déménagement de sa cuisine en route), `hors-ligne` (celles qui le servent sont toutes hors
//     ligne : rien ne cuit), `personne` (aucune ne le sert). Seul `cuit` est vert.
//   - Le déménagement suivi : celui que les stations publient (projets.ts, `demenagementDe`), sinon celui que le chef vient
//     de demander d'ici, tant que la station visée ne le sert pas. Pas fini au bout d'une minute, il dit ce qui le bloque.

import { dureeEnClair } from "../projet/delai.js";
import { CET_ORDINATEUR } from "../lexique.js";
import { RETENUE } from "../stations-du-compte.js";

/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */
/** @typedef {import("../../projets/projets.ts").DemenagementEnCours} DemenagementEnCours */
/** @typedef {import("../../cuisson.ts").LigneDeStation} LigneDeStation */
/** @typedef {import("../../faits.ts").Cook} Cook */
/** @typedef {import("../../cuisson.ts").AgentDeStation} AgentDeStation */

// Ce qu'est une station pour le chef : cet ordinateur, une box toujours allumée, ou un autre ordinateur.
/** @typedef {"ici" | "box" | "ordinateur"} Sorte */
// Son état à l'instant : en ligne, hors ligne (son `dit` dit depuis quand), illisible, qui refuse le projet, ou qui démarre —
// la station où la cuisine déménage, tant qu'elle ne la sert pas encore.
/** @typedef {"en-ligne" | "hors-ligne" | "illisible" | "refuse" | "demarre"} EtatDeStation */
/**
 * Une station qui sert le projet, telle que sa carte la montre : son état et ses mots (`dit`) ; `note` : ce qui la retient
 * encore — sa machine pleine, la limite de GitHub, son refus et sa raison. `cooks`, `agents` : ce qu'elle tient du projet à
 * l'instant. `prise` : le nom sous lequel sa cuisson la nomme (`<machine>/claude`), quand elle la nomme — celui de sa
 * déclaration et de son plafond.
 * @typedef {{ id: string, nom: string, prise?: string, ici: boolean, sorte: Sorte, etat: EtatDeStation, dit: string, note?: string, cooks: Cook[], agents: AgentDeStation[] }} Servante
 */
/**
 * Un déménagement en route : d'où, vers où, depuis quand (`depuis`, en ms), son étape, ce que la station en dit (`dit`), et
 * si chacune des deux est en ligne.
 * @typedef {{ de: string, vers: string, depuis: number, etape: "demandee" | "acceptee" | "remise", dit: string, deEnLigne: boolean, versEnLigne: boolean }} Deplacement
 */
/**
 * La ligne du haut.
 * @typedef {{ etat: "cuit", vert: true, stations: string[], cooks: number }
 *   | { etat: "deplacement", vert: false, de: string, vers: string, attend: string, depuis: number, bloque: string | null }
 *   | { etat: "hors-ligne", vert: false, station: string, ici: boolean, sorte: Sorte, dit: string }
 *   | { etat: "personne", vert: false }} Haut
 */

// Au-delà d'une minute, un déménagement qui n'est pas fini dit ce qui le bloque.
export const UNE_MINUTE_MS = 60_000;

// Le nom sous lequel une station prend les tickets d'un projet : `<machine>/claude`, la machine tirée du nom qu'elle publie
// (runtime/src/stations-github/stations.ts, `stationDe`, que la vue redit sans l'importer : un test les compare).
/** @param {string} nom */
export const nomDePrise = (nom) => `${nom.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station"}/claude`;

// La station appairée d'une ligne de cuisson : celle qui porte son nom, ou dont le nom de prise est le sien.
/** @param {readonly StationVue[]} stations @param {string} nom */
const appaireeDe = (stations, nom) => stations.find((station) => station.nom === nom || nomDePrise(station.nom) === nom);

// Une station qui tourne sur un ordinateur — un Mac, un PC —, tel que sa machine le dit (projets.ts, `estUnOrdinateur`, que
// la vue redit sans l'importer) : elle s'arrête avec lui. Une autre est une box, toujours allumée.
/** @param {Pick<StationVue, "machine">} station */
export const estUnOrdinateur = ({ machine }) => /^(macOS|Windows)\b/.test(machine);

// Ce qu'est une station pour le chef : cet ordinateur, un autre ordinateur, ou une box.
/** @param {StationVue} station @param {string | null | undefined} locale @returns {Sorte} */
export const sorteDe = (station, locale) => (station.id === locale ? "ici" : estUnOrdinateur(station) ? "ordinateur" : "box");

// Les mots d'une ligne de cuisson (cuisson.ts) qui disent qu'elle prend les tickets du projet — elle cuit, attend le
// prochain, ou n'a plus de place mais tient les siens. Les autres disent qu'elle ne cuit pas à l'instant : tue, arrêtée,
// que la cuisine ne voit pas, ou qui refuse le projet.
const PREND = new Set(["cooking", "idle", "saturated"]);
const REFUSE = "refused";
// Le mot d'une station distante que la cuisine ne voit pas (cuisson.ts, `ABSENTE`).
const ABSENTE = "not cooking";
export const REFUSANT = "refusing it";
// Une station déclarée que rien d'autre ne nomme : elle ne s'est pas encore annoncée.
export const PAS_ANNONCEE = "not signed in yet";

// Une ligne en ligne : elle prend les tickets et n'est pas dite hors d'atteinte. Au repos, il faut un signe de vie lu : une
// distante dont rien ne dit qu'elle est là n'est pas dite en ligne (la règle du vert de ticket 3189).
/** @param {Pick<LigneDeStation, "etat" | "presente" | "distante">} ligne */
export const enLigneDe = ({ etat, presente, distante }) => PREND.has(etat) && (etat === "idle" ? presente === true || (presente === undefined && !distante) : presente !== false);

// Ce que dit une ligne qui sert le projet sans cuire : ce qui l'arrête ; ou, distante, que la cuisine ne la voit pas (ticket 1830) ;
// ou depuis quand elle s'est tue.
/** @param {LigneDeStation} ligne @param {number} maintenant */
function horsLigneDe({ etat, vueLe, dit, presente }, maintenant) {
  if (etat === "stopped") return `stopped ${dit}`.trim();
  const depuis = vueLe === null || vueLe === undefined ? Number.NaN : Date.parse(vueLe);
  const quand = Number.isNaN(depuis) ? "" : ` for ${dureeEnClair(maintenant - depuis)}`;
  return etat === ABSENTE || (presente === false && etat !== "silent") ? `not seen by the kitchen${quand}` : `offline${quand}`;
}

/**
 * Les stations qui servent le projet, une carte chacune, cet ordinateur d'abord :
 *   - celles que sa cuisson nomme (`lignes`, cuisson.ts — ses `facts`, ou ses stations sur GitHub), sauf celles qui le
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
 * @param {{ projet: string, lignes?: readonly LigneDeStation[], stations?: readonly StationVue[], declarees?: readonly { nom: string, distante: boolean }[], locale?: string | null, ici?: boolean, vers?: string, maintenant: number, lu?: number, iciSert?: boolean, hote?: string }} lu
 * @returns {Servante[]}
 */
export function servantesDe({ projet, lignes = [], stations = [], declarees = [], locale, ici = false, vers, maintenant, lu = maintenant, iciSert, hote = CET_ORDINATEUR }) {
  /** @type {Servante[]} */
  const servantes = [];
  const prises = new Set();
  for (const ligne of lignes) {
    // La station de ce poste, quand le projet cuit ici : la ligne de la box qui n'est pas distante est la sienne, quel que
    // soit le nom sous lequel le journal la déclare — une seule carte pour cet ordinateur.
    const iciMeme = ici && !ligne.distante && locale !== null && locale !== undefined && !prises.has(locale) ? stations.find(({ id }) => id === locale) : undefined;
    const appairee = appaireeDe(stations, ligne.station) ?? iciMeme;
    if (appairee !== undefined) prises.add(appairee.id);
    const refuse = ligne.etat === REFUSE;
    const horsLigne = appairee?.etat === "hors-ligne" || !enLigneDe(ligne);
    // En ligne, une station saturée dit que sa machine n'a plus de place (cuisson.ts) ; une que la limite de GitHub retient
    // (ticket 2443), jusqu'à quand — elle sert ses projets, son signe de vie attend la fin de la limite. Refusant le projet,
    // elle dit pourquoi.
    const note = refuse ? ligne.dit : horsLigne ? "" : ligne.retenue !== undefined ? RETENUE(ligne.retenue) : ligne.etat === "saturated" ? ligne.dit : "";
    servantes.push({
      id: appairee?.id ?? "",
      nom: appairee?.nom ?? ligne.station,
      prise: ligne.station,
      ici: appairee === undefined ? ici && !ligne.distante : appairee.id === locale,
      sorte: appairee === undefined ? (ici && !ligne.distante ? "ici" : ligne.distante ? "ordinateur" : "box") : sorteDe(appairee, locale),
      etat: refuse ? "refuse" : horsLigne ? "hors-ligne" : "en-ligne",
      dit: refuse ? REFUSANT : !horsLigne ? "online" : appairee?.etat === "hors-ligne" ? appairee.dit : horsLigneDe(ligne, lu),
      ...(note === "" ? {} : { note }),
      cooks: ligne.cooks,
      agents: ligne.agents,
    });
  }
  for (const station of stations) {
    if (prises.has(station.id) || !(station.projets.includes(projet) || station.nom === vers)) continue;
    const sert = station.projets.includes(projet);
    servantes.push({ id: station.id, nom: station.nom, ici: station.id === locale, sorte: sorteDe(station, locale), etat: sert ? station.etat : "demarre", dit: station.dit, cooks: [], agents: [] });
  }
  const nommee = (/** @type {string} */ nom) => lignes.some(({ station }) => station === nom) || servantes.some((servante) => servante.nom === nom || nomDePrise(servante.nom) === nom);
  for (const { nom, distante } of declarees) {
    if (nommee(nom)) continue;
    servantes.push({ id: "", nom, ici: ici && !distante, sorte: ici && !distante ? "ici" : distante ? "ordinateur" : "box", etat: "illisible", dit: PAS_ANNONCEE, cooks: [], agents: [] });
  }
  if (vers !== undefined && !servantes.some(({ nom }) => nom === vers)) servantes.push({ id: "", nom: vers, ici: false, sorte: "ordinateur", etat: "demarre", dit: "", cooks: [], agents: [] });
  // La liste de cet ordinateur fait foi pour lui : retiré, sa carte part ; ajouté, il a la sienne dès qu'elle est écrite.
  const gardees = iciSert === false ? servantes.filter((servante) => !servante.ici) : servantes;
  if (iciSert === true && !gardees.some((servante) => servante.ici)) {
    const sienne = stations.find(({ id }) => id === locale);
    gardees.push(
      sienne === undefined
        ? { id: "", nom: hote, ici: true, sorte: "ici", etat: "illisible", dit: PAS_ANNONCEE, cooks: [], agents: [] }
        : { id: sienne.id, nom: sienne.nom, ici: true, sorte: "ici", etat: sienne.etat, dit: sienne.dit, cooks: [], agents: [] },
    );
  }
  return [...gardees.filter((servante) => servante.ici), ...gardees.filter((servante) => !servante.ici)];
}

/**
 * Le déménagement que la ligne du haut suit, ou null. `publie` : celui que les stations publient — refusé, il n'est plus en
 * route : sa phrase se dit à part. `demande` : celui que le chef vient de demander d'ici, tant que les stations n'en
 * publient rien ; il est fini quand la station visée sert le projet et que l'autre ne le sert plus. `servantes` : les
 * stations qui le servent (`servantesDe`, sans `vers`) ; `stations` : les appairées, qui disent qui est en ligne.
 * @param {{ publie: DemenagementEnCours | null | undefined, demande?: { de: string, vers: string, depuis: number }, servantes: readonly Servante[], stations?: readonly StationVue[] }} lu
 * @returns {Deplacement | null}
 */
export function deplacementSuivi({ publie, demande, servantes, stations = [] }) {
  const enLigne = (/** @type {string} */ nom) => servantes.some((servante) => servante.nom === nom && servante.etat === "en-ligne") || stations.some((station) => station.nom === nom && station.etat === "en-ligne");
  const sert = (/** @type {string} */ nom) => servantes.some((servante) => servante.nom === nom && servante.etat !== "demarre");
  if (publie !== null && publie !== undefined && publie.etape !== "refusee" && publie.etape !== "recue") {
    const depuis = Date.parse(publie.demandeLe);
    return { de: publie.de, vers: publie.vers, depuis: Number.isNaN(depuis) ? (demande?.depuis ?? 0) : depuis, etape: publie.etape, dit: publie.dit, deEnLigne: enLigne(publie.de), versEnLigne: enLigne(publie.vers) };
  }
  if (demande === undefined || (publie !== null && publie !== undefined)) return null;
  if (sert(demande.vers) && !sert(demande.de)) return null;
  return { de: demande.de, vers: demande.vers, depuis: demande.depuis, etape: "demandee", dit: "", deEnLigne: enLigne(demande.de), versEnLigne: enLigne(demande.vers) };
}

// Ce qu'un déménagement attend, à son étape.
/** @param {Deplacement} deplacement */
export const attenduDe = ({ de, vers, etape }) =>
  etape === "acceptee" ? `${de} to close its kitchen` : etape === "remise" ? `${vers} to open the kitchen` : `${vers} to take the kitchen over`;

// Ce qui bloque un déménagement qui n'est pas fini au bout d'une minute : ce que la station en dit, sinon celle des deux qui
// est hors ligne, sinon celle qui ne répond pas, et depuis quand.
/** @param {Deplacement} deplacement @param {number} maintenant */
export function blocageDe({ de, vers, etape, dit, deEnLigne, versEnLigne, depuis }, maintenant) {
  if (dit.trim() !== "") return dit.trim();
  if (!versEnLigne) return `${vers} is offline: it takes the kitchen over when it is back`;
  if (!deEnLigne && etape !== "remise") return `${de} is offline: it hands its kitchen over when it is back`;
  return `${etape === "acceptee" ? de : vers} has not answered for ${dureeEnClair(maintenant - depuis)}`;
}

/**
 * La ligne du haut, dans exactement un de quatre états. Un déménagement en route l'emporte ; puis les stations en ligne qui
 * servent le projet ; puis celles qui le servent, toutes hors ligne ; sinon, personne.
 * @param {{ servantes: readonly Servante[], deplacement: Deplacement | null, maintenant: number }} lu
 * @returns {Haut}
 */
export function hautDe({ servantes, deplacement, maintenant }) {
  if (deplacement !== null) {
    const bloque = maintenant - deplacement.depuis >= UNE_MINUTE_MS ? blocageDe(deplacement, maintenant) : null;
    return { etat: "deplacement", vert: false, de: deplacement.de, vers: deplacement.vers, attend: attenduDe(deplacement), depuis: deplacement.depuis, bloque };
  }
  const enLigne = servantes.filter(({ etat }) => etat === "en-ligne");
  if (enLigne.length > 0) return { etat: "cuit", vert: true, stations: enLigne.map(({ nom }) => nom), cooks: enLigne.reduce((somme, { cooks }) => somme + cooks.length, 0) };
  const absente = servantes.find(({ etat }) => etat !== "demarre");
  if (absente !== undefined) return { etat: "hors-ligne", vert: false, station: absente.nom, ici: absente.ici, sorte: absente.sorte, dit: absente.dit };
  return { etat: "personne", vert: false };
}

// Les mots de la ligne du haut.
/** @param {number} combien */
const cooksAuTravail = (combien) => `${combien} cook${combien > 1 ? "s" : ""} at work`;
export const AU_REPOS = "idle, nothing on the rail";
/** @param {readonly string[]} stations @param {number} cooks */
export const CUIT_PAR = (stations, cooks) => `Cooked by ${stations.join(", ")} · online · ${cooks === 0 ? AU_REPOS : cooksAuTravail(cooks)}`;
// L'heure d'un instant, telle que l'app la dit ailleurs (projet/delai.js) : en UTC.
/** @param {number} instant */
const heure = (instant) => `${new Date(instant).toISOString().slice(11, 16)} UTC`;
/** @param {string} de @param {string} vers @param {string} attend @param {number} depuis */
export const EN_DEPLACEMENT = (de, vers, attend, depuis) => `Moving from ${de} to ${vers}: waiting for ${attend}, since ${heure(depuis)}`;
/** @param {string} bloque */
export const BLOQUE = (bloque) => `Not done after a minute: ${bloque}`;
/** @param {string} station @param {string} dit */
export const HORS_LIGNE = (station, dit) => `${station} cooks this project, but it is ${dit}: nothing cooks`;
export const PERSONNE = "Nobody cooks this project";
export const CHOISIR = "Choose who cooks it";
export const VERS_ICI = `Move to ${CET_ORDINATEUR}`;

/** @param {Haut} haut */
export function phraseDuHaut(haut) {
  if (haut.etat === "cuit") return CUIT_PAR(haut.stations, haut.cooks);
  if (haut.etat === "deplacement") return EN_DEPLACEMENT(haut.de, haut.vers, haut.attend, haut.depuis);
  if (haut.etat === "hors-ligne") return HORS_LIGNE(haut.station, haut.dit);
  return PERSONNE;
}
