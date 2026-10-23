// @ts-check
// Ce qui bloque un projet, sur sa page (ticket 1399, épique 1393) : tous ses blocages, tels que sa principale les
// publie (ticket 1394, `blocages` du suivi), une ligne chacun. Ce qui est bloqué en une phrase, pourquoi dessous ; le
// geste, quand l'app sait le faire, en bouton ; quand il se fait hors de l'app, un lien qui nomme la page exacte
// et l'ouvre. Ce qu'une commande a dit n'est jamais le message : il reste replié derrière « details ». Aucun
// blocage, aucune section. Ce module ne connaît aucun blocage : la vue lui donne les gestes qu'elle sait faire,
// par l'identifiant d'action que le runtime publie — un blocage dont l'app ne sait pas le geste se montre sans
// bouton, et le dit. Il ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projets/demande.ts").Blocage} Blocage */
// Un geste que l'app sait faire : son libellé et ce qu'il fait — ou, impossible pour l'instant, pourquoi en une ligne.
/** @typedef {{ libelle: string, faire: () => void } | { sans: string }} Geste */

export const DETAILS = "details";
export const ECHEC_DU_SETUP = "setup";
export const AIDE_DU_SETUP = "You can open the details, or ask the second.";
export const SANS_GESTE = "this app cannot do it for you yet";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La page qu'un lien ouvre, nommée : son hôte et son chemin, sans `https://`, sans requête ni barre finale —
// « github.com/settings/personal-access-tokens ».
/** @param {string} url */
export function lieuDe(url) {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

// Le titre de la section : ce qu'on attend du chef, en une phrase.
/** @param {string} projet @param {number} combien */
export const titreDesBlocages = (projet, combien) => (combien === 1 ? `One thing blocks ${projet}` : `${combien} things block ${projet}`);

/**
 * @param {Fabrique} doc @param {Blocage} blocage
 * @param {{ gestes: Readonly<Record<string, Geste>>, ouvrir: (url: string) => void, deplies: ReadonlySet<string>, deplier: (id: string, ouvert: boolean) => void }} faire
 */
function ligne(doc, blocage, { gestes, ouvrir, deplies, deplier }) {
  const pose = cree(doc, "li");
  pose.className = "blocage";
  pose.dataset.blocage = blocage.id;
  const message = cree(doc, "p", blocage.message);
  message.className = "message";
  pose.append(message);
  // Le producteur qui n'a qu'une phrase la donne pour les deux : elle ne se dit qu'une fois.
  if (blocage.cause !== blocage.message) {
    const cause = cree(doc, "p", blocage.cause);
    cause.className = "cause";
    pose.append(cause);
  }
  // Un échec du setup qu'aucun besoin connu n'explique : une ligne dit au chef ce qu'il peut faire.
  if (blocage.id === ECHEC_DU_SETUP) {
    const aide = cree(doc, "p", AIDE_DU_SETUP);
    aide.className = "aide-du-blocage";
    pose.append(aide);
  }
  const geste = blocage.action === undefined ? undefined : gestes[blocage.action];
  if (geste !== undefined || blocage.link !== undefined || blocage.action !== undefined) {
    const gestesDuBlocage = cree(doc, "p");
    gestesDuBlocage.className = "gestes-du-blocage";
    if (geste !== undefined && "faire" in geste) gestesDuBlocage.append(boutonAction(doc, geste.libelle, geste.faire, { recommande: true }));
    else if (geste !== undefined) {
      const sans = cree(doc, "span", geste.sans);
      sans.className = "sans-geste";
      gestesDuBlocage.append(sans);
    } else if (blocage.action !== undefined) {
      // Un geste que cette version de l'app ne connaît pas : pas de bouton qui ne ferait rien.
      const sans = cree(doc, "span", SANS_GESTE);
      sans.className = "sans-geste";
      gestesDuBlocage.append(sans, survol(doc, `the station names the gesture “${blocage.action}”, which this version of the app does not know`));
    }
    if (blocage.link !== undefined) {
      const url = blocage.link;
      const lien = cree(doc, "a", `open ${lieuDe(url)}`);
      lien.className = "lien-du-blocage";
      lien.href = url;
      lien.title = url;
      lien.addEventListener("click", (/** @type {{ preventDefault(): void }} */ evenement) => {
        evenement.preventDefault();
        ouvrir(url);
      });
      gestesDuBlocage.append(lien);
    }
    pose.append(gestesDuBlocage);
  }
  if (blocage.detail !== undefined) {
    // Replié, sauf si le chef l'a déplié : une relecture ne le referme pas.
    const details = cree(doc, "details");
    if (deplies.has(blocage.id)) details.open = true;
    details.addEventListener("toggle", () => deplier(blocage.id, details.open === true));
    details.append(cree(doc, "summary", DETAILS), cree(doc, "pre", blocage.detail));
    pose.append(details);
  }
  return pose;
}

// La section à poser sur la page du projet, ou null : rien ne le bloque.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, blocages: readonly Blocage[], gestes?: Readonly<Record<string, Geste>>, ouvrir?: (url: string) => void, deplies?: ReadonlySet<string>, deplier?: (id: string, ouvert: boolean) => void }} lu
 */
export function poserBlocages(doc, { projet, blocages, gestes = {}, ouvrir = () => {}, deplies = new Set(), deplier = () => {} }) {
  if (blocages.length === 0) return null;
  const pose = cree(doc, "div");
  pose.className = "blocages";
  const liste = cree(doc, "ul");
  liste.append(...blocages.map((blocage) => ligne(doc, blocage, { gestes, ouvrir, deplies, deplier })));
  pose.append(cree(doc, "h3", titreDesBlocages(projet, blocages.length)), liste);
  return pose;
}
