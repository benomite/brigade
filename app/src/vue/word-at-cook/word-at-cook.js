// @ts-check
// Le mot au cook (ticket 4048, épique 4043) : sur la carte d'un ticket en cuisine, un champ d'une ligne où le chef écrit
// au cook qui le tient, sans ouvrir sa session. Entrée, ou « send », l'envoie une fois par `send-word` (source.js) :
// `{ok: true}` vide le champ ; `{ok: false, reason}` dit la raison en une ligne à côté du champ, le détail au survol, et le
// texte reste dans le champ — rien n'est perdu. Les cartes des autres étapes (en pass, servi…) n'ont pas de champ.
// Le rail se redessine à chaque lecture : ce que le chef a tapé, la raison d'un refus et l'envoi en route sont gardés ici,
// par carte, et le champ neuf les reprend ; le clavier lui est rendu par sa clé (`data-cle`, `data-champ`, vue.js).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { source } from "./source.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ texte: string, raison?: string, detail?: string, enRoute: boolean }} State */

// Les mots de l'étape d'un ticket qu'un cook tient : celui du runtime, et celui du rail lu sur GitHub (vue/rail/github.ts).
const EN_KITCHEN = ["pris", "taken"];
const FIELD_OF_WORD = "mot-au-cook";
const SEND = "send";

/** @type {Map<string, State>} */
const states = new Map();
// Les derniers éléments posés de chaque carte : une réponse qui arrive après un nouveau rendu va au champ qui est à l'écran.
/** @type {Map<string, { champ: any, bouton: any, raison: any }>} */
const setEntries = new Map();

/** @param {string} key */
const stateOf = (key) => states.get(key) ?? { texte: "", enRoute: false };

/** @param {Fabrique} doc @param {string} key */
function render(doc, key) {
  const pose = setEntries.get(key);
  if (pose === undefined) return;
  const state = stateOf(key);
  pose.champ.value = state.texte;
  pose.champ.readOnly = state.enRoute;
  pose.bouton.disabled = state.enRoute;
  pose.raison.replaceChildren(...(state.raison === undefined ? [] : [lineError(doc, state.raison, state.detail, { classe: "mot-au-cook-raison", alerte: true })]));
}

/**
 * Le champ du mot au cook pour cette carte : rien, si son ticket n'est pas en cuisine.
 * @param {Fabrique} doc @param {string} project @param {{ ticket: number, etat?: string }} carte @returns {any[]}
 */
export function setTheWordAtCook(doc, project, { ticket, etat: state }) {
  const key = `${project}#${ticket}`;
  if (state === undefined || !EN_KITCHEN.includes(state)) {
    states.delete(key);
    setEntries.delete(key);
    return [];
  }
  const root = doc.createElement("div");
  root.className = "mot-au-cook";
  const input = doc.createElement("div");
  input.className = "mot-au-cook-saisie";
  const field = doc.createElement("input");
  field.type = "text";
  field.placeholder = "a word to the cook…";
  field.ariaLabel = `a word to the cook of #${ticket}`;
  field.dataset.cle = key;
  field.dataset.champ = FIELD_OF_WORD;
  const send = async () => {
    const text = field.value;
    if (stateOf(key).enRoute || text.trim() === "") return;
    states.set(key, { texte: text, enRoute: true });
    render(doc, key);
    const answer = await source.envoyer({ ticket, text: text }, project);
    // Le ticket a quitté la cuisine pendant l'envoi : sa carte n'a plus de champ, rien n'est gardé pour lui.
    if (!setEntries.has(key)) return;
    states.set(key, answer.ok ? { texte: "", enRoute: false } : { texte: text, raison: answer.reason, detail: answer.detail, enRoute: false });
    render(doc, key);
  };
  field.addEventListener("input", () => states.set(key, { ...stateOf(key), texte: field.value }));
  field.addEventListener("keydown", (/** @type {any} */ event) => {
    if (event.key !== "Enter" || event.isComposing === true) return;
    event.preventDefault();
    void send();
  });
  const action = buttonAction(doc, SEND, () => void send());
  input.append(field, action);
  const reason = doc.createElement("div");
  reason.className = "mot-au-cook-ligne";
  root.append(input, reason);
  setEntries.set(key, { champ: field, bouton: action.children?.[0] ?? action, raison: reason });
  render(doc, key);
  return [root];
}
