// @ts-check
// Le parcours d'un projet neuf, sur sa page (ticket 1111, épique 1108) : de « projet confié à une
// station » à « premier ticket posé », en quatre étapes — le dépôt, la machine qui le cuit, la
// préparation du dépôt, le premier ticket —, telles que sa station principale les publie (ticket 1110,
// runtime/src/onboarding/etat.ts). En tête, ce qu'on attend du chef, en une phrase ; puis chaque
// étape, faite, courante ou à venir, et ce qui s'y passe, en une phrase. Le geste attendu est un
// bouton, qui ouvre sa page de GitHub ; où le faire se dit à côté.
// L'étape de préparation montre son ticket — un bouton qui l'ouvre —, son état — en cours, en échec,
// à relire —, et, en échec, la raison en une phrase et l'heure du prochain essai. Aucun délai
// annoncé ne survit à son heure : passée, la ligne dit que l'essai est dû, pas « dans une minute ».
// Sur l'étape de la machine, quand le runtime attend une décision (une station sans bac à sable), la
// phrase du runtime se pose en avertissement — ses cooks tournent sans bac à sable, rien ne part
// avant le choix du chef — et les deux gestes sont des boutons : continuer sans bac à sable, ou
// choisir une autre station. Choisi, l'avertissement s'en va dès que la station publie l'état suivant.
// Prêt, le parcours dit que le premier ticket peut être posé, et se range d'un geste.
// Tout est lu par le process principal (projets/demande.ts, `lireOnboarding`) : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Onboarding} Onboarding */
/** @typedef {import("../../projects/request.ts").StepDOnboarding} Step */
/** @typedef {import("../../projects/request.ts").PreparationDuRepository} Preparation */

// Ce que dit l'état de chaque étape, à côté de son titre.
export const STATES_D_STEP = { faite: "done", courante: "now", "a-venir": "to come" };
// L'état du ticket de préparation, en mots.
export const STATES_DE_PREPARATION = { "en-cours": "in progress", "en-echec": "failed", "a-relire": "to review", suspendu: "suspended", faite: "merged", abandonne: "abandoned" };
export const ECARTER = "dismiss";
export const POSER_LE_FIRST = "post the first ticket";
export const OUVRIR_LA_PR = "open the PR";
export const CONTINUER_SANS_BAC = "continue without sandbox";
export const AUTRE_STATION = "choose another station";

/** @param {string} project */
export const pret = (project) => `${project} is ready: post your first ticket with the \`fire\` label`;

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase du runtime, ses mots entre accents graves — un label, `fire` — posés en code.
/** @param {Fabrique} doc @param {string} balise @param {string} texte */
export function phrase(doc, balise, texte) {
  const pose = doc.createElement(balise);
  texte.split("`").forEach((morceau, rang) => {
    if (morceau === "") return;
    if (rang % 2 === 0) pose.append(morceau);
    else {
      const code = cree(doc, "code", morceau);
      code.className = "mono";
      pose.append(code);
    }
  });
  return pose;
}

// Un geste : la brique commune, sans prix — ouvrir une page de GitHub ne coûte rien.
/** @param {Fabrique} doc @param {string} libelle @param {() => void} action @param {boolean} recommande */
const button = (doc, libelle, action, recommande) => buttonAction(doc, libelle, action, { recommande });

// L'heure du prochain essai d'une préparation en échec, d'après l'instant où la page se pose.
// Passée, elle ne s'annonce plus : l'essai est dû, la prochaine lecture dira ce qu'il a donné.
/** @param {string | null} prochainTrial @param {number} maintenant */
export function prochainTrialDit(prochainTrial, maintenant) {
  if (prochainTrial === null) return "It is not retried by itself.";
  const instant = Date.parse(prochainTrial);
  if (Number.isNaN(instant)) return "It is retried by itself.";
  const reste = instant - maintenant;
  if (reste <= 0) return "Its retry is due now.";
  const heure = new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Next retry at ${heure}, in ${Math.ceil(reste / 60_000)} min.`;
}

// Ce qu'on attend du chef, en tête : le geste de l'étape courante ; sans geste, une préparation en
// échec le dit ; sinon, rien à faire, et l'étape où il en est.
/** @param {string} project @param {Onboarding} onboarding */
export function attenduDit(project, onboarding) {
  const rang = onboarding.etapes.findIndex(({ etat: state }) => state === "courante");
  const courante = onboarding.etapes[rang];
  if (courante?.geste) return courante.geste.quoi;
  const preparation = onboarding.preparation;
  if (courante?.etape === "preparation" && preparation?.etat === "en-echec") return `The preparation of ${project} failed: ${preparation.prochainEssai === null ? "it is not retried by itself" : "nothing to do, it is retried by itself"}.`;
  if (courante === undefined) return `${project} is being set up.`;
  return `Nothing to do: ${project} is being set up — step ${rang + 1} of ${onboarding.etapes.length}, ${courante.titre.toLowerCase()}.`;
}

// Le geste attendu sur l'étape courante : un bouton par page où le faire — le premier se distingue —,
// et où le faire, à côté. Sans page, le geste se dit en une phrase.
/** @param {Fabrique} doc @param {NonNullable<Step["geste"]>} action @param {(url: string) => void} ouvrir */
function poserAction(doc, action, ouvrir) {
  const pose = cree(doc, "div");
  pose.className = "geste";
  const libelle = (/** @type {string} */ url) => (action.liens.length === 1 ? action.quoi.replace(/\.$/, "") : `open ${url.replace(/^https:\/\/github\.com\/(apps\/)?/, "").replace(/\/.*$/, "")}`);
  if (action.liens.length === 0) pose.append(phrase(doc, "span", action.quoi));
  else pose.append(...action.liens.map((url, rang) => button(doc, libelle(url), () => ouvrir(url), rang === 0)));
  if (action.ou !== "") {
    const ou = cree(doc, "small", action.ou);
    ou.className = "ou";
    pose.append(ou);
  }
  return pose;
}

// Le ticket de préparation : son numéro, un bouton qui l'ouvre, son état ; à relire, sa PR. En
// échec, la raison et l'heure du prochain essai, à la place du vide.
/** @param {Fabrique} doc @param {Preparation} preparation @param {number} maintenant @param {(url: string) => void} ouvrir @param {readonly string[]} dejaOuverte */
function poserPreparation(doc, preparation, maintenant, ouvrir, dejaOuverte) {
  const poses = [];
  const line = cree(doc, "p");
  line.className = "ticket";
  const state = cree(doc, "span", STATES_DE_PREPARATION[preparation.etat]);
  state.className = "etat-de-preparation";
  state.dataset.etat = preparation.etat;
  line.append(button(doc, `#${preparation.ticket}`, () => ouvrir(preparation.url), false), state);
  // Sa PR, quand aucun geste de l'étape ne l'ouvre déjà : le même lien ne s'offre pas deux fois.
  const pr = preparation.pr;
  if (preparation.etat === "a-relire" && pr !== null && !dejaOuverte.includes(pr)) line.append(button(doc, OUVRIR_LA_PR, () => ouvrir(pr), false));
  poses.push(line);
  if (preparation.etat === "en-echec") {
    poses.push(lineError(doc, preparation.raison ?? "Its cook failed.", prochainTrialDit(preparation.prochainEssai, maintenant), { classe: "echec", balise: "div", alerte: true }));
  }
  return poses;
}

// Le chef vient de continuer sans bac à sable : la machine est faite, la préparation est la courante, sans
// avertissement — jusqu'à ce que la station publie l'état qui le dit pour de bon.
/** @param {Onboarding} onboarding @returns {Onboarding} */
export function apresLaDecision(onboarding) {
  let suivante = false;
  const steps = onboarding.etapes.map((step) => {
    if (step.etape === "machine" && step.etat === "courante") {
      suivante = true;
      return { ...step, etat: /** @type {const} */ ("faite"), dit: "You decided to continue without a sandbox: the station starts on its next turn, in restricted mode: no sandbox.", geste: null };
    }
    if (suivante && step.etat === "a-venir") {
      suivante = false;
      return { ...step, etat: /** @type {const} */ ("courante") };
    }
    return step;
  });
  return { ...onboarding, etapes: steps, courante: steps.find(({ etat: state }) => state === "courante")?.etape ?? onboarding.courante, decisionAttendue: false };
}

// Le parcours de `projet`, ou rien : sans onboarding publié, ou prêt et son premier ticket déjà posé.
// `ouvrir` : ouvre une page de GitHub ; `ecarter` : le chef range le parcours prêt ; `continuerSansBac` et
// `autreStation` : les deux choix devant une station sans bac à sable.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, onboarding: Onboarding | null | undefined, maintenant: number, ouvrir: (url: string) => void, ecarter: () => void, continuerSansBac?: () => void, autreStation?: () => void }} donnees
 */
export function poserJourney(doc, { projet: project, onboarding, maintenant, ouvrir, ecarter, continuerSansBac = () => {}, autreStation = () => {} }) {
  if (onboarding === null || onboarding === undefined) return null;
  const racine = cree(doc, "section");
  racine.ariaLabel = `Getting ${project} ready`;
  if (onboarding.termine) {
    const first = onboarding.etapes.find(({ etape: step }) => step === "premier-ticket");
    if (first?.etat === "faite") return null;
    racine.className = "parcours pret";
    const tete = phrase(doc, "p", pret(project));
    tete.className = "attendu";
    const actions = cree(doc, "div");
    actions.className = "gestes-du-parcours";
    const nouvelle = first?.geste?.liens[0];
    if (nouvelle !== undefined) actions.append(button(doc, POSER_LE_FIRST, () => ouvrir(nouvelle), true));
    actions.append(button(doc, ECARTER, ecarter, nouvelle === undefined));
    racine.append(tete, actions);
    return racine;
  }
  racine.className = "parcours";
  const tete = phrase(doc, "p", attenduDit(project, onboarding));
  tete.className = "attendu";
  const liste = cree(doc, "ol");
  liste.className = "etapes";
  for (const step of onboarding.etapes) {
    const pose = cree(doc, "li");
    pose.className = "etape";
    pose.classList.toggle("courante", step.etat === "courante");
    pose.dataset.etat = step.etat;
    pose.dataset.etape = step.etape;
    if (step.etat === "courante") pose.ariaCurrent = "step";
    const corps = cree(doc, "div");
    corps.className = "corps";
    const titre = cree(doc, "p");
    titre.className = "titre";
    const state = cree(doc, "span", STATES_D_STEP[step.etat]);
    state.className = "etat";
    titre.append(cree(doc, "strong", step.titre), state);
    corps.append(titre);
    // En échec, l'échec dit lui-même ce qui se passe : sa phrase ne se redit pas au-dessus.
    const enFailure = step.etape === "preparation" && onboarding.preparation?.etat === "en-echec";
    // Une décision attendue sur la machine : sa phrase est un avertissement, ses gestes deux boutons.
    const decision = step.etape === "machine" && step.etat === "courante" && onboarding.decisionAttendue;
    if (!enFailure) {
      const dit = phrase(doc, "p", step.dit);
      dit.className = "dit";
      if (decision) {
        dit.className = "dit avertissement";
        dit.role = "alert";
      }
      corps.append(dit);
    }
    const action = step.etat === "courante" ? step.geste : null;
    if (decision) {
      const choice = cree(doc, "div");
      choice.className = "geste";
      choice.append(button(doc, AUTRE_STATION, autreStation, true), button(doc, CONTINUER_SANS_BAC, continuerSansBac, false));
      corps.append(choice);
    } else if (action !== null) corps.append(poserAction(doc, action, ouvrir));
    if (step.etape === "preparation" && step.etat !== "a-venir" && onboarding.preparation !== null) corps.append(...poserPreparation(doc, onboarding.preparation, maintenant, ouvrir, action?.liens ?? []));
    pose.append(corps);
    liste.append(pose);
  }
  racine.append(tete, liste);
  return racine;
}
