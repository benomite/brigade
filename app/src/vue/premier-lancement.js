// @ts-check
// Le premier lancement de l'app sur un ordinateur neuf (ticket 1434, épique 1427) : à la place de « Tous les
// projets », tant que le fichier des projets n'en a aucun. Le chef y retrouve les stations qu'il a appairées et les
// projets que chacune porte, tels que le runtime les lit sur GitHub (ticket 1428), et en ouvre un d'un clic — sans dossier
// à choisir : sa copie est reprise ou clonée par le runtime (ticket 1429), et l'écran dit où elle en est.
// En tête, toujours une phrase : ce qu'on attend du chef, ou pourquoi rien ne se lit. Une connexion à GitHub qui
// manque est un bouton — le geste que le runtime nomme ; une lecture qui échoue dit sa raison en une phrase, son
// détail au survol, et le bouton de la page qui la lève quand le runtime en nomme une. L'écran n'est jamais vide.
// L'écran d'ajout par un dossier reste à un clic, sous la liste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../premier-lancement.ts").StationsDuChef} StationsDuChef */
/** @typedef {import("../premier-lancement.ts").StationAppairee} Station */
/** @typedef {import("../premier-lancement.ts").Ouverture} Ouverture */
/** @typedef {import("../premier-lancement.ts").Progres} Progres */
/** @typedef {import("../connexion-github.ts").DebutDeConnexion} DebutDeConnexion */
/** @typedef {import("../connexion-github.ts").FinDeConnexion} FinDeConnexion */

// Ce que la vue tient de l'écran. `stations` : absentes, leur lecture est en route. `ouverture` : le projet qu'un
// clic ouvre — l'étape de sa copie, puis, ratée, ce que le runtime en dit. `connexion` : la connexion à GitHub
// lancée — en route, son code à taper, ou pourquoi elle n'a pas abouti.
/**
 * @typedef {{
 *   poste: string,
 *   stations?: StationsDuChef,
 *   ouverture?: { station: string, projet: string, depot: string, etape?: Progres, echec?: Extract<Ouverture, { state: "failed" }> },
 *   connexion?: { enRoute: true } | DebutDeConnexion | FinDeConnexion,
 * }} EtatDuPremier
 */
/**
 * @typedef {{
 *   ouvrir: (station: string, projet: string, depot: string) => void,
 *   seConnecter: () => void,
 *   relire: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   ajouterUnDossier: () => void,
 * }} GestesDuPremier
 */

export const LECTURE = "Reading the stations you have paired, on GitHub…";
/** @param {string} poste */
export const OUVRIR_UN_PROJET = (poste) => `Open one of your projects on ${poste}: one click, no folder to choose.`;
export const RELIRE = "read again";
export const REESSAYER = "try again";
export const PAR_UN_DOSSIER = "add a project from a folder instead";
export const SANS_PROJET = "no project on this station yet";
export const DEPOT_INCONNU = "its station does not say which GitHub repository it is, so it cannot be cloned from here";
export const SANS_CUISINE = "does not cook";
export const CONNEXION_EN_ROUTE = "signing in…";
export const ROUVRIR_LA_PAGE = "open the GitHub page again";
// Le bouton d'une page qu'un échec nomme : « get the GitHub CLI » pour `gh`, « get Git » pour `git`, sinon la page de GitHub.
/** @param {string} url */
export const boutonDeLaPage = (url) => (url.startsWith("https://cli.github.com") ? "get the GitHub CLI" : url.startsWith("https://git-scm.com") ? "get Git" : "open the page on GitHub");
/** @param {string} code */
export const tapeLeCode = (code) => `Type the code ${code} on the GitHub page that opened in your browser.`;
/** @param {string} projet */
export const ouvertureDe = (projet) => `Opening ${projet}…`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase, et son détail — ce que `gh` ou `git` a dit — au survol, jamais à plat.
/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string | undefined} detail */
function phraseEtDetail(doc, balise, texte, detail) {
  const pose = cree(doc, balise);
  pose.append(cree(doc, "span", texte));
  if (detail !== undefined && detail.trim() !== "") pose.append(survol(doc, detail));
  return pose;
}

/** @param {Fabrique} doc @param {any[]} boutons */
function gestes(doc, boutons) {
  const pose = cree(doc, "p");
  pose.className = "gestes";
  pose.append(...boutons);
  return pose;
}

// La connexion à GitHub : son bouton, puis, lancée, le code à taper — ou pourquoi elle n'a pas abouti.
/** @param {Fabrique} doc @param {EtatDuPremier["connexion"]} connexion @param {string} libelle @param {GestesDuPremier} geste */
function connexionDite(doc, connexion, libelle, geste) {
  const enRoute = connexion !== undefined && ("enRoute" in connexion || "code" in connexion);
  const bouton = boutonAction(doc, enRoute ? CONNEXION_EN_ROUTE : libelle, geste.seConnecter, { recommande: true });
  const pose = [gestes(doc, [bouton])];
  bouton.children[0].disabled = enRoute;
  if (connexion === undefined || "enRoute" in connexion || "connecte" in connexion) return pose;
  if ("code" in connexion) {
    const dit = cree(doc, "p");
    dit.className = "code-de-connexion";
    const [avant = "", apres = ""] = tapeLeCode(connexion.code).split(connexion.code);
    const code = cree(doc, "strong", connexion.code);
    code.className = "mono";
    dit.append(avant, code, apres);
    const page = connexion.page;
    return [...pose, dit, gestes(doc, [boutonAction(doc, ROUVRIR_LA_PAGE, () => geste.ouvrirLaPage(page))])];
  }
  const refus = phraseEtDetail(doc, "p", connexion.refus, connexion.detail);
  refus.className = "refus";
  return [...pose, refus];
}

// Une station : sa pastille, son nom, son état — sa machine et sa version au survol —, puis ses projets, chacun un
// bouton qui l'ouvre. Celui qu'un clic ouvre dit, sous la liste, où en est sa copie, ou pourquoi elle a échoué.
/** @param {Fabrique} doc @param {Station} station @param {EtatDuPremier} etat @param {GestesDuPremier} geste */
function stationDite(doc, station, etat, geste) {
  const carte = cree(doc, "section");
  carte.className = "carte station-du-chef";
  carte.ariaLabel = station.name;
  const tete = cree(doc, "p");
  tete.className = "tete-de-station";
  tete.title = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((morceau) => morceau !== "").join(" · ");
  const etatDit = station.online ? "online" : "offline";
  const pastille = cree(doc, "span");
  pastille.className = "pastille";
  // Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
  pastille.dataset.ton = station.online ? "vert" : "gris";
  pastille.dataset.forme = station.online ? "disque" : "anneau";
  pastille.title = etatDit;
  const nom = cree(doc, "strong", station.name);
  nom.className = "mono";
  tete.append(pastille, nom, cree(doc, "span", station.cooks ? etatDit : `${etatDit} · ${SANS_CUISINE}`));
  carte.append(tete);
  const { ouverture } = etat;
  const enCours = ouverture !== undefined && ouverture.echec === undefined;
  if (station.projects.length === 0) {
    const vide = cree(doc, "p", SANS_PROJET);
    vide.className = "vide";
    carte.append(vide);
    return carte;
  }
  const liste = cree(doc, "p");
  liste.className = "gestes projets-de-station";
  for (const projet of station.projects) {
    const depot = projet.repository;
    const bouton = cree(doc, "button", projet.name);
    bouton.type = "button";
    bouton.className = "mono";
    bouton.title = depot ?? DEPOT_INCONNU;
    bouton.disabled = depot === null || enCours;
    if (ouverture?.station === station.id && ouverture.projet === projet.name) bouton.ariaPressed = "true";
    if (depot !== null) bouton.addEventListener("click", () => geste.ouvrir(station.id, projet.name, depot));
    liste.append(bouton);
  }
  carte.append(liste);
  if (ouverture === undefined || ouverture.station !== station.id) return carte;
  if (ouverture.echec === undefined) {
    const dit = cree(doc, "p", ouverture.etape?.sentence ?? ouvertureDe(ouverture.projet));
    dit.className = "ouverture";
    dit.role = "status";
    carte.append(dit);
    return carte;
  }
  const { echec } = ouverture;
  const refus = phraseEtDetail(doc, "p", echec.reason, echec.detail);
  refus.className = "refus";
  carte.append(refus);
  if ("action" in echec && echec.action !== undefined) carte.append(...connexionDite(doc, etat.connexion, echec.action.label, geste));
  const lien = "link" in echec ? echec.link : undefined;
  carte.append(
    gestes(doc, [
      ...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: !("action" in echec && echec.action !== undefined) })]),
      boutonAction(doc, REESSAYER, () => geste.ouvrir(ouverture.station, ouverture.projet, ouverture.depot)),
    ]),
  );
  return carte;
}

// L'écran entier, d'après ce que la vue tient : la phrase de tête, puis ce qui suit de l'état des stations.
/** @param {Fabrique} doc @param {EtatDuPremier} etat @param {GestesDuPremier} geste */
export function poserPremierLancement(doc, etat, geste) {
  const racine = cree(doc, "div");
  racine.className = "premier-lancement";
  const { stations } = etat;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h2", texte, detail);
    tete.className = "attendu";
    return tete;
  };
  if (stations === undefined) {
    racine.append(enTete(LECTURE));
  } else if (stations.state === "sign-in-required") {
    racine.append(enTete(stations.reason), ...connexionDite(doc, etat.connexion, stations.action.label, geste));
  } else if (stations.state === "unavailable") {
    const lien = stations.link;
    racine.append(
      enTete(stations.reason, stations.detail),
      gestes(doc, [...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]), boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined })]),
    );
  } else if (stations.stations.length === 0) {
    racine.append(enTete(stations.reason ?? "No station is paired with this GitHub account yet."), gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]));
  } else {
    racine.append(enTete(OUVRIR_UN_PROJET(etat.poste)), ...stations.stations.map((station) => stationDite(doc, station, etat, geste)));
    if (stations.unreadable.length > 0) {
      const combien = stations.unreadable.length;
      const illisibles = phraseEtDetail(doc, "p", `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n"));
      illisibles.className = "indisponible";
      racine.append(illisibles);
    }
  }
  racine.append(gestes(doc, [boutonAction(doc, PAR_UN_DOSSIER, geste.ajouterUnDossier)]));
  return racine;
}
