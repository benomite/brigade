// @ts-check
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, épique 1702), dans la liste des stations de
// l'accueil : une machine s'y lit une fois (ticket 1778, épique 1777). Une machine appairée s'y dit par sa présence
// (accueil.ts), à laquelle son enregistrement ajoute les projets choisis pour elle (`ligneFondue`) : il ne pose ni seconde
// ligne, ni section à part — il n'est que la façon dont la machine est arrivée (`uneLigneParMachine`), et ce qui lui est
// choisi ; ses cases s'ouvrent d'un bouton à côté de sa ligne. Une machine seulement enregistrée a sa ligne d'après son
// enregistrement — sa pastille, son nom, en ligne ou non, les projets qu'elle sert — ; un clic l'ouvre sur les projets
// du chef, à cocher : ceux qu'elle doit servir. Une case cochée ou décochée s'écrit aussitôt dans le gist de la station
// (stations-du-compte.ts, selon le contrat de runtime/src/enregistrement-station/README.md) ; relue au lancement
// suivant, la sélection est celle qui a été écrite. Une station hors ligne se dit telle, et ses cases restent à cocher :
// elle sert ce qui est choisi à son retour.
// Sous la liste, ce que la lecture du compte a de plus à dire (`lectureDuCompte`) : sans aucune station, la commande
// d'installation, que copie un bouton ; une connexion à GitHub qui manque, le bouton du premier lancement
// (premier-lancement.js) ; une lecture qui échoue, une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, caseACocher, lectureIndisponible, survol } from "./briques.js";
import { boutonDeLaPage, connexionDite, gestes, phraseEtDetail } from "./premier-lancement.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../stations-du-compte.ts").StationsDuCompte} StationsDuCompte */
/** @typedef {import("../stations-du-compte.ts").StationEnregistree} StationEnregistree */
/** @typedef {import("../projets/github.ts").DepotDuChef} DepotDuChef */
/** @typedef {import("./premier-lancement.js").EtatDuPremier["connexion"]} Connexion */

// Ce que la vue tient du bloc. `stations` : absentes, leur lecture est en route. `depots` : les dépôts du chef, lus à
// l'ouverture d'une première station. `ouverte` : la station dont les cases se montrent. `envoi` : la station dont la
// sélection s'écrit — ses cases attendent. `refus` : pourquoi la dernière écriture n'a pas eu lieu. `copiee` : la
// commande d'installation que le bouton vient de copier. `connexion` : la connexion à GitHub lancée.
/**
 * @typedef {{
 *   stations?: StationsDuCompte,
 *   depots?: { depots: DepotDuChef[] } | { refus: string },
 *   ouverte?: string,
 *   envoi?: string,
 *   refus?: { id: string, refus: string, detail?: string },
 *   copiee?: string,
 *   connexion?: Connexion,
 * }} EtatDuCompte
 */
/**
 * @typedef {{
 *   ouvrir: (id: string) => void,
 *   fermer: () => void,
 *   choisir: (id: string, depots: string[]) => void,
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   copier: (commande: string) => void,
 * }} GestesDuCompte
 */

export const AUCUNE = "No station yet: install one on the machine that will cook.";
export const AUCUNE_AIDE = "The installer asks that machine to sign in to GitHub: sign it in to this same account, and the station appears here within a minute.";
export const ILLISIBLES = "your stations could not be read";
export const RELIRE = "read again";
export const COPIER = "copy";
export const COPIEE = "copied";
// Les mots de l'état d'une machine, ceux de sa ligne quand elle est appairée (stations/stations.ts, `etatDe`).
export const EN_LIGNE = "online";
export const HORS_LIGNE = "offline";
export const PROJETS = "Projects it serves";
// Le bouton à côté de la ligne d'une machine appairée et enregistrée, qui ouvre ses cases sous elle.
export const CHOISIR_SES_PROJETS = "choose projects";
export const LECTURE_DES_DEPOTS = "reading your repositories on GitHub…";
export const DEPOTS_ILLISIBLES = "your repositories could not be read";
export const SANS_DEPOT = "no repository on your GitHub account";
export const ENVOI = "saving…";
export const EN_SON_ABSENCE = "it is offline: it serves these projects once it is back";

// La commande d'installation d'une station, selon le système de la machine qui cuit (docs/installation-station.md).
/** @type {readonly { systeme: string, commande: string }[]} */
export const INSTALLER = [
  { systeme: "Linux or macOS", commande: "curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sh" },
  { systeme: "Windows, in PowerShell", commande: "irm https://github.com/benomite/brigade/releases/latest/download/installer-station.ps1 | iex" },
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
  if (selection === null) return "no project chosen yet";
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
export function uneLigneParMachine(appairees, enregistrees) {
  const cle = (/** @type {string} */ nom) => nom.toLowerCase();
  /** @type {Map<string, StationEnregistree>} */
  const parNom = new Map();
  for (const station of enregistrees) {
    const nom = cle(station.name);
    const tenue = parNom.get(nom);
    if (tenue === undefined || (station.available && !tenue.available) || (station.available === tenue.available && station.lastSeen > tenue.lastSeen)) parNom.set(nom, station);
  }
  const prises = new Set(appairees.map(({ nom }) => cle(nom)));
  // Les appairées gardent l'ordre où l'accueil les dit (celui des noms) ; chaque autre se glisse à son nom.
  const restantes = [...parNom.values()].filter(({ name }) => !prises.has(cle(name))).sort((a, b) => a.name.localeCompare(b.name));
  /** @type {Array<{ appairee: A, enregistree?: StationEnregistree } | { enregistree: StationEnregistree }>} */
  const lignes = [];
  for (const appairee of appairees) {
    while (restantes.length > 0 && (restantes[0]?.name ?? "").localeCompare(appairee.nom) < 0) lignes.push({ enregistree: /** @type {StationEnregistree} */ (restantes.shift()) });
    const enregistree = parNom.get(cle(appairee.nom));
    lignes.push(enregistree === undefined ? { appairee } : { appairee, enregistree });
  }
  return [...lignes, ...restantes.map((enregistree) => ({ enregistree }))];
}

// Le nom d'un dépôt choisi tel qu'une station nomme le projet qu'elle en fait : celui du dépôt, en minuscules
// (runtime/src/projets-station/README.md, `nomDuDepot`).
/** @param {string} depot */
const nomDuChoisi = (depot) => (depot.split("/").pop() ?? depot).toLowerCase();

// Les projets qu'une machine appairée et enregistrée sert, calculés en un seul endroit : ceux de sa présence — la
// configuration qu'elle fait tourner —, puis ceux qui lui sont choisis dans son enregistrement et que sa présence ne nomme
// pas encore (elle les prend en main dans les 30 s). Rien de choisi, ou rien encore : ceux de sa présence.
/** @param {readonly string[]} projets @param {readonly string[] | null} selection */
export function projetsServis(projets, selection) {
  const tenus = new Set(projets.map((projet) => projet.toLowerCase()));
  return [...projets, ...(selection ?? []).filter((depot) => !tenus.has(nomDuChoisi(depot)))];
}

// La ligne d'une machine appairée, ce que son enregistrement lui choisit fondu dedans : ses projets sont `projetsServis`.
// Elle sert alors des projets : ni « runs no kitchen », ni la raison « not added to any project », ni la note qui dit
// qu'attendre sans projet est normal. Son état reste celui de sa présence. Une ligne qui ne dit pas ses projets (illisible,
// téléphone) est rendue telle quelle.
/**
 * @template {{ dit: string, raison?: { cle: string }, note?: string }} L
 * @param {L} ligne @param {readonly string[]} projets — ceux de sa présence @param {StationEnregistree | undefined} enregistree
 * @returns {L}
 */
export function ligneFondue(ligne, projets, enregistree) {
  const servis = projetsServis(projets, enregistree?.selection ?? null);
  if (servis.length === projets.length) return ligne;
  const morceaux = ligne.dit.split(" · ");
  const dits = projets.length === 0 ? ["runs no kitchen", "no project"] : [projets.join(", ")];
  if (!dits.includes(morceaux.at(-1) ?? "")) return ligne;
  const { raison, note, ...reste } = ligne;
  return /** @type {L} */ ({
    ...reste,
    dit: [...morceaux.slice(0, -1), servis.join(", ")].join(" · "),
    ...(raison === undefined || raison.cle === "sans-projet" ? {} : { raison }),
    ...(note === undefined || projets.length === 0 ? {} : { note }),
  });
}

// Les cases d'une station : les dépôts du chef, dans l'ordre où GitHub les rend, puis ceux qu'elle sert et qu'ils ne
// nomment pas — encore décochables.
/** @param {readonly string[]} depots @param {readonly string[] | null} selection */
export function casesDe(depots, selection) {
  return [...new Set([...depots, ...(selection ?? [])])];
}

// La sélection qu'une case changée donne : la case ajoutée ou ôtée, dans l'ordre des cases.
/** @param {readonly string[]} cases @param {readonly string[] | null} selection @param {string} depot @param {boolean} cochee */
export function selectionApres(cases, selection, depot, cochee) {
  const tenue = new Set(selection ?? []);
  if (cochee) tenue.add(depot);
  else tenue.delete(depot);
  return cases.filter((une) => tenue.has(une));
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
/** @param {Fabrique} doc @param {boolean} disponible */
function pastilleDe(doc, disponible) {
  const pose = cree(doc, "span");
  pose.className = "pastille";
  pose.dataset.ton = disponible ? "vert" : "gris";
  pose.dataset.forme = disponible ? "disque" : "anneau";
  pose.title = disponible ? EN_LIGNE : HORS_LIGNE;
  return pose;
}

// Le dernier signe de vie d'une station, à la minute, en temps universel.
/** @param {string} instant */
const vueDit = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;

// La ligne d'une station : toute la ligne est le bouton qui l'ouvre, comme une ligne de l'accueil (vue.js,
// `ligneDAccueil`) ; elle dit, comme elle, en ligne ou non, puis les projets qu'elle sert. Sa plateforme, sa machine, sa
// version et son dernier signe de vie sont au survol.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {boolean} ouverte @param {GestesDuCompte} geste */
function ligneDe(doc, station, ouverte, geste) {
  const dit = `${station.available ? EN_LIGNE : HORS_LIGNE} · ${sertDit(station.selection)}`;
  const ligne = cree(doc, "button");
  ligne.type = "button";
  ligne.className = "ligne";
  ligne.title = [plateformeDite(station.platform), station.machine, `version ${station.version}`, vueDit(station.lastSeen)].filter((morceau) => morceau !== "").join(" · ");
  ligne.ariaLabel = `${station.name} — ${dit}`;
  ligne.ariaExpanded = ouverte ? "true" : "false";
  const nom = cree(doc, "strong", station.name);
  nom.className = "mono";
  // La flèche de l'accueil ; ouverte, elle pointe vers ses cases (vue.css).
  const suite = cree(doc, "span");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  suite.append(cree(doc, "span", "›"));
  ligne.append(pastilleDe(doc, station.available), nom, cree(doc, "span", dit), suite);
  ligne.addEventListener("click", () => (ouverte ? geste.fermer() : geste.ouvrir(station.id)));
  return ligne;
}

// Les cases d'une station ouverte : un dépôt par case, cochée s'il est dans sa sélection. Une écriture en route : les
// cases attendent qu'elle ait répondu. Une écriture refusée le dit sous les cases, en une ligne.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
export function projetsDe(doc, station, etat, geste) {
  const choix = cree(doc, "fieldset");
  choix.className = "projets-de-la-station";
  choix.ariaLabel = `${PROJETS}: ${station.name}`;
  choix.append(cree(doc, "legend", PROJETS));
  if (!station.available) {
    const absente = cree(doc, "p", EN_SON_ABSENCE);
    absente.className = "note";
    choix.append(absente);
  }
  const { depots } = etat;
  if (depots === undefined) {
    const lecture = cree(doc, "p", LECTURE_DES_DEPOTS);
    lecture.className = "vide";
    choix.append(lecture);
  } else if ("refus" in depots) {
    choix.append(lectureIndisponible(doc, DEPOTS_ILLISIBLES, depots.refus));
  }
  const cases = casesDe(depots !== undefined && "depots" in depots ? depots.depots.map(({ depot }) => depot) : [], station.selection);
  if (cases.length === 0 && depots !== undefined && "depots" in depots) {
    const vide = cree(doc, "p", SANS_DEPOT);
    vide.className = "vide";
    choix.append(vide);
  }
  if (cases.length > 0) {
    const liste = cree(doc, "div");
    liste.className = "capacites";
    const enRoute = etat.envoi === station.id;
    for (const depot of cases) {
      const coche = caseACocher(doc, { nom: depot, dit: "", cochee: (station.selection ?? []).includes(depot), mono: true }, (cochee) => geste.choisir(station.id, selectionApres(cases, station.selection, depot, cochee)));
      coche.children[0].disabled = enRoute;
      liste.append(coche);
    }
    choix.append(liste);
    if (enRoute) {
      const envoi = cree(doc, "p", ENVOI);
      envoi.className = "note";
      envoi.role = "status";
      choix.append(envoi);
    }
  }
  if (etat.refus?.id === station.id) choix.append(lectureIndisponible(doc, etat.refus.refus, etat.refus.detail ?? ""));
  return choix;
}

// Sans station : la phrase, puis la commande d'installation de chaque système, chacune avec son bouton qui la copie.
/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
function commentInstaller(doc, etat, geste) {
  const tete = cree(doc, "p", AUCUNE);
  tete.className = "attendu";
  tete.append(survol(doc, AUCUNE_AIDE));
  const lignes = INSTALLER.map(({ systeme, commande }) => {
    const ligne = cree(doc, "p");
    ligne.className = "installer";
    const code = cree(doc, "code", commande);
    const copier = boutonAction(doc, etat.copiee === commande ? COPIEE : COPIER, () => geste.copier(commande));
    copier.children[0].ariaLabel = `${COPIER}: ${systeme}`;
    ligne.append(cree(doc, "span", systeme), code, copier);
    return ligne;
  });
  return [tete, ...lignes, gestes(doc, [boutonAction(doc, RELIRE, geste.relire)])];
}

// La ligne d'une station seulement enregistrée, dans la liste des stations de l'accueil — et, ouverte, ses cases dessous.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
export function ligneDeLEnregistree(doc, station, etat, geste) {
  const ouverte = etat.ouverte === station.id;
  const rang = cree(doc, "div");
  rang.className = "enregistree";
  rang.dataset.station = station.id;
  rang.append(ligneDe(doc, station, ouverte, geste));
  if (ouverte) rang.append(projetsDe(doc, station, etat, geste));
  return rang;
}

// Ce que la lecture du compte dit sous la liste des stations, d'après ce que la vue en tient : rien tant qu'elle est en
// route ou que tout est listé ; la connexion qui manque, la lecture qui échoue, les enregistrements illisibles ; et,
// `vide` — la liste n'a aucune station —, comment en installer une. Aucun titre : ce n'est pas une seconde liste.
/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste @param {boolean} vide */
export function lectureDuCompte(doc, etat, geste, vide) {
  const { stations } = etat;
  if (stations === undefined) return [];
  if (stations.state === "sign-in-required") {
    const tete = phraseEtDetail(doc, "p", stations.reason, undefined);
    tete.className = "attendu";
    return [tete, ...connexionDite(doc, etat.connexion, stations.action.label, geste)];
  }
  if (stations.state === "unavailable") {
    const lien = stations.link;
    return [
      lectureIndisponible(doc, ILLISIBLES, [stations.reason, stations.detail ?? ""].filter((morceau) => morceau.trim() !== "").join("\n")),
      gestes(doc, [...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]), boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined })]),
    ];
  }
  if (stations.unreadable.length > 0) {
    const combien = stations.unreadable.length;
    return [
      lectureIndisponible(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n")),
      gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]),
    ];
  }
  return vide ? commentInstaller(doc, etat, geste) : [];
}
