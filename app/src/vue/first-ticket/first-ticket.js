// @ts-check
// Le premier ticket d'un projet neuf, écrit dans l'app (ticket 3306, épique 3301). Le projet prêt, au-dessus du rail, le
// second demande au chef ce qu'il veut changer d'abord, avec un champ pour sa réponse. Envoyée, le second écrit l'issue
// (runtime/src/premier-ticket/, `rediger`) et l'app la montre — son titre et son corps — avec deux gestes : « Yes, put it on
// the rail », le recommandé, et le champ de ce qui doit changer, avec « ask for changes ». Un changement demandé, le second
// réécrit et la montre de nouveau ; rien n'est créé avant le « oui ». Sur le « oui », le runtime crée l'issue avec ses
// labels (`creer`, `fire` compris) : elle est sur le rail. Le chef n'ouvre pas GitHub, ne tape ni ne voit aucun label.
// Une rédaction ou une création qui échoue se dit en une ligne, sa cause au survol, et le geste reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { actions } from "../journey-project/connection.js";
import { AU_RETOUR } from "../choice-station/choice-station.js";
import { OUI as OUI_A } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Brouillon} Brouillon */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Demande} Request */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Redaction} Redaction */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Creation} Creation */
/** @typedef {{ dit: string, detail: string }} Refusal */
// Où en est le premier ticket d'un projet :
//   question    le second demande ce qu'il faut changer d'abord ; `reponse`, ce que le chef a tapé ; `refus`, la dernière
//               rédaction qui a échoué
//   redaction   le second écrit (ou réécrit, avec `brouillon` et `changements`) : le chef n'a rien à faire
//   brouillon   l'issue écrite, montrée : le « oui » ou les changements ; `changements`, ce que le chef a tapé ; `refus`,
//               la réécriture ou la création qui a échoué
//   creation    le « oui » est parti : l'issue se crée
//   cree        l'issue est sur le rail
/**
 * @typedef {{ etape: "question", reponse: string, refus?: Refusal }
 *   | { etape: "redaction", reponse: string, brouillon?: Brouillon, changements?: string }
 *   | { etape: "brouillon", reponse: string, brouillon: Brouillon, changements: string, refus?: Refusal }
 *   | { etape: "creation", reponse: string, brouillon: Brouillon }
 *   | { etape: "cree", ticket: number, url: string }} State
 */

// Les mots de docs/glossary.md : le second, le rail, la cuisine (`kitchen`), le ticket.
export const LE_SECOND = "the second";
/** @param {string} repository */
export const QUESTION = (repository) => `${repository} is ready. What do you want to change first?`;
export const CHAMP_ANSWER = "In your words: what should change, and for whom";
export const ENVOYER = "send to the second";
export const PLUS_TARD = "not now";
export const REDACTION = "The second is writing the ticket from your answer. Nothing is awaited from you.";
export const REECRITURE = "The second is rewriting the ticket with your changes. Nothing is awaited from you.";
export const RELIRE = "Is this the right first ticket?";
export const OUI = OUI_A("put it on the rail");
export const PRIX_OUI = "the ticket is created in the project's repository and goes on the rail: a cook takes it, on the project's quota";
export const CHAMP_CHANGEMENTS = "What should change in this ticket";
export const CHANGER = "ask for changes";
export const CREATION = "Putting it on the rail…";
/** @param {number} ticket */
export const CREE = (ticket) => `#${ticket} is on the rail: the kitchen serves it.`;
export const FERMER = "close";
// Les champs, tels que la vue les reconnaît pour leur rendre le clavier quand la page est reposée.
export const CHAMP_DE_LA_ANSWER = "premier-ticket-reponse";
export const CHAMP_DES_CHANGEMENTS = "premier-ticket-changements";

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {{ valeur: string, placeholder: string, champ: string, figee: boolean }} quoi @param {(texte: string) => void} ecrire @param {any} [aAllumer] */
function champ(doc, { valeur, placeholder, champ: name, figee }, ecrire, aAllumer) {
  const saisie = cree(doc, "textarea");
  saisie.value = valeur;
  saisie.rows = 3;
  saisie.placeholder = placeholder;
  saisie.ariaLabel = placeholder;
  saisie.disabled = figee;
  saisie.dataset.champ = name;
  saisie.addEventListener("input", () => {
    ecrire(saisie.value);
    if (aAllumer !== undefined) aAllumer.disabled = saisie.value.trim() === "";
  });
  return saisie;
}

// Le bouton d'un groupe d'action (briques.js), éteint tant que `eteint`.
/** @param {any} groupe @param {boolean} eteint */
function eteindre(groupe, eteint) {
  const le = groupe.children?.[0];
  if (le !== undefined) le.disabled = eteint;
  return le;
}

// Le brouillon montré : son titre, puis son corps tel que le second l'a écrit.
/** @param {Fabrique} doc @param {Brouillon} brouillon */
function poserLeBrouillon(doc, brouillon) {
  const article = cree(doc, "article", "brouillon");
  article.append(cree(doc, "h3", "titre-du-brouillon", brouillon.title), cree(doc, "div", "corps-du-brouillon", brouillon.body));
  return article;
}

/**
 * @typedef {{
 *   ecrire: (texte: string) => void,
 *   envoyer: () => void,
 *   oui: () => void,
 *   changer: () => void,
 *   fermer: () => void,
 * }} ActionsDuFirstTicket
 */

// Le premier ticket, dans son état, au-dessus du rail. `absente` : la station choisie hors ligne (ticket 3187) — la page dit
// qu'elle prend le projet à son retour.
/** @param {Fabrique} doc @param {{ depot: string, etat: State, absente?: string }} donnees @param {ActionsDuFirstTicket} action */
export function poserFirstTicket(doc, { depot: repository, etat: state, absente }, action) {
  const racine = cree(doc, "section", "premier-ticket carte");
  racine.dataset.etape = state.etape;
  racine.ariaLabel = `${repository}: its first ticket`;
  const qui = cree(doc, "p", "qui", LE_SECOND);
  const auRetour = absente === undefined ? [] : [cree(doc, "p", "au-retour", AU_RETOUR(absente, repository))];
  if (state.etape === "question") {
    const envoyer = buttonAction(doc, ENVOYER, action.envoyer, { recommande: true });
    eteindre(envoyer, state.reponse.trim() === "");
    const saisie = champ(doc, { valeur: state.reponse, placeholder: CHAMP_ANSWER, champ: CHAMP_DE_LA_ANSWER, figee: false }, action.ecrire, envoyer.children?.[0]);
    racine.append(qui, cree(doc, "h2", "attendu", QUESTION(repository)), ...auRetour, saisie, actions(doc, [envoyer, buttonAction(doc, PLUS_TARD, action.fermer)]));
    if (state.refus !== undefined) racine.append(lineError(doc, state.refus.dit, state.refus.detail, { classe: "erreur" }));
    return racine;
  }
  if (state.etape === "redaction") {
    racine.append(qui, cree(doc, "h2", "attendu", state.brouillon === undefined ? REDACTION : REECRITURE), ...auRetour, cree(doc, "p", "reponse", `“${state.changements ?? state.reponse}”`));
    return racine;
  }
  if (state.etape === "cree") {
    racine.append(cree(doc, "h2", "attendu", CREE(state.ticket)), ...auRetour, actions(doc, [buttonAction(doc, FERMER, action.fermer)]));
    return racine;
  }
  const figee = state.etape === "creation";
  const oui = buttonAction(doc, OUI, action.oui, { recommande: true, prix: PRIX_OUI });
  eteindre(oui, figee);
  const changer = buttonAction(doc, CHANGER, action.changer);
  const changements = state.etape === "brouillon" ? state.changements : "";
  eteindre(changer, figee || changements.trim() === "");
  const saisie = champ(doc, { valeur: changements, placeholder: CHAMP_CHANGEMENTS, champ: CHAMP_DES_CHANGEMENTS, figee }, action.ecrire, changer.children?.[0]);
  const sendBack = cree(doc, "div", "changements");
  sendBack.append(saisie, changer);
  racine.append(qui, cree(doc, "h2", "attendu", RELIRE), ...auRetour, poserLeBrouillon(doc, state.brouillon), actions(doc, [oui]), sendBack);
  if (figee) racine.append(cree(doc, "p", "phrase", CREATION));
  if (state.etape === "brouillon" && state.refus !== undefined) racine.append(lineError(doc, state.refus.dit, state.refus.detail, { classe: "erreur" }));
  return racine;
}

const parti = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error));

// Les premiers tickets tenus pour la vue, un par projet prêt que « Add a project » a ouvert, le temps que l'app tourne.
// `rediger` et `creer` sont les gestes du pont (le process principal joue runtime/src/premier-ticket/) : la vue n'appelle
// `creer` que sur le « oui » du chef.
/**
 * @param {{
 *   rendre: (project: string) => void,
 *   rediger: (project: string, request: Request) => Promise<Redaction>,
 *   creer: (project: string, brouillon: Brouillon) => Promise<Creation>,
 * }} options
 */
export function holdLesPremiersTickets({ rendre, rediger, creer }) {
  /** @type {Map<string, State>} */
  const tenus = new Map();
  /** @param {string} project @param {State} state */
  const poser = (project, state) => {
    tenus.set(project, state);
    rendre(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => tenus.get(project),
    // Le projet est prêt : le second pose sa question, une fois.
    /** @param {string} project */
    commencer(project) {
      if (!tenus.has(project)) tenus.set(project, { etape: "question", reponse: "" });
    },
    // Ce que le chef tape : gardé, sans redessiner — le champ l'a déjà.
    /** @param {string} project @param {string} texte */
    ecrire(project, texte) {
      const state = tenus.get(project);
      if (state?.etape === "question") tenus.set(project, { ...state, reponse: texte });
      else if (state?.etape === "brouillon") tenus.set(project, { ...state, changements: texte });
    },
    // La réponse part au second ; son brouillon revient, ou ce qui l'a empêché, et la question reste.
    /** @param {string} project */
    async envoyer(project) {
      const state = tenus.get(project);
      if (state?.etape !== "question" || state.reponse.trim() === "") return;
      const answer = state.reponse;
      poser(project, { etape: "redaction", reponse: answer });
      /** @type {Redaction} */
      let rendu;
      try {
        rendu = await rediger(project, { answer: answer });
      } catch (error) {
        rendu = { refus: "the app could not ask the second to write the ticket", detail: parti(error) };
      }
      if (tenus.get(project)?.etape !== "redaction") return;
      poser(project, "draft" in rendu ? { etape: "brouillon", reponse: answer, brouillon: rendu.draft, changements: "" } : { etape: "question", reponse: answer, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    // Les changements partent au second, avec le brouillon vu ; il revient réécrit — rien n'est créé.
    /** @param {string} project */
    async changer(project) {
      const state = tenus.get(project);
      if (state?.etape !== "brouillon" || state.changements.trim() === "") return;
      const { reponse: answer, brouillon, changements } = state;
      poser(project, { etape: "redaction", reponse: answer, brouillon, changements });
      /** @type {Redaction} */
      let rendu;
      try {
        rendu = await rediger(project, { answer: answer, draft: brouillon, changes: changements });
      } catch (error) {
        rendu = { refus: "the app could not ask the second to rewrite the ticket", detail: parti(error) };
      }
      if (tenus.get(project)?.etape !== "redaction") return;
      poser(project, "draft" in rendu ? { etape: "brouillon", reponse: answer, brouillon: rendu.draft, changements: "" } : { etape: "brouillon", reponse: answer, brouillon, changements, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    // Le « oui » : l'issue se crée, une fois ; refusée, le brouillon reste, et le « oui » aussi.
    /** @param {string} project */
    async oui(project) {
      const state = tenus.get(project);
      if (state?.etape !== "brouillon") return;
      const { reponse: answer, brouillon, changements } = state;
      poser(project, { etape: "creation", reponse: answer, brouillon });
      /** @type {Creation} */
      let rendu;
      try {
        rendu = await creer(project, brouillon);
      } catch (error) {
        rendu = { refus: "nothing was created: GitHub could not be reached", detail: parti(error) };
      }
      if (tenus.get(project)?.etape !== "creation") return;
      poser(project, "ticket" in rendu ? { etape: "cree", ticket: rendu.ticket, url: rendu.url } : { etape: "brouillon", reponse: answer, brouillon, changements, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    /** @param {string} project */
    oublier: (project) => tenus.delete(project),
  };
}
