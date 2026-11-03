// @ts-check
// La ligne du disjoncteur, en tête de TODO (#2140, épique #2134) : la cuisine retenue par son disjoncteur — ce qui ne va
// pas, en une ligne, ce que la station en écrit au survol — et un seul bouton, « Resume ». Un clic reprend : le process
// principal poste `/resume` sur l'issue `brigade:breaker-open` de la cuisine, sur GitHub (github/breaker-resume.ts), et
// la station referme le disjoncteur à sa veille suivante. Ni commande à recopier, ni bouton pour la copier : le geste
// est le bouton, sans confirmation — son prix est au survol.
//
// Pendant le clic, le bouton attend, et la ligne dit que la demande part ; postée, elle dit « Resume requested »
// jusqu'à ce que la station ne dise plus le disjoncteur ouvert — le bouton n'est plus là, un second clic posterait un
// second commentaire. Refusée — GitHub n'a pas pris le commentaire, ou aucune issue ne porte le label —, la ligne le
// dit en une ligne, ce que GitHub en a dit au survol, et « Resume » est rendu pour réessayer.
//
// Sur un autre onglet que Rail, la ligne du disjoncteur reste dans la bande d'alertes, et son contrôle est le même
// (`poserReprise`) : un seul geste, dit partout de la même façon.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et ce que le clic appelle, et
// rend des éléments. La vue tient l'état, projet par projet.

import { boutonAction, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../github/breaker-resume.ts").RenduDeLaReprise} RenduDeLaReprise */

// Le geste en route depuis cette vue, pour un projet.
//   repos     rien n'est parti d'ici : « Resume » attend le chef
//   envoi     la demande part : le bouton attend
//   demandee  `/resume` est posté sur l'issue du disjoncteur (`url`, l'adresse du commentaire) : la station le lit
//   refus     rien n'a été posté (`dit`, et `detail` au survol) : « Resume » est rendu
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi" }
 *   | { etape: "demandee", url: string | null }
 *   | { etape: "refus", dit: string, detail: string }} Etat
 */

/** @type {Etat} */
export const REPOS = { etape: "repos" };

export const REPRENDRE = "Resume";
export const EN_ROUTE = "requesting the resume on GitHub…";
export const DEMANDEE = "Resume requested";
export const DEMANDEE_DETAIL = "posted on the kitchen's breaker issue on GitHub: the station closes the breaker at its next poll, and this line leaves";
// Le prix du geste, au survol du bouton : celui que la bande disait du même geste (alertes.ts).
export const PRIX = "the breaker closes: queued tickets start again at once, on your quota";
export const TITRE = "the breaker holds the kitchen";

// L'étape qui suit la réponse du process principal.
/** @param {RenduDeLaReprise | undefined} rendu @returns {Etat} */
export function apresRendu(rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "resume not requested: this project is no longer in the app", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "demandee", url: rendu.demandee.url };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le contrôle de la reprise, dans son état : « Resume », ce qui part, ce qui a été demandé, ou pourquoi rien.
/** @param {Fabrique} doc @param {Etat} etat @param {() => void} reprendre @returns {any[]} */
export function poserReprise(doc, etat, reprendre) {
  if (etat.etape === "demandee") {
    const dit = cree(doc, "span");
    dit.className = "reprise-demandee";
    dit.append(cree(doc, "span", DEMANDEE), survol(doc, etat.url === null ? DEMANDEE_DETAIL : `${DEMANDEE_DETAIL} — ${etat.url}`));
    return [dit];
  }
  const groupe = boutonAction(doc, REPRENDRE, reprendre, { recommande: true, prix: PRIX });
  const bouton = groupe.children?.[0];
  if (bouton !== undefined) {
    bouton.dataset.geste = "reprendre-disjoncteur";
    bouton.disabled = etat.etape === "envoi";
  }
  if (etat.etape === "envoi") {
    const part = cree(doc, "span", EN_ROUTE);
    part.className = "en-route";
    return [groupe, part];
  }
  if (etat.etape === "refus") {
    const refus = cree(doc, "span");
    refus.className = "refus";
    refus.role = "alert";
    refus.append(cree(doc, "span", etat.dit));
    if (etat.detail.trim() !== "") refus.append(survol(doc, etat.detail));
    return [groupe, refus];
  }
  return [groupe];
}

// La ligne, en tête de TODO : `marque`, la pastille que la vue pose ; `dit`, ce qui ne va pas ; `releve`, ce que la
// station en écrit, mot pour mot — au survol, jamais à plat.
/**
 * @param {Fabrique} doc
 * @param {{ marque: any, dit: string, releve?: string }} ligne
 * @param {Etat} etat
 * @param {() => void} reprendre
 */
export function poserLigneDuDisjoncteur(doc, { marque, dit, releve }, etat, reprendre) {
  const racine = cree(doc, "div");
  racine.className = "ligne-disjoncteur";
  racine.ariaLabel = TITRE;
  racine.dataset.etape = etat.etape;
  const tete = cree(doc, "p");
  tete.className = "dit";
  tete.append(marque, cree(doc, "strong", dit), ...(releve === undefined || releve.trim() === "" ? [] : [survol(doc, releve)]));
  const controle = cree(doc, "div");
  controle.className = "controle";
  controle.append(...poserReprise(doc, etat, reprendre));
  racine.append(tete, controle);
  return racine;
}
