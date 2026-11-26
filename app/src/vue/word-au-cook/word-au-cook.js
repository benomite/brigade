// @ts-check
// Le mot au cook (ticket 4048, épique 4043) : sur la carte d'un ticket en cuisine, un champ d'une ligne où le chef écrit
// au cook qui le tient, sans ouvrir sa session. Entrée, ou « send », l'envoie une fois par `send-word` (source.js) :
// `{ok: true}` vide le champ ; `{ok: false, reason}` dit la raison en une ligne à côté du champ, le détail au survol, et le
// texte reste dans le champ — rien n'est perdu. Les cartes des autres étapes (en pass, servi…) n'ont pas de champ.
// Le rail se redessine à chaque lecture : ce que le chef a tapé, la raison d'un refus et l'envoi en route sont gardés ici,
// par carte, et le champ neuf les reprend ; le clavier lui est rendu par sa clé (`data-cle`, `data-champ`, vue.js).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { buttonAction } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ texte: string, raison?: string, detail?: string, enRoute: boolean }} State */

// Les mots de l'étape d'un ticket qu'un cook tient : celui du runtime, et celui du rail lu sur GitHub (vue/rail/github.ts).
const EN_KITCHEN = ["pris", "taken"];
const CHAMP_DU_WORD = "mot-au-cook";
const ENVOYER = "send";

/** @type {Map<string, State>} */
const states = new Map();
// Les derniers éléments posés de chaque carte : une réponse qui arrive après un nouveau rendu va au champ qui est à l'écran.
/** @type {Map<string, { champ: any, bouton: any, raison: any }>} */
const posees = new Map();

/** @param {string} cle */
const stateDe = (cle) => states.get(cle) ?? { texte: "", enRoute: false };

/** @param {Fabrique} doc @param {string} cle */
function rendre(doc, cle) {
  const pose = posees.get(cle);
  if (pose === undefined) return;
  const state = stateDe(cle);
  pose.champ.value = state.texte;
  pose.champ.readOnly = state.enRoute;
  pose.bouton.disabled = state.enRoute;
  pose.raison.replaceChildren(...(state.raison === undefined ? [] : [lineError(doc, state.raison, state.detail, { classe: "mot-au-cook-raison", alerte: true })]));
}

/**
 * Le champ du mot au cook pour cette carte : rien, si son ticket n'est pas en cuisine.
 * @param {Fabrique} doc @param {string} project @param {{ ticket: number, etat?: string }} carte @returns {any[]}
 */
export function poserLeWordAuCook(doc, project, { ticket, etat: state }) {
  const cle = `${project}#${ticket}`;
  if (state === undefined || !EN_KITCHEN.includes(state)) {
    states.delete(cle);
    posees.delete(cle);
    return [];
  }
  const racine = doc.createElement("div");
  racine.className = "mot-au-cook";
  const saisie = doc.createElement("div");
  saisie.className = "mot-au-cook-saisie";
  const champ = doc.createElement("input");
  champ.type = "text";
  champ.placeholder = "a word to the cook…";
  champ.ariaLabel = `a word to the cook of #${ticket}`;
  champ.dataset.cle = cle;
  champ.dataset.champ = CHAMP_DU_WORD;
  const envoyer = async () => {
    const texte = champ.value;
    if (stateDe(cle).enRoute || texte.trim() === "") return;
    states.set(cle, { texte, enRoute: true });
    rendre(doc, cle);
    const answer = await source.envoyer({ ticket, text: texte }, project);
    // Le ticket a quitté la cuisine pendant l'envoi : sa carte n'a plus de champ, rien n'est gardé pour lui.
    if (!posees.has(cle)) return;
    states.set(cle, answer.ok ? { texte: "", enRoute: false } : { texte, raison: answer.reason, detail: answer.detail, enRoute: false });
    rendre(doc, cle);
  };
  champ.addEventListener("input", () => states.set(cle, { ...stateDe(cle), texte: champ.value }));
  champ.addEventListener("keydown", (/** @type {any} */ event) => {
    if (event.key !== "Enter" || event.isComposing === true) return;
    event.preventDefault();
    void envoyer();
  });
  const action = buttonAction(doc, ENVOYER, () => void envoyer());
  saisie.append(champ, action);
  const raison = doc.createElement("div");
  raison.className = "mot-au-cook-ligne";
  racine.append(saisie, raison);
  posees.set(cle, { champ, bouton: action.children?.[0] ?? action, raison });
  rendre(doc, cle);
  return [racine];
}
