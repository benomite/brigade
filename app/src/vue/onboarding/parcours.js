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

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projets/demande.ts").Onboarding} Onboarding */
/** @typedef {import("../../projets/demande.ts").EtapeDOnboarding} Etape */
/** @typedef {import("../../projets/demande.ts").PreparationDuDepot} Preparation */

// Ce que dit l'état de chaque étape, à côté de son titre.
export const ETATS_D_ETAPE = { faite: "done", courante: "now", "a-venir": "to come" };
// L'état du ticket de préparation, en mots.
export const ETATS_DE_PREPARATION = { "en-cours": "in progress", "en-echec": "failed", "a-relire": "to review", suspendu: "suspended", faite: "merged", abandonne: "abandoned" };
export const ECARTER = "dismiss";
export const POSER_LE_PREMIER = "post the first ticket";
export const OUVRIR_LA_PR = "open the PR";
export const CONTINUER_SANS_BAC = "continue without sandbox";
export const AUTRE_STATION = "choose another station";

/** @param {string} projet */
export const pret = (projet) => `${projet} is ready: post your first ticket with the \`fire\` label`;

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
function phrase(doc, balise, texte) {
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
/** @param {Fabrique} doc @param {string} libelle @param {() => void} geste @param {boolean} recommande */
const bouton = (doc, libelle, geste, recommande) => boutonAction(doc, libelle, geste, { recommande });

// L'heure du prochain essai d'une préparation en échec, d'après l'instant où la page se pose.
// Passée, elle ne s'annonce plus : l'essai est dû, la prochaine lecture dira ce qu'il a donné.
/** @param {string | null} prochainEssai @param {number} maintenant */
export function prochainEssaiDit(prochainEssai, maintenant) {
  if (prochainEssai === null) return "It is not retried by itself.";
  const instant = Date.parse(prochainEssai);
  if (Number.isNaN(instant)) return "It is retried by itself.";
  const reste = instant - maintenant;
  if (reste <= 0) return "Its retry is due now.";
  const heure = new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Next retry at ${heure}, in ${Math.ceil(reste / 60_000)} min.`;
}

// Ce qu'on attend du chef, en tête : le geste de l'étape courante ; sans geste, une préparation en
// échec le dit ; sinon, rien à faire, et l'étape où il en est.
/** @param {string} projet @param {Onboarding} onboarding */
export function attenduDit(projet, onboarding) {
  const rang = onboarding.etapes.findIndex(({ etat }) => etat === "courante");
  const courante = onboarding.etapes[rang];
  if (courante?.geste) return courante.geste.quoi;
  const preparation = onboarding.preparation;
  if (courante?.etape === "preparation" && preparation?.etat === "en-echec") return `The preparation of ${projet} failed: ${preparation.prochainEssai === null ? "it is not retried by itself" : "nothing to do, it is retried by itself"}.`;
  if (courante === undefined) return `${projet} is being set up.`;
  return `Nothing to do: ${projet} is being set up — step ${rang + 1} of ${onboarding.etapes.length}, ${courante.titre.toLowerCase()}.`;
}

// Le geste attendu sur l'étape courante : un bouton par page où le faire — le premier se distingue —,
// et où le faire, à côté. Sans page, le geste se dit en une phrase.
/** @param {Fabrique} doc @param {NonNullable<Etape["geste"]>} geste @param {(url: string) => void} ouvrir */
function poserGeste(doc, geste, ouvrir) {
  const pose = cree(doc, "div");
  pose.className = "geste";
  const libelle = (/** @type {string} */ url) => (geste.liens.length === 1 ? geste.quoi.replace(/\.$/, "") : `open ${url.replace(/^https:\/\/github\.com\/(apps\/)?/, "").replace(/\/.*$/, "")}`);
  if (geste.liens.length === 0) pose.append(phrase(doc, "span", geste.quoi));
  else pose.append(...geste.liens.map((url, rang) => bouton(doc, libelle(url), () => ouvrir(url), rang === 0)));
  if (geste.ou !== "") {
    const ou = cree(doc, "small", geste.ou);
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
  const ligne = cree(doc, "p");
  ligne.className = "ticket";
  const etat = cree(doc, "span", ETATS_DE_PREPARATION[preparation.etat]);
  etat.className = "etat-de-preparation";
  etat.dataset.etat = preparation.etat;
  ligne.append(bouton(doc, `#${preparation.ticket}`, () => ouvrir(preparation.url), false), etat);
  // Sa PR, quand aucun geste de l'étape ne l'ouvre déjà : le même lien ne s'offre pas deux fois.
  const pr = preparation.pr;
  if (preparation.etat === "a-relire" && pr !== null && !dejaOuverte.includes(pr)) ligne.append(bouton(doc, OUVRIR_LA_PR, () => ouvrir(pr), false));
  poses.push(ligne);
  if (preparation.etat === "en-echec") {
    const echec = cree(doc, "div");
    echec.className = "echec";
    echec.role = "alert";
    echec.append(cree(doc, "p", preparation.raison ?? "Its cook failed."), cree(doc, "p", prochainEssaiDit(preparation.prochainEssai, maintenant)));
    poses.push(echec);
  }
  return poses;
}

// Le parcours de `projet`, ou rien : sans onboarding publié, ou prêt et son premier ticket déjà posé.
// `ouvrir` : ouvre une page de GitHub ; `ecarter` : le chef range le parcours prêt ; `continuerSansBac` et
// `autreStation` : les deux choix devant une station sans bac à sable.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, onboarding: Onboarding | null | undefined, maintenant: number, ouvrir: (url: string) => void, ecarter: () => void, continuerSansBac?: () => void, autreStation?: () => void }} donnees
 */
export function poserParcours(doc, { projet, onboarding, maintenant, ouvrir, ecarter, continuerSansBac = () => {}, autreStation = () => {} }) {
  if (onboarding === null || onboarding === undefined) return null;
  const racine = cree(doc, "section");
  racine.ariaLabel = `Getting ${projet} ready`;
  if (onboarding.termine) {
    const premier = onboarding.etapes.find(({ etape }) => etape === "premier-ticket");
    if (premier?.etat === "faite") return null;
    racine.className = "parcours pret";
    const tete = phrase(doc, "p", pret(projet));
    tete.className = "attendu";
    const gestes = cree(doc, "div");
    gestes.className = "gestes-du-parcours";
    const nouvelle = premier?.geste?.liens[0];
    if (nouvelle !== undefined) gestes.append(bouton(doc, POSER_LE_PREMIER, () => ouvrir(nouvelle), true));
    gestes.append(bouton(doc, ECARTER, ecarter, nouvelle === undefined));
    racine.append(tete, gestes);
    return racine;
  }
  racine.className = "parcours";
  const tete = phrase(doc, "p", attenduDit(projet, onboarding));
  tete.className = "attendu";
  const liste = cree(doc, "ol");
  liste.className = "etapes";
  for (const etape of onboarding.etapes) {
    const pose = cree(doc, "li");
    pose.className = "etape";
    pose.classList.toggle("courante", etape.etat === "courante");
    pose.dataset.etat = etape.etat;
    pose.dataset.etape = etape.etape;
    if (etape.etat === "courante") pose.ariaCurrent = "step";
    const corps = cree(doc, "div");
    corps.className = "corps";
    const titre = cree(doc, "p");
    titre.className = "titre";
    const etat = cree(doc, "span", ETATS_D_ETAPE[etape.etat]);
    etat.className = "etat";
    titre.append(cree(doc, "strong", etape.titre), etat);
    corps.append(titre);
    // En échec, l'échec dit lui-même ce qui se passe : sa phrase ne se redit pas au-dessus.
    const enEchec = etape.etape === "preparation" && onboarding.preparation?.etat === "en-echec";
    // Une décision attendue sur la machine : sa phrase est un avertissement, ses gestes deux boutons.
    const decision = etape.etape === "machine" && etape.etat === "courante" && onboarding.decisionAttendue;
    if (!enEchec) {
      const dit = phrase(doc, "p", etape.dit);
      dit.className = "dit";
      if (decision) {
        dit.className = "dit avertissement";
        dit.role = "alert";
      }
      corps.append(dit);
    }
    const geste = etape.etat === "courante" ? etape.geste : null;
    if (decision) {
      const choix = cree(doc, "div");
      choix.className = "geste";
      choix.append(bouton(doc, AUTRE_STATION, autreStation, true), bouton(doc, CONTINUER_SANS_BAC, continuerSansBac, false));
      corps.append(choix);
    } else if (geste !== null) corps.append(poserGeste(doc, geste, ouvrir));
    if (etape.etape === "preparation" && etape.etat !== "a-venir" && onboarding.preparation !== null) corps.append(...poserPreparation(doc, onboarding.preparation, maintenant, ouvrir, geste?.liens ?? []));
    pose.append(corps);
    liste.append(pose);
  }
  racine.append(tete, liste);
  return racine;
}
