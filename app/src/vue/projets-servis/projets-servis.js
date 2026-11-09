// @ts-check
// Les projets que la station de cet ordinateur sert elle-même, sur GitHub seul (ticket 2359, épique 2356), dans
// Settings, sous cette machine. La station tient la liste dans son état local (runtime/src/station-ordinateur/
// projets-servis.ts) ; l'écran la lit et l'écrit par le process principal, un projet à la fois.
//
// Une ligne d'en-tête dit ce que sert cet ordinateur — et, à l'installation, qu'il n'en sert aucun : la liste est vide,
// et la station ne prend aucun ticket. Puis une ligne par projet de l'app : son nom, son dépôt, `served` ou
// `not served`, et une case — chaque ligne est la rangée de réglage de l'app (composants/reglage, ticket 2920), et la
// case s'applique dès qu'elle change, sans « save ». Un projet dont l'app ne connaît pas le dépôt a sa case muette, la
// raison au survol. Un dépôt de la liste qu'aucun projet de l'app ne porte garde sa ligne, cochée : le chef voit tout ce
// qui cuit ici, et peut le retirer.
//
// La case ne change rien à l'écran avant la réponse de la station : la valeur dite est celle de la liste écrite. Un
// refus se dit sous la ligne, en une ligne, sa suite au survol.
//
// `tenirLesProjetsServis` garde l'état de l'écran et ses gestes ; `poserLesProjetsServis` le dessine. Ni l'un ni
// l'autre ne touche `document` : la vue leur donne une fabrique (briques.js).

import { survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ditDuReglage, rangeeDeReglage } from "../composants/reglage/reglage.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { CET_ORDINATEUR, ENREGISTREMENT, NON_ATTEINT, LECTURE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ depots: string[] } | { refus: string }} LectureDesProjetsServis */
/**
 * Ce que l'écran demande au process principal. Absents, ou `projetsServis` qui ne rend rien : cet appareil n'a pas de
 * station (un téléphone), et rien ne se pose.
 * @typedef {{
 *   projetsServis?(): Promise<LectureDesProjetsServis | undefined>,
 *   servirUnProjet?(depot: string, servi: boolean): Promise<LectureDesProjetsServis>,
 * }} PontDesProjetsServis
 */
/** Un projet de l'app : son nom, et son dépôt GitHub s'il est connu. @typedef {{ nom: string, depot?: string }} ProjetDeLApp */
/** @typedef {{ depot: string, ligne: string, detail: string }} Refus */
/** @typedef {{ lecture?: LectureDesProjetsServis, enCours?: string, refus?: Refus }} EtatDesProjetsServis */
/** @typedef {{ servir(depot: string, servi: boolean): void }} GestesDesProjetsServis */

// Les mots de l'écran. `ici` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »).
export const TITRE = (/** @type {string} */ ici) => `projects ${ici} serves`;
export const AUCUN = (/** @type {string} */ ici) => `${ici} serves no project`;
export const SERT = (/** @type {number} */ combien) => (combien === 1 ? "serves 1 project" : `serves ${combien} projects`);
export const AIDE = (/** @type {string} */ ici) =>
  `${ici}'s station cooks only the projects chosen here, straight from GitHub: it clones each one on ${CET_ORDINATEUR} and takes its tickets. With none chosen, it takes no ticket. A change is taken into account at its next turn, within two minutes.`;
export const SERVI = "served";
export const PAS_SERVI = "not served";
export const ECRITURE = ENREGISTREMENT;
export const SANS_DEPOT = "The app does not know this project's GitHub repository: add it again from its repository to serve it here.";
export const HORS_DE_L_APP = "Not one of this app's projects: the station serves it because it is on its list.";
export const ILLISIBLE = NON_ATTEINT("projects served here");
export const INJOIGNABLE = NON_ATTEINT(`${CET_ORDINATEUR}'s station`);
export const CASE = (/** @type {string} */ nom, /** @type {string} */ ici) => `serve ${nom} on ${ici}`;

// Un dépôt se compare sans égard à la casse, comme la station le fait (projets-servis.ts).
const cle = (/** @type {string} */ depot) => depot.toLowerCase();

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refus */
export function refusDit(refus) {
  const [ligne = refus, ...suite] = refus.split(" — ");
  return { ligne: `nothing was written: ${ligne.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

// L'état de l'écran et ses gestes. `rendre` : l'état a changé, l'écran se redessine.
/** @param {{ pont: PontDesProjetsServis, rendre: () => void }} options */
export function tenirLesProjetsServis({ pont, rendre }) {
  /** @type {EtatDesProjetsServis | undefined} */
  let etat;
  let tour = 0;

  // La liste que la station tient. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function lire() {
    const sien = ++tour;
    if (typeof pont.projetsServis !== "function") {
      etat = undefined;
      return rendre();
    }
    /** @type {LectureDesProjetsServis | undefined} */
    const lue = await pont.projetsServis().catch((erreur) => ({ refus: erreur instanceof Error ? erreur.message : String(erreur) }));
    if (sien !== tour) return;
    if (lue === undefined) etat = undefined;
    else {
      etat ??= {};
      etat.lecture = lue;
    }
    rendre();
  }

  return {
    /** @returns {EtatDesProjetsServis | undefined} */
    get etat() {
      return etat;
    },
    lire,
    /** @type {GestesDesProjetsServis} */
    gestes: {
      // Un projet à la fois : tant que la station n'a pas répondu, les cases attendent.
      servir(depot, servi) {
        if (etat === undefined || etat.enCours !== undefined || typeof pont.servirUnProjet !== "function") return;
        const ecrit = etat;
        ecrit.enCours = cle(depot);
        delete ecrit.refus;
        rendre();
        // Une écriture rend la liste écrite : elle remplace celle de l'écran. Une lecture en vol n'y revient pas.
        tour++;
        void pont
          .servirUnProjet(depot, servi)
          .catch((erreur) => ({ refus: `${INJOIGNABLE} — ${erreur instanceof Error ? erreur.message : String(erreur)}` }))
          .then((rendu) => {
            delete ecrit.enCours;
            if ("refus" in rendu) ecrit.refus = { depot: cle(depot), ...refusDit(rendu.refus) };
            else ecrit.lecture = rendu;
            rendre();
          });
      },
    },
  };
}

// Les lignes de l'écran : une par projet de l'app, dans l'ordre de l'app, puis une par dépôt de la liste qu'aucun
// projet ne porte.
/** @param {readonly ProjetDeLApp[]} projets @param {readonly string[]} depots */
export function lignesDesProjets(projets, depots) {
  const servis = new Set(depots.map(cle));
  const connus = new Set();
  /** @type {{ nom: string, depot: string | null, servi: boolean, horsDeLApp: boolean }[]} */
  const lignes = [];
  for (const projet of projets) {
    const depot = projet.depot?.trim() || null;
    if (depot !== null) connus.add(cle(depot));
    lignes.push({ nom: projet.nom, depot, servi: depot !== null && servis.has(cle(depot)), horsDeLApp: false });
  }
  for (const depot of depots) if (!connus.has(cle(depot))) lignes.push({ nom: depot, depot, servi: true, horsDeLApp: true });
  return lignes;
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const element = doc.createElement(balise);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

// L'écran : la ligne d'en-tête — ce que sert cet ordinateur, ou qu'il n'en sert aucun —, puis une ligne par projet.
/** @param {Fabrique} doc @param {{ etat: EtatDesProjetsServis, projets: readonly ProjetDeLApp[], ici: string }} quoi @param {GestesDesProjetsServis} gestes */
export function poserLesProjetsServis(doc, { etat, projets, ici }, gestes) {
  const racine = cree(doc, "div");
  racine.className = "projets-servis";
  racine.ariaLive = "polite";
  const lue = etat.lecture;
  const depots = lue !== undefined && "depots" in lue ? lue.depots : undefined;

  /** @type {any[]} */
  let valeur;
  if (lue === undefined) valeur = [cree(doc, "span", LECTURE)];
  else if (depots === undefined) valeur = [ligneErreur(doc, ILLISIBLE, "refus" in lue ? lue.refus : "")];
  else if (depots.length === 0) {
    const aucun = ligneVide(doc, AUCUN(ici), { classe: "aucun", balise: "strong" });
    valeur = [aucun, survol(doc, AIDE(ici))];
  } else valeur = [cree(doc, "span", SERT(depots.length)), survol(doc, AIDE(ici))];
  const tete = rangeeDeReglage(doc, { nom: TITRE(ici), valeur, classe: "tete" });
  racine.append(tete);
  if (depots === undefined) return racine;

  for (const ligne of lignesDesProjets(projets, depots)) {
    const enCours = ligne.depot !== null && etat.enCours === cle(ligne.depot);
    // Le dépôt d'un projet de l'app se lit à côté de son nom ; un dépôt hors de l'app est son nom.
    /** @type {any} */
    let depotDit;
    if (!ligne.horsDeLApp && ligne.depot !== null) {
      depotDit = cree(doc, "small", ligne.depot);
      depotDit.className = "mono depot";
    }
    /** @type {any[]} */
    const vaut = [];
    if (enCours) vaut.push(cree(doc, "span", ECRITURE));
    else if (ligne.depot === null) vaut.push(cree(doc, "span", "–"), survol(doc, SANS_DEPOT));
    else {
      const mot = cree(doc, ligne.servi ? "strong" : "span", ligne.servi ? SERVI : PAS_SERVI);
      if (ligne.servi) mot.className = "servi";
      else mot.className = "pas-servi";
      vaut.push(mot);
      if (ligne.horsDeLApp) vaut.push(survol(doc, HORS_DE_L_APP));
    }
    const coche = cree(doc, "input");
    coche.type = "checkbox";
    coche.checked = ligne.servi;
    coche.ariaLabel = CASE(ligne.nom, ici);
    coche.disabled = ligne.depot === null || etat.enCours !== undefined;
    const depot = ligne.depot;
    if (depot !== null) coche.addEventListener("change", () => gestes.servir(depot, coche.checked === true));
    const refus = etat.refus;
    const sien = refus !== undefined && depot !== null && refus.depot === cle(depot) ? { refus: refus.ligne, detail: refus.detail } : undefined;
    const rang = rangeeDeReglage(doc, { nom: ligne.nom, valeur: vaut, controle: [coche], dessous: ditDuReglage(doc, sien) });
    if (depotDit !== undefined) rang.children[0].append(depotDit);
    if (ligne.horsDeLApp) rang.children[0].className = "nom mono";
    rang.dataset.projet = ligne.nom;
    racine.append(rang);
  }
  return racine;
}
