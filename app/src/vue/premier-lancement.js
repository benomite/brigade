// @ts-check
// Le premier lancement de l'app sur un ordinateur neuf (ticket 1434, épique 1427) : à la place de « Tous les
// projets », tant que le fichier des projets n'en a aucun. Le chef y retrouve les stations qu'il a appairées et les
// projets que chacune porte, tels que le runtime les lit sur GitHub (ticket 1428), et en ouvre un d'un clic — sans dossier
// à choisir : sa copie est reprise ou clonée par le runtime (ticket 1429), et l'écran dit où elle en est.
// En tête de l'écran, la phrase d'accueil, puis le compte GitHub de cet ordinateur (parcours-projet/compte.js) : lu,
// jamais tapé, et une connexion qui manque s'y fait d'un bouton. Sous lui, toujours une phrase sur les stations : ce qu'on en attend du chef,
// ou pourquoi rien ne se lit — sa raison en une phrase, son détail au survol, et le bouton de la page qui la lève quand
// le runtime en nomme une. L'écran n'est jamais vide.
// Sous elle, le projet qu'il veut cuisiner — un dépôt `owner/repo`, ou un nom seul que complète le compte connecté. Rien
// n'y est prérempli ; son exemple est neutre. L'écran « Add a project », qui choisit parmi ses dépôts (ticket 3181), reste
// à un clic, sous la liste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "./briques.js";
import { phrase } from "./onboarding/parcours.js";
import { boutonDeLaPage, connexionDite, gestes, phraseEtDetail } from "./parcours-projet/connexion.js";
import { poserLeCompte, SE_CONNECTER } from "./parcours-projet/compte.js";
import { bouton as boutonDeLaFamille } from "./composants/bouton/bouton.js";
import { ligneVide } from "./composants/ligne-vide/ligne-vide.js";
import { ligneErreur } from "./composants/ligne-erreur/ligne-erreur.js";
import { REESSAYER, LECTURE_DE, PAS_ENCORE } from "./lexique.js";
import { boutonDuProjetDEssai } from "./essai/projet-d-essai.js";

// La connexion à GitHub et ses mots, dits pareil partout : le rail publié et les stations du compte les prennent ici.
export { boutonDeLaPage, connexionDite, CONNEXION_EN_ROUTE, gestes, phraseEtDetail, ROUVRIR_LA_PAGE, tapeLeCode } from "./parcours-projet/connexion.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../premier-lancement.ts").StationsDuChef} StationsDuChef */
/** @typedef {import("../premier-lancement.ts").StationAppairee} Station */
/** @typedef {import("../premier-lancement.ts").Ouverture} Ouverture */
/** @typedef {import("../premier-lancement.ts").Progres} Progres */
/** @typedef {import("../connexion-github.ts").CompteGitHub} CompteGitHub */
/** @typedef {import("./parcours-projet/connexion.js").Connexion} Connexion */
/** @typedef {import("./parcours-projet/compte.js").GestesDuCompte} GestesDuCompte */

// Ce que la vue tient de l'écran. `stations` : absentes, leur lecture est en route. `ouverture` : le projet qu'un
// clic ouvre — sa branche d'intégration quand GitHub l'a donnée, l'étape de sa copie, puis, ratée, ce que le runtime en dit. `connexion` : la connexion à GitHub
// lancée — en route, son code à taper, ou pourquoi elle n'a pas abouti. `compte` : le compte GitHub de cet
// ordinateur, que l'écran dit en tête — absent, sa lecture est en route.
/**
 * @typedef {{
 *   poste: string,
 *   stations?: StationsDuChef,
 *   ouverture?: { station: string, projet: string, depot: string, base?: string, etape?: Progres, echec?: Extract<Ouverture, { state: "failed" }> },
 *   connexion?: Connexion,
 *   compte?: CompteGitHub,
 *   saisie?: { projet: string },
 *   essai?: import("./essai/projet-d-essai.js").EtatDeLEssai,
 * }} EtatDuPremier
 */
/**
 * @typedef {{
 *   ouvrir: (station: string, projet: string, depot: string, base?: string) => void,
 *   seConnecter: () => void,
 *   relire: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   ajouterUnProjet: () => void,
 *   essayer?: () => void,
 * } & GestesDuCompte} GestesDuPremier
 */

export const PROJET = "The project to work on";
export const PROJET_EXEMPLE = "owner/repo";
export const OUVRIR_CE_PROJET = "open this project";
export const PROJET_MANQUE = "Type the project to work on: its GitHub repository, `owner/repo`.";
export const COMPTE_MANQUE = "Connect to GitHub above, or type the project as `owner/repo`: a name alone does not say whose it is.";
export const PROJET_ILLISIBLE = "This is not a GitHub repository, `owner/repo`.";
export const LECTURE = LECTURE_DE("the stations you have paired, on GitHub");
/** @param {string} poste */
export const OUVRIR_UN_PROJET = (poste) => `Open one of your projects on ${poste}: one click, no folder to choose.`;
export const RELIRE = "read again";
export { REESSAYER };
export const PAR_SES_DEPOTS = "pick one of your repositories instead";
export const BIENVENUE = "Welcome to brigade. Add the first project its kitchen will cook.";
export const SANS_PROJET = PAS_ENCORE("project on this station");
export const DEPOT_INCONNU = "its station does not say which GitHub repository it is, so it cannot be cloned from here";
export const SANS_CUISINE = "does not cook";
/** @param {string} projet */
export const ouvertureDe = (projet) => `Opening ${projet}…`;

// Ce que le chef a tapé, lu : un dépôt `owner/repo` — ou un nom seul, complété par le compte connecté —, sinon pourquoi
// rien ne s'ouvre. Rien n'est deviné : l'adresse de GitHub se reconnaît, le reste se refuse. Le nom du projet est celui du
// dépôt, en minuscules : l'écran « Add a project » (parcours-projet/ajout.js) le nomme de même.
/** @param {string} compte @param {string} projet @returns {{ depot: string, nom: string } | { refus: string }} */
export function lireLeProjet(compte, projet) {
  const dit = projet.trim();
  const qui = compte.trim();
  if (dit === "") return { refus: PROJET_MANQUE };
  const sansAdresse = dit.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");
  const complet = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(sansAdresse) ? sansAdresse : /^[A-Za-z0-9_.-]+$/.test(sansAdresse) && qui !== "" ? `${qui}/${sansAdresse}` : undefined;
  if (complet === undefined) return { refus: /^[A-Za-z0-9_.-]+$/.test(sansAdresse) ? COMPTE_MANQUE : PROJET_ILLISIBLE };
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(complet)) return { refus: PROJET_ILLISIBLE };
  const nom = (complet.split("/")[1] ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return nom === "" ? { refus: PROJET_ILLISIBLE } : { depot: complet, nom };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Où en est le projet qu'un clic ouvre — sa copie en cours, ou ce qui l'a empêchée, avec ses gestes. Sous sa station, ou
// sous le formulaire quand il vient de là (station vide) — ou sous la liste de l'écran « Add a project » (ajout.js).
/**
 * @param {Fabrique} doc @param {NonNullable<EtatDuPremier["ouverture"]>} ouverture @param {{ connexion?: Connexion }} etat
 * @param {Pick<GestesDuPremier, "ouvrir" | "seConnecter" | "ouvrirLaPage">} geste
 */
export function ouvertureDite(doc, ouverture, etat, geste) {
  if (ouverture.echec === undefined) {
    const dit = cree(doc, "p", ouverture.etape?.sentence ?? ouvertureDe(ouverture.projet));
    dit.className = "ouverture";
    dit.role = "status";
    return [dit];
  }
  const { echec } = ouverture;
  const refus = ligneErreur(doc, phrase(doc, "span", echec.reason), echec.detail, { classe: "refus" });
  const lien = "link" in echec ? echec.link : undefined;
  return [
    refus,
    // Le bouton de la connexion, dit des mots du compte : un même geste, un même nom sur l'écran.
    ...("action" in echec && echec.action !== undefined ? connexionDite(doc, etat.connexion, SE_CONNECTER, geste) : []),
    gestes(doc, [
      ...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: !("action" in echec && echec.action !== undefined) })]),
      boutonAction(doc, REESSAYER, () => geste.ouvrir(ouverture.station, ouverture.projet, ouverture.depot, ouverture.base)),
    ]),
  ];
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
    const vide = ligneVide(doc, SANS_PROJET);
    carte.append(vide);
    return carte;
  }
  const liste = cree(doc, "p");
  liste.className = "gestes projets-de-station";
  for (const projet of station.projects) {
    const depot = projet.repository;
    const bouton = boutonDeLaFamille(doc, projet.name, undefined);
    bouton.className = "mono";
    bouton.title = depot ?? DEPOT_INCONNU;
    bouton.disabled = depot === null || enCours;
    if (ouverture?.station === station.id && ouverture.projet === projet.name) bouton.ariaPressed = "true";
    if (depot !== null) bouton.addEventListener("click", () => geste.ouvrir(station.id, projet.name, depot));
    liste.append(bouton);
  }
  carte.append(liste);
  if (ouverture === undefined || ouverture.station !== station.id) return carte;
  carte.append(...ouvertureDite(doc, ouverture, etat, geste));
  return carte;
}

// Le formulaire : le projet du chef, un champ vide à l'exemple neutre — son compte est celui que l'écran dit en tête
// connecté, jamais tapé. Ce qui est tapé se garde dans `etat.saisie` d'un affichage à l'autre. Un dépôt s'ouvre par la
// copie du runtime ; ce qui ne se lit pas le dit sous le champ, en une phrase.
/** @param {Fabrique} doc @param {EtatDuPremier} etat @param {GestesDuPremier} geste */
function formulaireDuProjet(doc, etat, geste) {
  const saisie = etat.saisie ?? { projet: "" };
  const compte = etat.compte !== undefined && "login" in etat.compte ? etat.compte.login : "";
  const racine = cree(doc, "div");
  racine.className = "formulaire-du-premier";
  /** @param {string} id @param {string} libelle @param {string} exemple @param {"projet"} cle */
  const champ = (id, libelle, exemple, cle) => {
    const nom = cree(doc, "label", libelle);
    nom.htmlFor = id;
    const entree = cree(doc, "input");
    entree.id = id;
    entree.placeholder = exemple;
    entree.value = saisie[cle];
    entree.autocomplete = "off";
    entree.spellcheck = false;
    entree.addEventListener("input", () => void (saisie[cle] = entree.value));
    return [nom, entree];
  };
  const refus = ligneErreur(doc, "", "", { classe: "refus-champ" });
  refus.ariaLive = "polite";
  const ouvrir = () => {
    const lu = lireLeProjet(compte, saisie.projet);
    if ("refus" in lu) return void phraseVers(doc, refus, lu.refus);
    phraseVers(doc, refus, "");
    geste.ouvrir("", lu.nom, lu.depot);
  };
  const enCours = etat.ouverture !== undefined && etat.ouverture.echec === undefined;
  // Tant qu'aucun compte n'est connecté, le geste recommandé est celui du compte.
  const bouton = boutonAction(doc, OUVRIR_CE_PROJET, ouvrir, { recommande: compte !== "" });
  bouton.children[0].disabled = enCours;
  // À côté, le projet d'essai (ticket 3227) : rien à taper.
  const essayer = geste.essayer === undefined ? [] : [boutonDuProjetDEssai(doc, etat.essai ?? {}, { essayer: geste.essayer })];
  racine.append(...champ("projet-du-premier", PROJET, PROJET_EXEMPLE, "projet"), refus, gestes(doc, [bouton, ...essayer]));
  if (etat.ouverture?.station === "") racine.append(...ouvertureDite(doc, etat.ouverture, etat, geste));
  return racine;
}

// Une phrase posée dans un élément qui existe déjà, ses mots entre accents graves en code.
/** @param {Fabrique} doc @param {any} pose @param {string} texte */
function phraseVers(doc, pose, texte) {
  pose.replaceChildren(...(texte === "" ? [] : [phrase(doc, "span", texte)]));
}

// L'écran entier, d'après ce que la vue tient : la phrase d'accueil et le compte, puis la phrase des stations et ce qui
// suit de leur état. Une connexion qui manque se fait du compte, en tête : la phrase des stations le dit, sans second
// bouton.
/** @param {Fabrique} doc @param {EtatDuPremier} etat @param {GestesDuPremier} geste */
export function poserPremierLancement(doc, etat, geste) {
  const racine = cree(doc, "div");
  racine.className = "premier-lancement";
  // Au premier lancement, chaque bouton est le grand, 44 px (composants/bouton, ticket 2916).
  racine.dataset.boutons = "grands";
  const accueil = cree(doc, "p", BIENVENUE);
  accueil.className = "bienvenue";
  const compte = cree(doc, "div");
  compte.className = "compte-du-premier";
  compte.append(...poserLeCompte(doc, { ...(etat.compte === undefined ? {} : { compte: etat.compte }), ...(etat.connexion === undefined ? {} : { connexion: etat.connexion }) }, geste));
  racine.append(accueil, compte);
  const { stations } = etat;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "tete-des-stations";
    return tete;
  };
  const formulaire = () => formulaireDuProjet(doc, etat, geste);
  if (stations === undefined) {
    racine.append(enTete(LECTURE), formulaire());
  } else if (stations.state === "sign-in-required") {
    racine.append(enTete(stations.reason), formulaire());
  } else if (stations.state === "unavailable") {
    // La page qui lève la panne n'est offerte qu'une fois : le compte, qui bute sur la même, l'offre déjà.
    const lien = etat.compte !== undefined && "lien" in etat.compte && etat.compte.lien === stations.link ? undefined : stations.link;
    const compteLu = etat.compte !== undefined && "login" in etat.compte;
    racine.append(
      enTete(stations.reason, stations.detail),
      formulaire(),
      gestes(doc, [...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]), boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined && compteLu })]),
    );
  } else if (stations.stations.length === 0) {
    racine.append(enTete(stations.reason ?? "No station is paired with this GitHub account yet."), formulaire(), gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]));
  } else {
    racine.append(enTete(OUVRIR_UN_PROJET(etat.poste)), formulaire(), ...stations.stations.map((station) => stationDite(doc, station, etat, geste)));
    if (stations.unreadable.length > 0) {
      const combien = stations.unreadable.length;
      const illisibles = ligneErreur(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n"));
      racine.append(illisibles);
    }
  }
  racine.append(gestes(doc, [boutonAction(doc, PAR_SES_DEPOTS, geste.ajouterUnProjet)]));
  return racine;
}
