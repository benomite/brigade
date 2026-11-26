// @ts-check
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, épique 1702), dans la liste des stations de
// l'accueil : une machine s'y lit une fois (ticket 1778, épique 1777). Une machine appairée s'y dit par sa présence
// (home.ts), à laquelle son enregistrement ajoute les projets choisis pour elle (`ligneFondue`) : il ne pose ni seconde
// ligne, ni section à part — il n'est que la façon dont la machine est arrivée (`uneLigneParMachine`), et ce qui lui est
// choisi ; ses cases s'ouvrent d'un bouton à côté de sa ligne. Une machine seulement enregistrée a sa ligne d'après son
// enregistrement — sa pastille, son nom, en ligne ou non, les projets qu'elle sert — ; un clic l'ouvre sur les projets
// du chef, à cocher : ceux qu'elle doit servir (ticket 1780). Ce sont les projets que la brigade connaît déjà — ceux de
// l'app, ceux que ses stations servent ou qui leur sont choisis — parmi les dépôts que le compte atteint ; tout autre dépôt
// ne s'ajoute que par le champ de recherche, qui ne montre que ceux dont le nom contient ce qui est tapé — jamais la liste
// entière. Ajouté, il est choisi pour la station, et rejoint les projets du chef. Une case cochée ou décochée s'écrit aussitôt dans le gist de la station
// (stations-du-account.ts, selon le contrat de runtime/src/enregistrement-station/README.md) ; relue au lancement
// suivant, la sélection est celle qui a été écrite. Une station hors ligne se dit telle, et ses cases restent à cocher :
// elle sert ce qui est choisi à son retour.
// Sous la liste, ce que la lecture du compte a de plus à dire (`lectureDuCompte`) : sans aucune station, la commande
// d'installation, que copie un bouton ; une connexion à GitHub qui manque, le bouton du premier lancement
// (first-launch.js) ; une lecture qui échoue, une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction, caseACocher, survol } from "./briques.js";
import { lineError } from "./composants/line-error/line-error.js";
import { buttonDeLaPage, connectionDite, actions, phraseEtDetail } from "./journey-project/connection.js";
import { button as buttonDeLaFamille } from "./composants/button/button.js";
import { lineEmpty } from "./composants/line-empty/line-empty.js";
import { PAS_ENCORE, READ_DE, ENREGISTREMENT } from "./lexique.js";
import { outsideLineDuAccount } from "./choice-station/choice-station.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../stations-du-account.ts").StationsDuAccount} StationsDuAccount */
/** @typedef {import("../stations-du-account.ts").StationEnregistree} StationEnregistree */
/** @typedef {import("../projects/github.ts").RepositoryDuChef} RepositoryDuChef */
/** @typedef {import("./first-launch.js").StateDuFirst["connexion"]} Connection */

// Ce que la vue tient du bloc. `stations` : absentes, leur lecture est en route. `envoi` : la station dont la sélection
// s'écrit. `refus` : pourquoi la dernière écriture n'a pas eu lieu. `copiee` : la commande d'installation que le bouton vient
// de copier. `connexion` : la connexion à GitHub lancée. `attendus` : les dépôts que le chef vient de choisir pour une
// station, dont elle n'a pas encore dit ce qu'elle fait (ticket 1790).
/**
 * @typedef {{
 *   stations?: StationsDuAccount,
 *   envoi?: string,
 *   refus?: { id: string, refus: string, detail?: string },
 *   copiee?: string,
 *   connexion?: Connection,
 *   attendus?: { id: string, depots: readonly string[] },
 * }} StateDuAccount
 */
/**
 * @typedef {{
 *   ouvrirLaStation: (id: string) => void,
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   copier: (command: string) => void,
 * }} ActionsDuAccount
 */

export const AUCUNE = `${PAS_ENCORE("station")} Install one on the machine that will cook.`;
export const AUCUNE_AIDE = "The installer asks that machine to sign in to GitHub: sign it in to this same account, and the station appears here within a minute.";
export const ILLISIBLES = "your stations could not be read";
export const RELIRE = "read again";
export const COPIER = "copy";
export const COPIEE = "copied";
// Les mots de l'état d'une machine, ceux de sa ligne quand elle est appairée (stations/stations.ts, `etatDe`).
export const EN_LINE = "online";
export const OUTSIDE_LINE = "offline";
// Une station que la limite de GitHub retient (ticket 2443) : elle est là, ses appels attendent la fin de la limite — son
// signe de vie ne bouge plus d'ici là. Ni « online », ni « offline » : elle garde ses projets. L'heure est celle du chef.
/** @param {string} jusqua */
export const RETENUE = (jusqua) => {
  const d = new Date(jusqua);
  return `held by GitHub's limit until ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// L'état d'une station du compte, en mots : retenue par la limite de GitHub, en ligne, ou hors ligne.
/** @param {Pick<StationEnregistree, "available" | "heldUntil">} station */
export const stateDit = (station) => (station.heldUntil ? RETENUE(station.heldUntil) : station.available ? EN_LINE : OUTSIDE_LINE);
// Le ton de sa pastille : vert en ligne, jaune retenue, gris hors ligne.
/** @param {Pick<StationEnregistree, "available" | "heldUntil">} station */
export const tonDe = (station) => (station.heldUntil ? "jaune" : station.available ? "vert" : "gris");
// Ce qu'une station a fait d'un dépôt coché pour elle qu'une autre servait déjà (ticket 1790, l'ancien runtime/src/projets/rejoindre.ts, retiré par le ticket 2713),
// sous sa case : elle cuit dans la cuisine qui tourne, ou elle refuse — sa phrase dessous, en entier. Tant qu'elle ne l'a pas
// lu, la case dit qu'elle va répondre.
/** @param {string} principale */
export const REJOINTE = (principale) => `cooks in ${principale}'s kitchen`;
export const REFUSEE = "refused";
export const DEMANDEE = "asked: the station answers within a minute";

// Ce qu'une station a fait d'un dépôt choisi pour elle, tel que son gist le dit (stations-du-account.ts, `ajouts`) — rien tant
// qu'elle ne l'a pas lu.
/** @param {StationEnregistree | undefined} station @param {string} repository */
export function issueDeLAddition(station, repository) {
  return (station?.ajouts ?? []).find((addition) => addition.depot.toLowerCase() === repository.toLowerCase());
}

// Ce que les stations du compte ont fait d'un projet qui leur a été choisi alors qu'une autre le servait déjà (ticket
// 1790) : celles qui ont rejoint sa cuisine, avec la station qui la fait tourner ; celles qui refusent, avec leur phrase.
// Le projet se reconnaît à son dépôt ; sans dépôt connu, au nom que la station tire du dépôt choisi. Un dépôt décoché
// depuis n'en dit plus rien.
/** @param {StationsDuAccount | undefined} lues @param {{ nom: string, depot: string }} projet */
export function ajoutsDuProject(lues, { nom: name, depot: repository }) {
  /** @type {{ station: StationEnregistree, principale: string }[]} */
  const rejointes = [];
  /** @type {{ station: StationEnregistree, phrase: string }[]} */
  const refusees = [];
  if (lues?.state !== "listed") return { rejointes, refusees };
  const estLeSien = (/** @type {string} */ choisi) => (repository === "" ? (choisi.split("/")[1] ?? "").toLowerCase() === name : choisi.toLowerCase() === repository.toLowerCase());
  for (const station of lues.stations) {
    for (const choisi of (station.selection ?? []).filter(estLeSien)) {
      const issue = issueDeLAddition(station, choisi);
      if (issue?.issue === "rejointe") rejointes.push({ station, principale: issue.principale });
      if (issue?.issue === "refusee") refusees.push({ station, phrase: issue.phrase });
    }
  }
  return { rejointes, refusees };
}

// La commande d'installation d'une station, selon le système de la machine qui cuit (docs/installation-station.md).
/** @type {readonly { systeme: string, commande: string }[]} */
export const INSTALLER = [
  { systeme: "Linux or macOS", commande: "curl -fsSL https://github.com/benomite/brigade/releases/download/station/installer-station.sh | sh" },
  { systeme: "Windows, in PowerShell", commande: "irm https://github.com/benomite/brigade/releases/download/station/installer-station.ps1 | iex" },
];

// La plateforme telle que le contrat la publie, dite comme on la nomme.
/** @type {Readonly<Record<string, string>>} */
const PLATEFORMES = { linux: "Linux", macos: "macOS", windows: "Windows" };
/** @param {string} plateforme */
export const plateformeDite = (plateforme) => PLATEFORMES[plateforme] ?? plateforme;

// Ce qu'une station sert, en mots : rien encore choisi, rien, ou les projets eux-mêmes — comme la ligne d'une station
// appairée les nomme.
/** @param {readonly string[] | null} selection */
export function sertDit(selection) {
  if (selection === null) return PAS_ENCORE("project chosen");
  if (selection.length === 0) return "no project";
  return selection.join(", ");
}

// Une ligne par machine (ticket 1778) : les stations appairées, telles que l'accueil les dit, puis celles du compte qu'aucune
// ne nomme, dans l'ordre des noms. Une machine se reconnaît à son nom — l'enregistrement porte « le même nom que sur sa
// présence » (runtime/src/enregistrement-station/README.md), sans égard à la casse, comme un nom de machine. Appairée, sa
// ligne est celle de sa présence, et son enregistrement l'accompagne (`enregistree`) : ce qui lui est choisi s'y fond
// (`ligneFondue`). Deux enregistrements d'un même nom — un dossier d'état perdu en laisse un ancien, hors ligne — n'en
// font qu'un : celui qui est en ligne, sinon le dernier vu.
/**
 * @template {{ nom: string }} A
 * @param {readonly A[]} appairees @param {readonly StationEnregistree[]} enregistrees
 * @returns {Array<{ appairee: A, enregistree?: StationEnregistree } | { enregistree: StationEnregistree }>}
 */
export function uneLineParMachine(appairees, enregistrees) {
  const cle = (/** @type {string} */ name) => name.toLowerCase();
  /** @type {Map<string, StationEnregistree>} */
  const parName = new Map();
  for (const station of enregistrees) {
    const name = cle(station.name);
    const tenue = parName.get(name);
    if (tenue === undefined || (station.available && !tenue.available) || (station.available === tenue.available && station.lastSeen > tenue.lastSeen)) parName.set(name, station);
  }
  const prises = new Set(appairees.map(({ nom: name }) => cle(name)));
  // Les appairées gardent l'ordre où l'accueil les dit (celui des noms) ; chaque autre se glisse à son nom.
  const restantes = [...parName.values()].filter(({ name }) => !prises.has(cle(name))).sort((a, b) => a.name.localeCompare(b.name));
  /** @type {Array<{ appairee: A, enregistree?: StationEnregistree } | { enregistree: StationEnregistree }>} */
  const lines = [];
  for (const appairee of appairees) {
    while (restantes.length > 0 && (restantes[0]?.name ?? "").localeCompare(appairee.nom) < 0) lines.push({ enregistree: /** @type {StationEnregistree} */ (restantes.shift()) });
    const enregistree = parName.get(cle(appairee.nom));
    lines.push(enregistree === undefined ? { appairee } : { appairee, enregistree });
  }
  return [...lines, ...restantes.map((enregistree) => ({ enregistree }))];
}

// Le nom d'un dépôt choisi tel qu'une station nomme le projet qu'elle en fait : celui du dépôt, en minuscules
// (runtime/src/projets-station/README.md, `nomDuDepot`).
/** @param {string} repository */
const nameDuChoisi = (repository) => (repository.split("/").pop() ?? repository).toLowerCase();

// Les projets qu'une machine appairée et enregistrée sert, calculés en un seul endroit : ceux de sa présence — la
// configuration qu'elle fait tourner —, puis ceux qui lui sont choisis dans son enregistrement et que sa présence ne nomme
// pas encore (elle les prend en main dans les 30 s). Rien de choisi, ou rien encore : ceux de sa présence.
/** @param {readonly string[]} projects @param {readonly string[] | null} selection */
export function projectsServed(projects, selection) {
  const tenus = new Set(projects.map((project) => project.toLowerCase()));
  return [...projects, ...(selection ?? []).filter((repository) => !tenus.has(nameDuChoisi(repository)))];
}

// La ligne d'une machine appairée, ce que son enregistrement lui choisit fondu dedans : ses projets sont `projetsServis`.
// Elle sert alors des projets : ni « runs no kitchen », ni la raison « not added to any project », ni la note qui dit
// qu'attendre sans projet est normal. Son état reste celui de sa présence. Une ligne qui ne dit pas ses projets (illisible,
// téléphone) est rendue telle quelle.
/**
 * @template {{ dit: string, raison?: { cle: string }, note?: string }} L
 * @param {L} line @param {readonly string[]} projects — ceux de sa présence @param {StationEnregistree | undefined} enregistree
 * @returns {L}
 */
export function lineFondue(line, projects, enregistree) {
  const servedOnes = projectsServed(projects, enregistree?.selection ?? null);
  if (servedOnes.length === projects.length) return line;
  const morceaux = line.dit.split(" · ");
  const dits = projects.length === 0 ? ["runs no kitchen", "no project"] : [projects.join(", ")];
  if (!dits.includes(morceaux.at(-1) ?? "")) return line;
  const { raison, note, ...reste } = line;
  return /** @type {L} */ ({
    ...reste,
    dit: [...morceaux.slice(0, -1), servedOnes.join(", ")].join(" · "),
    ...(raison === undefined || raison.cle === "sans-projet" ? {} : { raison }),
    ...(note === undefined || projects.length === 0 ? {} : { note }),
  });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
/** @param {Fabrique} doc @param {StationEnregistree} station */
function pillDe(doc, station) {
  const pose = cree(doc, "span");
  pose.className = "pastille";
  pose.dataset.ton = tonDe(station);
  pose.dataset.forme = station.available ? "disque" : "anneau";
  pose.title = stateDit(station);
  return pose;
}

// Le dernier signe de vie d'une station, à la minute, en temps universel.
/** @param {string} instant */
const vueDit = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;

// Ce que la plateforme, la machine, la version et le dernier signe de vie d'une station disent d'elle, au survol.
/** @param {StationEnregistree} station */
export const detailsDe = (station) => [plateformeDite(station.platform), station.machine, `version ${station.version}`, vueDit(station.lastSeen)].filter((morceau) => morceau !== "").join(" · ");

// La ligne d'une station : toute la ligne est le bouton qui ouvre sa page, comme une ligne de l'accueil (vue.js,
// `ligneDAccueil`), avec la même flèche ; elle dit, comme elle, en ligne ou non, puis les projets qu'elle sert. Ses
// détails sont au survol ; ses cases à cocher sont sur sa page.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {ActionsDuAccount} action */
function lineDe(doc, station, action) {
  const dit = `${stateDit(station)} · ${sertDit(station.selection)}`;
  const line = cree(doc, "button");
  line.type = "button";
  line.className = "ligne";
  line.title = detailsDe(station);
  line.ariaLabel = `${station.name} — ${dit}`;
  line.dataset.station = station.id;
  const name = cree(doc, "strong", station.name);
  name.className = "mono";
  const suite = cree(doc, "span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  line.append(pillDe(doc, station), name, cree(doc, "span", dit), suite);
  line.addEventListener("click", () => action.ouvrirLaStation(station.id));
  return line;
}

// Sans station : la phrase, puis la commande d'installation de chaque système, chacune avec son bouton qui la copie.
/** @param {Fabrique} doc @param {StateDuAccount} state @param {ActionsDuAccount} action */
function commentInstaller(doc, state, action) {
  const tete = cree(doc, "p", AUCUNE);
  tete.className = "attendu";
  tete.append(survol(doc, AUCUNE_AIDE));
  const lines = INSTALLER.map(({ systeme, commande: command }) => {
    const line = cree(doc, "p");
    line.className = "installer";
    const code = cree(doc, "code", command);
    const copier = buttonAction(doc, state.copiee === command ? COPIEE : COPIER, () => action.copier(command));
    copier.children[0].ariaLabel = `${COPIER}: ${systeme}`;
    line.append(cree(doc, "span", systeme), code, copier);
    return line;
  });
  return [tete, ...lines, actions(doc, [buttonAction(doc, RELIRE, action.relire)])];
}

// La ligne d'une station seulement enregistrée, dans la liste des stations de l'accueil : un clic ouvre sa page.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {ActionsDuAccount} action */
export function lineDeLEnregistree(doc, station, action) {
  return lineDe(doc, station, action);
}

// Ce que la lecture du compte dit sous la liste des stations, d'après ce que la vue en tient : rien tant qu'elle est en
// route ou que tout est listé ; la connexion qui manque, la lecture qui échoue, les enregistrements illisibles ; et,
// `vide` — la liste n'a aucune station —, comment en installer une. Aucun titre : ce n'est pas une seconde liste.
/** @param {Fabrique} doc @param {StateDuAccount} state @param {ActionsDuAccount} action @param {boolean} empty */
export function readDuAccount(doc, state, action, empty) {
  const { stations } = state;
  if (stations === undefined) return [];
  if (stations.state === "sign-in-required") {
    const tete = phraseEtDetail(doc, "p", stations.reason, undefined);
    tete.className = "attendu";
    return [tete, ...connectionDite(doc, state.connexion, stations.action.label, action)];
  }
  if (stations.state === "unavailable") {
    const lien = stations.link;
    return [
      lineError(doc, ILLISIBLES, [stations.reason, stations.detail ?? ""].filter((morceau) => morceau.trim() !== "").join("\n")),
      actions(doc, [...(lien === undefined ? [] : [buttonAction(doc, buttonDeLaPage(lien), () => action.ouvrirLaPage(lien), { recommande: true })]), buttonAction(doc, RELIRE, action.relire, { recommande: lien === undefined })]),
    ];
  }
  if (stations.unreadable.length > 0) {
    const combien = stations.unreadable.length;
    return [
      lineError(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n")),
      actions(doc, [buttonAction(doc, RELIRE, action.relire)]),
    ];
  }
  return empty ? commentInstaller(doc, state, action) : [];
}
