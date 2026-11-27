// @ts-check
// Le premier ticket d'un projet neuf, écrit dans l'app (ticket 3306, épique 3301). Le projet prêt, au-dessus du rail, le
// second demande au chef ce qu'il veut changer d'abord, avec un champ pour sa réponse. Envoyée, le second écrit l'issue
// (runtime/src/premier-ticket/, `rediger`) et l'app la montre — son titre et son corps — avec deux gestes : « Yes, put it on
// the rail », le recommandé, et le champ de ce qui doit changer, avec « ask for changes ». Un changement demandé, le second
// réécrit et la montre de nouveau ; rien n'est créé avant le « oui ». Sur le « oui », le runtime crée l'issue avec ses
// labels (`creer`, `fire` compris) : elle est sur le rail. Le chef n'ouvre pas GitHub, ne tape ni ne voit aucun label.
// Une rédaction ou une création qui échoue se dit en une ligne, sa cause au survol, et le geste reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { actions } from "../journey-project/connection.js";
import { AT_RETURN } from "../choice-station/choice-station.js";
import { YES as YES_A } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Brouillon} Draft */
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
 *   | { etape: "redaction", reponse: string, brouillon?: Draft, changements?: string }
 *   | { etape: "brouillon", reponse: string, brouillon: Draft, changements: string, refus?: Refusal }
 *   | { etape: "creation", reponse: string, brouillon: Draft }
 *   | { etape: "cree", ticket: number, url: string }} State
 */

// Les mots de docs/glossary.md : le second, le rail, la cuisine (`kitchen`), le ticket.
export const THE_SECOND = "the second";
/** @param {string} repository */
export const QUESTION = (repository) => `${repository} is ready. What do you want to change first?`;
export const FIELD_ANSWER = "In your words: what should change, and for whom";
export const SEND = "send to the second";
export const LATER = "not now";
export const REDACTION = "The second is writing the ticket from your answer. Nothing is awaited from you.";
export const REWRITE = "The second is rewriting the ticket with your changes. Nothing is awaited from you.";
export const REREAD = "Is this the right first ticket?";
export const YES = YES_A("put it on the rail");
export const PRICE_YES = "the ticket is created in the project's repository and goes on the rail: a cook takes it, on the project's quota";
export const FIELD_CHANGES = "What should change in this ticket";
export const CHANGE = "ask for changes";
export const CREATION = "Putting it on the rail…";
/** @param {number} ticket */
export const CREATED = (ticket) => `#${ticket} is on the rail: the kitchen serves it.`;
export const CLOSE = "close";
// Les champs, tels que la vue les reconnaît pour leur rendre le clavier quand la page est reposée.
export const FIELD_OF_THE_ANSWER = "premier-ticket-reponse";
export const FIELD_OF_CHANGES = "premier-ticket-changements";

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [text] */
function created(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (text !== undefined) pose.textContent = text;
  return pose;
}

/** @param {Fabrique} doc @param {{ valeur: string, placeholder: string, champ: string, figee: boolean }} quoi @param {(text: string) => void} write @param {any} [aTurnOn] */
function field(doc, { valeur: value, placeholder, champ: name, figee: frozen }, write, aTurnOn) {
  const input = created(doc, "textarea");
  input.value = value;
  input.rows = 3;
  input.placeholder = placeholder;
  input.ariaLabel = placeholder;
  input.disabled = frozen;
  input.dataset.champ = name;
  input.addEventListener("input", () => {
    write(input.value);
    if (aTurnOn !== undefined) aTurnOn.disabled = input.value.trim() === "";
  });
  return input;
}

// Le bouton d'un groupe d'action (bricks.js), éteint tant que `eteint`.
/** @param {any} group @param {boolean} off */
function turnOff(group, off) {
  const the = group.children?.[0];
  if (the !== undefined) the.disabled = off;
  return the;
}

// Le brouillon montré : son titre, puis son corps tel que le second l'a écrit.
/** @param {Fabrique} doc @param {Draft} draft */
function setTheDraft(doc, draft) {
  const article = created(doc, "article", "brouillon");
  article.append(created(doc, "h3", "titre-du-brouillon", draft.title), created(doc, "div", "corps-du-brouillon", draft.body));
  return article;
}

/**
 * @typedef {{
 *   ecrire: (text: string) => void,
 *   envoyer: () => void,
 *   oui: () => void,
 *   changer: () => void,
 *   fermer: () => void,
 * }} ActionsOfFirstTicket
 */

// Le premier ticket, dans son état, au-dessus du rail. `absente` : la station choisie hors ligne (ticket 3187) — la page dit
// qu'elle prend le projet à son retour.
/** @param {Fabrique} doc @param {{ depot: string, etat: State, absente?: string }} donnees @param {ActionsOfFirstTicket} action */
export function setFirstTicket(doc, { depot: repository, etat: state, absente: absent }, action) {
  const root = created(doc, "section", "premier-ticket carte");
  root.dataset.etape = state.etape;
  root.ariaLabel = `${repository}: its first ticket`;
  const who = created(doc, "p", "qui", THE_SECOND);
  const atReturn = absent === undefined ? [] : [created(doc, "p", "au-retour", AT_RETURN(absent, repository))];
  if (state.etape === "question") {
    const send = buttonAction(doc, SEND, action.envoyer, { recommande: true });
    turnOff(send, state.reponse.trim() === "");
    const input = field(doc, { valeur: state.reponse, placeholder: FIELD_ANSWER, champ: FIELD_OF_THE_ANSWER, figee: false }, action.ecrire, send.children?.[0]);
    root.append(who, created(doc, "h2", "attendu", QUESTION(repository)), ...atReturn, input, actions(doc, [send, buttonAction(doc, LATER, action.fermer)]));
    if (state.refus !== undefined) root.append(lineError(doc, state.refus.dit, state.refus.detail, { classe: "erreur" }));
    return root;
  }
  if (state.etape === "redaction") {
    root.append(who, created(doc, "h2", "attendu", state.brouillon === undefined ? REDACTION : REWRITE), ...atReturn, created(doc, "p", "reponse", `“${state.changements ?? state.reponse}”`));
    return root;
  }
  if (state.etape === "cree") {
    root.append(created(doc, "h2", "attendu", CREATED(state.ticket)), ...atReturn, actions(doc, [buttonAction(doc, CLOSE, action.fermer)]));
    return root;
  }
  const frozen = state.etape === "creation";
  const yes = buttonAction(doc, YES, action.oui, { recommande: true, prix: PRICE_YES });
  turnOff(yes, frozen);
  const change = buttonAction(doc, CHANGE, action.changer);
  const changes = state.etape === "brouillon" ? state.changements : "";
  turnOff(change, frozen || changes.trim() === "");
  const input = field(doc, { valeur: changes, placeholder: FIELD_CHANGES, champ: FIELD_OF_CHANGES, figee: frozen }, action.ecrire, change.children?.[0]);
  const sendBack = created(doc, "div", "changements");
  sendBack.append(input, change);
  root.append(who, created(doc, "h2", "attendu", REREAD), ...atReturn, setTheDraft(doc, state.brouillon), actions(doc, [yes]), sendBack);
  if (frozen) root.append(created(doc, "p", "phrase", CREATION));
  if (state.etape === "brouillon" && state.refus !== undefined) root.append(lineError(doc, state.refus.dit, state.refus.detail, { classe: "erreur" }));
  return root;
}

const gone = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error));

// Les premiers tickets tenus pour la vue, un par projet prêt que « Add a project » a ouvert, le temps que l'app tourne.
// `rediger` et `creer` sont les gestes du pont (le process principal joue runtime/src/premier-ticket/) : la vue n'appelle
// `creer` que sur le « oui » du chef.
/**
 * @param {{
 *   rendre: (project: string) => void,
 *   rediger: (project: string, request: Request) => Promise<Redaction>,
 *   creer: (project: string, draft: Draft) => Promise<Creation>,
 * }} options
 */
export function holdTheFirstTickets({ rendre: render, rediger, creer: create }) {
  /** @type {Map<string, State>} */
  const heldOnes = new Map();
  /** @param {string} project @param {State} state */
  const set = (project, state) => {
    heldOnes.set(project, state);
    render(project);
  };
  return {
    /** @param {string} project @returns {State | undefined} */
    de: (project) => heldOnes.get(project),
    // Le projet est prêt : le second pose sa question, une fois.
    /** @param {string} project */
    commencer(project) {
      if (!heldOnes.has(project)) heldOnes.set(project, { etape: "question", reponse: "" });
    },
    // Ce que le chef tape : gardé, sans redessiner — le champ l'a déjà.
    /** @param {string} project @param {string} text */
    ecrire(project, text) {
      const state = heldOnes.get(project);
      if (state?.etape === "question") heldOnes.set(project, { ...state, reponse: text });
      else if (state?.etape === "brouillon") heldOnes.set(project, { ...state, changements: text });
    },
    // La réponse part au second ; son brouillon revient, ou ce qui l'a empêché, et la question reste.
    /** @param {string} project */
    async envoyer(project) {
      const state = heldOnes.get(project);
      if (state?.etape !== "question" || state.reponse.trim() === "") return;
      const answer = state.reponse;
      set(project, { etape: "redaction", reponse: answer });
      /** @type {Redaction} */
      let rendered;
      try {
        rendered = await rediger(project, { answer: answer });
      } catch (error) {
        rendered = { refus: "the app could not ask the second to write the ticket", detail: gone(error) };
      }
      if (heldOnes.get(project)?.etape !== "redaction") return;
      set(project, "draft" in rendered ? { etape: "brouillon", reponse: answer, brouillon: rendered.draft, changements: "" } : { etape: "question", reponse: answer, refus: { dit: rendered.refus, detail: rendered.detail } });
    },
    // Les changements partent au second, avec le brouillon vu ; il revient réécrit — rien n'est créé.
    /** @param {string} project */
    async changer(project) {
      const state = heldOnes.get(project);
      if (state?.etape !== "brouillon" || state.changements.trim() === "") return;
      const { reponse: answer, brouillon: draft, changements: changes } = state;
      set(project, { etape: "redaction", reponse: answer, brouillon: draft, changements: changes });
      /** @type {Redaction} */
      let rendered;
      try {
        rendered = await rediger(project, { answer: answer, draft: draft, changes: changes });
      } catch (error) {
        rendered = { refus: "the app could not ask the second to rewrite the ticket", detail: gone(error) };
      }
      if (heldOnes.get(project)?.etape !== "redaction") return;
      set(project, "draft" in rendered ? { etape: "brouillon", reponse: answer, brouillon: rendered.draft, changements: "" } : { etape: "brouillon", reponse: answer, brouillon: draft, changements: changes, refus: { dit: rendered.refus, detail: rendered.detail } });
    },
    // Le « oui » : l'issue se crée, une fois ; refusée, le brouillon reste, et le « oui » aussi.
    /** @param {string} project */
    async oui(project) {
      const state = heldOnes.get(project);
      if (state?.etape !== "brouillon") return;
      const { reponse: answer, brouillon: draft, changements: changes } = state;
      set(project, { etape: "creation", reponse: answer, brouillon: draft });
      /** @type {Creation} */
      let rendered;
      try {
        rendered = await create(project, draft);
      } catch (error) {
        rendered = { refus: "nothing was created: GitHub could not be reached", detail: gone(error) };
      }
      if (heldOnes.get(project)?.etape !== "creation") return;
      set(project, "ticket" in rendered ? { etape: "cree", ticket: rendered.ticket, url: rendered.url } : { etape: "brouillon", reponse: answer, brouillon: draft, changements: changes, refus: { dit: rendered.refus, detail: rendered.detail } });
    },
    /** @param {string} project */
    oublier: (project) => heldOnes.delete(project),
  };
}
