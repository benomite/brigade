// @ts-check
// Le parcours d'un projet neuf, sur sa page (ticket 1111, épique 1108) : de « projet confié à une
// station » à « premier ticket posé », en quatre étapes — le dépôt, la machine qui le cuit, la
// préparation du dépôt, le premier ticket —, telles que sa station principale les publie (ticket 1110).
// En tête, ce qu'on attend du chef, en une phrase ; puis chaque
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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Onboarding} Onboarding */
/** @typedef {import("../../projects/request.ts").StepOfOnboarding} Step */
/** @typedef {import("../../projects/request.ts").PreparationOfRepository} Preparation */

// Ce que dit l'état de chaque étape, à côté de son titre.
export const STATES_OF_STEP = { faite: "done", courante: "now", "a-venir": "to come" };
// L'état du ticket de préparation, en mots.
export const STATES_OF_PREPARATION = { "en-cours": "in progress", "en-echec": "failed", "a-relire": "to review", suspendu: "suspended", faite: "merged", abandonne: "abandoned" };
export const SET_ASIDE = "dismiss";
export const SET_THE_FIRST = "post the first ticket";
export const OPEN_THE_PR = "open the PR";
export const CONTINUE_WITHOUT_SANDBOX = "continue without sandbox";
export const OTHER_STATION = "choose another station";

/** @param {string} project */
export const ready = (project) => `${project} is ready: post your first ticket with the \`fire\` label`;

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Une phrase du runtime, ses mots entre accents graves — un label, `fire` — posés en code.
/** @param {Fabrique} doc @param {string} balise @param {string} text */
export function sentence(doc, balise, text) {
  const pose = doc.createElement(balise);
  text.split("`").forEach((piece, rank) => {
    if (piece === "") return;
    if (rank % 2 === 0) pose.append(piece);
    else {
      const code = created(doc, "code", piece);
      code.className = "mono";
      pose.append(code);
    }
  });
  return pose;
}

// Un geste : la brique commune, sans prix — ouvrir une page de GitHub ne coûte rien.
/** @param {Fabrique} doc @param {string} wording @param {() => void} action @param {boolean} recommended */
const button = (doc, wording, action, recommended) => buttonAction(doc, wording, action, { recommande: recommended });

// L'heure du prochain essai d'une préparation en échec, d'après l'instant où la page se pose.
// Passée, elle ne s'annonce plus : l'essai est dû, la prochaine lecture dira ce qu'il a donné.
/** @param {string | null} nextTrial @param {number} now */
export function nextTrialSays(nextTrial, now) {
  if (nextTrial === null) return "It is not retried by itself.";
  const instant = Date.parse(nextTrial);
  if (Number.isNaN(instant)) return "It is retried by itself.";
  const remains = instant - now;
  if (remains <= 0) return "Its retry is due now.";
  const hour = new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Next retry at ${hour}, in ${Math.ceil(remains / 60_000)} min.`;
}

// Ce qu'on attend du chef, en tête : le geste de l'étape courante ; sans geste, une préparation en
// échec le dit ; sinon, rien à faire, et l'étape où il en est.
/** @param {string} project @param {Onboarding} onboarding */
export function expectedSays(project, onboarding) {
  const rank = onboarding.etapes.findIndex(({ etat: state }) => state === "courante");
  const current = onboarding.etapes[rank];
  if (current?.geste) return current.geste.quoi;
  const preparation = onboarding.preparation;
  if (current?.etape === "preparation" && preparation?.etat === "en-echec") return `The preparation of ${project} failed: ${preparation.prochainEssai === null ? "it is not retried by itself" : "nothing to do, it is retried by itself"}.`;
  if (current === undefined) return `${project} is being set up.`;
  return `Nothing to do: ${project} is being set up — step ${rank + 1} of ${onboarding.etapes.length}, ${current.titre.toLowerCase()}.`;
}

// Le geste attendu sur l'étape courante : un bouton par page où le faire — le premier se distingue —,
// et où le faire, à côté. Sans page, le geste se dit en une phrase.
/** @param {Fabrique} doc @param {NonNullable<Step["geste"]>} action @param {(url: string) => void} open */
function setAction(doc, action, open) {
  const pose = created(doc, "div");
  pose.className = "geste";
  const wording = (/** @type {string} */ url) => (action.liens.length === 1 ? action.quoi.replace(/\.$/, "") : `open ${url.replace(/^https:\/\/github\.com\/(apps\/)?/, "").replace(/\/.*$/, "")}`);
  if (action.liens.length === 0) pose.append(sentence(doc, "span", action.quoi));
  else pose.append(...action.liens.map((url, rank) => button(doc, wording(url), () => open(url), rank === 0)));
  if (action.ou !== "") {
    const or = created(doc, "small", action.ou);
    or.className = "ou";
    pose.append(or);
  }
  return pose;
}

// Le ticket de préparation : son numéro, un bouton qui l'ouvre, son état ; à relire, sa PR. En
// échec, la raison et l'heure du prochain essai, à la place du vide.
/** @param {Fabrique} doc @param {Preparation} preparation @param {number} now @param {(url: string) => void} open @param {readonly string[]} alreadyOpen */
function setPreparation(doc, preparation, now, open, alreadyOpen) {
  const poses = [];
  const line = created(doc, "p");
  line.className = "ticket";
  const state = created(doc, "span", STATES_OF_PREPARATION[preparation.etat]);
  state.className = "etat-de-preparation";
  state.dataset.etat = preparation.etat;
  line.append(button(doc, `#${preparation.ticket}`, () => open(preparation.url), false), state);
  // Sa PR, quand aucun geste de l'étape ne l'ouvre déjà : le même lien ne s'offre pas deux fois.
  const pr = preparation.pr;
  if (preparation.etat === "a-relire" && pr !== null && !alreadyOpen.includes(pr)) line.append(button(doc, OPEN_THE_PR, () => open(pr), false));
  poses.push(line);
  if (preparation.etat === "en-echec") {
    poses.push(lineError(doc, preparation.raison ?? "Its cook failed.", nextTrialSays(preparation.prochainEssai, now), { classe: "echec", balise: "div", alerte: true }));
  }
  return poses;
}

// Le chef vient de continuer sans bac à sable : la machine est faite, la préparation est la courante, sans
// avertissement — jusqu'à ce que la station publie l'état qui le dit pour de bon.
/** @param {Onboarding} onboarding @returns {Onboarding} */
export function afterTheDecision(onboarding) {
  let next = false;
  const steps = onboarding.etapes.map((step) => {
    if (step.etape === "machine" && step.etat === "courante") {
      next = true;
      return { ...step, etat: /** @type {const} */ ("faite"), dit: "You decided to continue without a sandbox: the station starts on its next turn, in restricted mode: no sandbox.", geste: null };
    }
    if (next && step.etat === "a-venir") {
      next = false;
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
export function setJourney(doc, { projet: project, onboarding, maintenant: now, ouvrir: open, ecarter: setAside, continuerSansBac: continueWithoutSandbox = () => {}, autreStation: otherStation = () => {} }) {
  if (onboarding === null || onboarding === undefined) return null;
  const root = created(doc, "section");
  root.ariaLabel = `Getting ${project} ready`;
  if (onboarding.termine) {
    const first = onboarding.etapes.find(({ etape: step }) => step === "premier-ticket");
    if (first?.etat === "faite") return null;
    root.className = "parcours pret";
    const head = sentence(doc, "p", ready(project));
    head.className = "attendu";
    const actions = created(doc, "div");
    actions.className = "gestes-du-parcours";
    const newEntry = first?.geste?.liens[0];
    if (newEntry !== undefined) actions.append(button(doc, SET_THE_FIRST, () => open(newEntry), true));
    actions.append(button(doc, SET_ASIDE, setAside, newEntry === undefined));
    root.append(head, actions);
    return root;
  }
  root.className = "parcours";
  const head = sentence(doc, "p", expectedSays(project, onboarding));
  head.className = "attendu";
  const list = created(doc, "ol");
  list.className = "etapes";
  for (const step of onboarding.etapes) {
    const pose = created(doc, "li");
    pose.className = "etape";
    pose.classList.toggle("courante", step.etat === "courante");
    pose.dataset.etat = step.etat;
    pose.dataset.etape = step.etape;
    if (step.etat === "courante") pose.ariaCurrent = "step";
    const body = created(doc, "div");
    body.className = "corps";
    const title = created(doc, "p");
    title.className = "titre";
    const state = created(doc, "span", STATES_OF_STEP[step.etat]);
    state.className = "etat";
    title.append(created(doc, "strong", step.titre), state);
    body.append(title);
    // En échec, l'échec dit lui-même ce qui se passe : sa phrase ne se redit pas au-dessus.
    const inFailure = step.etape === "preparation" && onboarding.preparation?.etat === "en-echec";
    // Une décision attendue sur la machine : sa phrase est un avertissement, ses gestes deux boutons.
    const decision = step.etape === "machine" && step.etat === "courante" && onboarding.decisionAttendue;
    if (!inFailure) {
      const said = sentence(doc, "p", step.dit);
      said.className = "dit";
      if (decision) {
        said.className = "dit avertissement";
        said.role = "alert";
      }
      body.append(said);
    }
    const action = step.etat === "courante" ? step.geste : null;
    if (decision) {
      const choice = created(doc, "div");
      choice.className = "geste";
      choice.append(button(doc, OTHER_STATION, otherStation, true), button(doc, CONTINUE_WITHOUT_SANDBOX, continueWithoutSandbox, false));
      body.append(choice);
    } else if (action !== null) body.append(setAction(doc, action, open));
    if (step.etape === "preparation" && step.etat !== "a-venir" && onboarding.preparation !== null) body.append(...setPreparation(doc, onboarding.preparation, now, open, action?.liens ?? []));
    pose.append(body);
    list.append(pose);
  }
  root.append(head, list);
  return root;
}
