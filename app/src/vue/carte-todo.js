// @ts-check
// La carte de TODO (ticket 1281, épique 1277), sur le bon d'un ticket qui t'attend, dans la forme
// unique de toute carte de TODO (épique 1764, ticket 1767), dans cet ordre : ce qui se passe, en deux
// phrases au plus ; la question ; ses captures avant et après quand il y en a ; un bouton par choix ;
// un champ pour répondre dans tes mots, avec son bouton « send » ; et, en retrait, « ask the second ».
// Une carte à un seul geste — merger à la main une livraison verte — n'a rien à demander : son bouton,
// sans question. Un clic sur un choix est la réponse : rien d'autre n'est demandé, ni confirmation
// ni second clic ; son prix est au survol. Le texte part par son bouton — Entrée ne l'envoie pas.
// Répondue, la carte quitte TODO. « Ask the second » n'est jamais un des choix ni le seul chemin :
// il écrit dans le second une demande sur le ticket, pour quand la carte ne se comprend pas.
//
// Tout est rangé dans le process principal (app/src/carte-todo.ts) : la carte pose. La réponse part
// par lui aussi (`rail choose` ou `rail answer` sur la box). Ce module tient le geste en route —
// `Etat` — et ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), les
// captures déjà posées et ce que chaque geste appelle, et rend un élément.

import { boutonAction, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../carte-todo.ts").CarteDeTodo} CarteDeTodo */
/** @typedef {import("../carte-todo.ts").Reponse} Reponse */
/** @typedef {import("../carte-todo.ts").Rendu} Rendu */

// Le geste en route, pour une carte.
//   repos     rien n'est parti : la carte attend le chef
//   envoi     sa réponse est partie, la box n'a pas encore répondu : les choix et le champ attendent
//   repondue  la box l'a écrite : la carte quitte TODO
//   refus     rien n'a été écrit (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", reponse: Reponse }
 *   | { etape: "repondue", reponse: Reponse }
 *   | { etape: "refus", dit: string, detail: string }} Etat
 */

/** @type {Etat} */
export const REPOS = { etape: "repos" };

export const ENVOYER = "send";
export const CHAMP = "or answer in your own words";
export const EN_ROUTE = "sending your answer…";
// L'action secondaire de toute carte : le mot est celui du runtime (runtime/src/carte-todo/forme.ts,
// `DEMANDER_AU_SECOND`) et de la fiche (gestes-fiche.ts).
export const DEMANDER = "ask the second";
export const DEMANDE_EN_ROUTE = "asking the second…";
// Le champ du texte libre, tel que la vue le reconnaît pour lui rendre le clavier quand le rail est redessiné.
export const CHAMP_DE_CARTE = "reponse-carte";

// L'étape qui suit la réponse du process principal.
/** @param {Reponse} reponse @param {Rendu | undefined} rendu @returns {Etat} */
export function apresRendu(reponse, rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was sent: this project has no station", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "repondue", reponse };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La carte de TODO d'un ticket, dans son état. `captures` : celles que la vue a posées pour elle —
// aucune sur une carte sans écran, et rien n'en tient la place. `brouillon` : ce que le chef a déjà
// tapé ; `cle` marque le champ, pour qu'un rail redessiné lui rende le clavier. `second` : la demande
// au second de ce ticket, partie de la carte ou de sa fiche — absente, rien n'est parti. Répondue, elle
// n'est plus posée : elle a quitté TODO.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CarteDeTodo} carte
 * @param {Etat} etat
 * @param {{ captures: any[], brouillon: string, cle: string, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ repondre: (reponse: Reponse) => void, ecrire: (texte: string) => void, demander: () => void }} gestes
 */
export function poserCarteDeTodo(doc, ticket, carte, etat, { captures, brouillon, cle, second }, gestes) {
  if (etat.etape === "repondue") return [];
  const enRoute = etat.etape === "envoi";
  const { question, resume } = carte;
  const racine = cree(doc, "section");
  racine.className = "carte-todo";
  racine.dataset.sorte = carte.sorte;
  racine.ariaLabel = question === null ? `what #${ticket} awaits from you` : `the question #${ticket} asks you`;

  // En tête, ce qui se passe ; puis la question — aucune sur une carte à un seul geste.
  const tete = [];
  if (resume !== undefined) {
    const dit = cree(doc, "p", resume);
    dit.className = "resume-carte";
    tete.push(dit);
  }
  if (question !== null) {
    const posee = cree(doc, "p", question);
    posee.className = "question-carte";
    tete.push(posee);
  }

  const choix = cree(doc, "div");
  choix.className = "choix-carte";
  carte.choix.forEach(({ texte, prix }, rang) => {
    const groupe = boutonAction(doc, texte, () => gestes.repondre({ question, choix: rang + 1 }), { prix });
    const bouton = groupe.children?.[0];
    if (bouton !== undefined) {
      bouton.className = "choix";
      bouton.disabled = enRoute;
    }
    choix.append(groupe);
  });

  const phrase = cree(doc, "div");
  phrase.className = "phrase";
  const saisie = cree(doc, "textarea");
  saisie.value = brouillon;
  saisie.rows = 2;
  saisie.placeholder = CHAMP;
  saisie.ariaLabel = question === null ? `your answer to #${ticket}, in your own words` : `your answer to #${ticket}'s question, in your own words`;
  saisie.disabled = enRoute;
  saisie.dataset.cle = cle;
  saisie.dataset.champ = CHAMP_DE_CARTE;
  const envoyer = boutonAction(doc, ENVOYER, () => gestes.repondre({ question, texte: saisie.value }), { prix: carte.prixDuTexte });
  const bouton = envoyer.children?.[0];
  if (bouton !== undefined) bouton.disabled = enRoute || brouillon.trim() === "";
  saisie.addEventListener("input", () => {
    gestes.ecrire(saisie.value);
    if (bouton !== undefined) bouton.disabled = saisie.value.trim() === "";
  });
  phrase.append(saisie, envoyer);

  racine.append(...tete, ...captures, choix, phrase);
  if (enRoute) {
    const envoi = cree(doc, "span", EN_ROUTE);
    envoi.className = "en-route";
    racine.append(envoi);
  }
  if (etat.etape === "refus") {
    const refus = cree(doc, "p");
    refus.className = "refus";
    refus.append(cree(doc, "span", etat.dit));
    if (etat.detail.trim() !== "") refus.append(survol(doc, etat.detail));
    racine.append(refus);
  }

  // L'action secondaire, en retrait sous tout le reste : la carte se tranche sans elle.
  const secondaire = cree(doc, "p");
  secondaire.className = "secondaire";
  const demander = cree(doc, "button", DEMANDER);
  demander.type = "button";
  demander.className = "demander";
  demander.dataset.geste = "demande-second";
  demander.title = `if this card is not clear: write into the second a request about #${ticket}, with what is in the field — nothing is sent, you press Enter`;
  demander.disabled = second !== undefined && "envoi" in second;
  demander.addEventListener("click", () => gestes.demander());
  secondaire.append(demander);
  if (second !== undefined) {
    const dite = cree(doc, "span", "envoi" in second ? DEMANDE_EN_ROUTE : "parti" in second ? second.parti : second.refus);
    dite.className = "refus" in second ? "refus" : "dite";
    secondaire.append(dite);
  }
  racine.append(secondaire);
  return [racine];
}
