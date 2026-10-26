// @ts-check
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, épique 1702), sur l'accueil, sous ses stations.
// Une ligne par station — sa pastille, son nom, sa plateforme, disponible ou non, ce qu'elle sert — ; un clic l'ouvre
// sur les projets du chef, à cocher : ceux qu'elle doit servir. Une case cochée ou décochée s'écrit aussitôt dans le
// gist de la station (stations-du-compte.ts, selon le contrat de runtime/src/enregistrement-station/README.md) ; relue
// au lancement suivant, la sélection est celle qui a été écrite. Une station indisponible se dit telle, et ses cases
// restent à cocher : elle sert ce qui est choisi à son retour.
// Sans station, le bloc dit comment en installer une : la commande d'installation, que copie un bouton. Une connexion
// à GitHub qui manque est le bouton du premier lancement (premier-lancement.js) ; une lecture qui échoue tient en une
// ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

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

export const TITRE = "Under your GitHub account";
export const AIDE = "A station installed on one of your machines, and signed in to your GitHub account, registers itself there. Open one to choose the projects it serves.";
export const LECTURE = "reading the stations registered under your GitHub account…";
export const CHOISIR = "Open a station to choose the projects it serves.";
export const AUCUNE = "No station under your GitHub account yet: install one on the machine that will cook.";
export const AUCUNE_AIDE = "The installer asks that machine to sign in to GitHub: sign it in to this same account, and the station appears here within a minute.";
export const ILLISIBLES = "your stations could not be read";
export const RELIRE = "read again";
export const COPIER = "copy";
export const COPIEE = "copied";
export const DISPONIBLE = "available";
export const INDISPONIBLE = "unavailable";
export const PROJETS = "Projects it serves";
export const LECTURE_DES_DEPOTS = "reading your repositories on GitHub…";
export const DEPOTS_ILLISIBLES = "your repositories could not be read";
export const SANS_DEPOT = "no repository on your GitHub account";
export const ENVOI = "saving…";
export const EN_SON_ABSENCE = "it is unavailable: it serves these projects once it is back";

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

// Ce qu'une station sert, en mots : rien encore choisi, rien, ou combien de projets.
/** @param {readonly string[] | null} selection */
export function sertDit(selection) {
  if (selection === null) return "no project chosen yet";
  if (selection.length === 0) return "serves no project";
  return `serves ${selection.length} project${selection.length > 1 ? "s" : ""}`;
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
  pose.title = disponible ? DISPONIBLE : INDISPONIBLE;
  return pose;
}

// Le dernier signe de vie d'une station, à la minute, en temps universel.
/** @param {string} instant */
const vueDit = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;

// La ligne d'une station : toute la ligne est le bouton qui l'ouvre, comme une ligne de l'accueil (vue.js,
// `ligneDAccueil`). Sa machine, sa version et son dernier signe de vie sont au survol.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {boolean} ouverte @param {GestesDuCompte} geste */
function ligneDe(doc, station, ouverte, geste) {
  const dit = `${plateformeDite(station.platform)} · ${station.available ? DISPONIBLE : INDISPONIBLE} · ${sertDit(station.selection)}`;
  const ligne = cree(doc, "button");
  ligne.type = "button";
  ligne.className = "ligne";
  ligne.title = [station.machine, `version ${station.version}`, vueDit(station.lastSeen)].filter((morceau) => morceau !== "").join(" · ");
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
function projetsDe(doc, station, etat, geste) {
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

// Le bloc entier, d'après ce que la vue tient : son titre, puis ce que la lecture du compte a rendu.
/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
export function poserStationsDuCompte(doc, etat, geste) {
  const racine = cree(doc, "section");
  racine.className = "stations-du-compte";
  racine.ariaLabel = TITRE;
  const titre = cree(doc, "h3", TITRE);
  titre.append(survol(doc, AIDE));
  racine.append(titre);
  const { stations } = etat;
  if (stations === undefined) {
    const lecture = cree(doc, "p", LECTURE);
    lecture.className = "vide";
    racine.append(lecture);
    return racine;
  }
  if (stations.state === "sign-in-required") {
    const tete = phraseEtDetail(doc, "p", stations.reason, undefined);
    tete.className = "attendu";
    racine.append(tete, ...connexionDite(doc, etat.connexion, stations.action.label, geste));
    return racine;
  }
  if (stations.state === "unavailable") {
    const lien = stations.link;
    racine.append(
      lectureIndisponible(doc, ILLISIBLES, [stations.reason, stations.detail ?? ""].filter((morceau) => morceau.trim() !== "").join("\n")),
      gestes(doc, [...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]), boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined })]),
    );
    return racine;
  }
  if (stations.stations.length === 0 && stations.unreadable.length === 0) {
    racine.append(...commentInstaller(doc, etat, geste));
    return racine;
  }
  if (stations.stations.length > 0) {
    const tete = cree(doc, "p", CHOISIR);
    tete.className = "attendu";
    racine.append(tete);
  }
  const liste = cree(doc, "ul");
  liste.className = "du-compte";
  for (const station of stations.stations) {
    const ouverte = etat.ouverte === station.id;
    const rang = cree(doc, "li");
    rang.dataset.station = station.id;
    rang.append(ligneDe(doc, station, ouverte, geste));
    if (ouverte) rang.append(projetsDe(doc, station, etat, geste));
    liste.append(rang);
  }
  if (stations.stations.length > 0) racine.append(liste);
  if (stations.unreadable.length > 0) {
    const combien = stations.unreadable.length;
    racine.append(lectureIndisponible(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n")));
  }
  racine.append(gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]));
  return racine;
}
