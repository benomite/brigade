// @ts-check
// L'étape « projet » du parcours d'ajout (ticket 2476, épique 2473) : le chef choisit le dépôt à
// ajouter parmi ceux de son compte et de ses organisations — `gh api /user/repos` les rend tous —,
// filtrés par un champ de recherche, ou colle une URL GitHub ou `owner/repo` : n'importe quel dépôt,
// y compris public et qui n'est pas à lui. Choisi ou résolu, le dépôt est ajouté et le parcours passe
// à la suite. Ce qui n'est pas un dépôt se dit en une phrase, et rien n'est ajouté.
// Tout est lu par le process principal : ce module reçoit `resoudre` et `ajouter`, ne touche pas
// `document` — il reçoit de quoi créer un élément (briques.js) — et rend des éléments.

import { poserInstallationDuDepot } from "../ajout-projet/installation-du-depot.js";
import { boutonAction, lectureIndisponible } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ depot: string, base: string }} Depot */
/** @typedef {{ depot: string, base: string } | { refus: string }} Resolu */

export const ATTENDU = "Pick the repository of the project you add, or paste any repository.";
export const RECHERCHE = "search your repositories";
export const COLLER = "paste a GitHub URL or owner/repo";
export const AJOUTER = "add";
export const AUCUN = "No repository matches.";
export const PAS_UN_DEPOT = "That is not a GitHub repository: paste a URL like https://github.com/owner/repo, or owner/repo.";

const NOM = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const DEPOT = "[A-Za-z0-9._-]+";
const FORME = new RegExp(`^(${NOM})/(${DEPOT})$`);
const SUFFIXE_GIT = /\.git$/;

// Ce que le chef a collé : `owner/repo`, ou une URL de GitHub (https, avec ou sans `www.`, un
// suffixe `.git`, une page du dépôt derrière). Le nom du dépôt, ou rien : ce n'est pas un dépôt.
/** @param {string} texte @returns {string | null} */
export function depotCollePar(texte) {
  let brut = texte.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(brut);
  if (url !== null) brut = (url[1] ?? "").split(/[?#]/)[0]?.split("/").slice(0, 2).join("/") ?? "";
  brut = brut.replace(SUFFIXE_GIT, "");
  const forme = FORME.exec(brut);
  if (forme === null || forme[2] === "." || forme[2] === "..") return null;
  return `${forme[1]}/${forme[2]}`;
}

// Les dépôts dont le nom contient la recherche, sans égard à la casse ; vide, tous.
/** @param {readonly Depot[]} depots @param {string} recherche */
export function filtrer(depots, recherche) {
  const voulu = recherche.trim().toLowerCase();
  return voulu === "" ? [...depots] : depots.filter(({ depot }) => depot.toLowerCase().includes(voulu));
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'étape. `depots` : ceux du compte et de ses organisations, ou `{ refus }` — la lecture a échoué, le
// collage reste possible. `resoudre(depot)` lit un dépôt par son nom. `ajouter(depot)` l'ajoute, et
// rend `{ refus }` s'il ne l'est pas. `suivante()` : le parcours passe à l'étape d'après. `verifier(depot)` et
// `installer(depot)` : le contrat du runtime (`checkRepoSetup`, `runRepoSetup`).
/**
 * @param {Fabrique} doc
 * @param {{
 *   depots: readonly Depot[] | { refus: string },
 *   resoudre: (depot: string) => Promise<Resolu>,
 *   ajouter: (depot: Depot) => Promise<{ refus: string } | void>,
 *   suivante: () => void,
 *   verifier: (depot: string) => Promise<import("../ajout-projet/installation-du-depot.js").EtatDuDepot>,
 *   installer: (depot: string) => Promise<import("../ajout-projet/installation-du-depot.js").EtatDuDepot>,
 * }} donnees
 */
export function poserEtapeProjet(doc, { depots, resoudre, ajouter, suivante, verifier, installer }) {
  const racine = cree(doc, "section");
  racine.className = "etape-projet";
  racine.ariaLabel = "Pick the project";
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";

  const erreur = cree(doc, "p");
  erreur.className = "erreur";
  erreur.role = "alert";
  const dire = (/** @type {string} */ ligne) => {
    erreur.textContent = ligne;
  };

  // Ce que la vérification du dépôt choisi dit, sous l'attendu : prêt, ce qui lui manque, sa préparation.
  const installation = cree(doc, "div");
  installation.className = "installation";

  // Un dépôt choisi ou résolu : vérifié, puis ajouté et la suite — prêt d'emblée, sans geste de plus ; pas prêt, le
  // bloc de la vérification attend le chef. Un autre dépôt choisi pendant une vérification prend sa place ; pendant
  // une préparation ou un ajout, il attend : la phrase le dit.
  /** @type {Depot | undefined} */
  let choisi;
  /** @type {HTMLElement | undefined} */
  let bloc;
  let enCours = false;
  const occupe = () => {
    if (enCours && choisi !== undefined) return `${choisi.depot} is being added.`;
    if (choisi !== undefined && bloc?.dataset.etat === "en-cours") return `${choisi.depot} is being set up.`;
    return undefined;
  };
  const adopter = (/** @type {Depot} */ depot) => {
    const attente = occupe();
    if (attente !== undefined) return dire(attente);
    choisi = depot;
    dire("");
    bloc = poserInstallationDuDepot(doc, {
      depot: depot.depot,
      verifier,
      installer,
      continuer: () => {
        if (choisi === depot) void ajouterLeDepot(depot);
      },
    });
    installation.replaceChildren(bloc);
  };

  // Le dépôt ajouté, puis la suite ; refusé, la phrase, et rien ne bouge.
  const ajouterLeDepot = async (/** @type {Depot} */ depot) => {
    enCours = true;
    dire("");
    try {
      const refus = await ajouter(depot);
      if (refus !== undefined) dire(refus.refus);
      else {
        dire("");
        suivante();
      }
    } catch {
      dire(`${depot.depot} could not be added.`);
    } finally {
      enCours = false;
    }
  };

  const recherche = cree(doc, "input");
  recherche.type = "search";
  recherche.className = "recherche";
  recherche.ariaLabel = RECHERCHE;
  recherche.placeholder = RECHERCHE;
  const liste = cree(doc, "ul");
  liste.className = "depots";
  const poserListe = () => {
    if (!Array.isArray(depots)) return;
    const vus = filtrer(depots, recherche.value ?? "");
    liste.replaceChildren(
      ...(vus.length === 0
        ? [Object.assign(cree(doc, "li", AUCUN), { className: "aucun" })]
        : vus.map(({ depot, base }) => {
            const ligne = cree(doc, "li");
            ligne.className = "depot";
            ligne.dataset.depot = depot;
            ligne.append(boutonAction(doc, depot, () => void adopter({ depot, base }), {}));
            return ligne;
          })),
    );
  };
  recherche.addEventListener("input", poserListe);
  if ("refus" in depots) racine.append(attendu, lectureIndisponible(doc, "repositories unavailable", depots.refus));
  else {
    poserListe();
    racine.append(attendu, recherche, liste);
  }

  const colle = cree(doc, "input");
  colle.type = "text";
  colle.className = "colle";
  colle.ariaLabel = COLLER;
  colle.placeholder = COLLER;
  const resoudreLeCollage = async () => {
    const nom = depotCollePar(colle.value ?? "");
    if (nom === null) return dire(PAS_UN_DEPOT);
    try {
      const resolu = await resoudre(nom);
      if ("refus" in resolu) return dire(resolu.refus);
      await adopter(resolu);
    } catch {
      dire(`${nom} could not be read on GitHub.`);
    }
  };
  colle.addEventListener("keydown", (/** @type {{ key: string }} */ evenement) => {
    if (evenement.key === "Enter") void resoudreLeCollage();
  });
  const coller = cree(doc, "div");
  coller.className = "coller";
  coller.append(colle, boutonAction(doc, AJOUTER, () => void resoudreLeCollage(), { recommande: true }));
  racine.append(coller, installation, erreur);
  return racine;
}
