// @ts-check
// Le mot au cook (ticket 4048, épique 4043) : sur la carte d'un ticket en cuisine, un champ d'une ligne où le chef écrit
// au cook qui le tient, sans ouvrir sa session. Entrée, ou « send », l'envoie une fois par `send-word` (source.js) :
// `{ok: true}` vide le champ ; `{ok: false, reason}` dit la raison en une ligne à côté du champ, le détail au survol, et le
// texte reste dans le champ — rien n'est perdu. Les cartes des autres étapes (en pass, servi…) n'ont pas de champ.
// Le rail se redessine à chaque lecture : ce que le chef a tapé, la raison d'un refus et l'envoi en route sont gardés ici,
// par carte, et le champ neuf les reprend ; le clavier lui est rendu par sa clé (`data-cle`, `data-champ`, vue.js).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ texte: string, raison?: string, detail?: string, enRoute: boolean }} Etat */

// Les mots de l'étape d'un ticket qu'un cook tient : celui du runtime, et celui du rail lu sur GitHub (vue/rail/github.ts).
const EN_CUISINE = ["pris", "taken"];
const CHAMP_DU_MOT = "mot-au-cook";
const ENVOYER = "send";

/** @type {Map<string, Etat>} */
const etats = new Map();
// Les derniers éléments posés de chaque carte : une réponse qui arrive après un nouveau rendu va au champ qui est à l'écran.
/** @type {Map<string, { champ: any, bouton: any, raison: any }>} */
const posees = new Map();

/** @param {string} cle */
const etatDe = (cle) => etats.get(cle) ?? { texte: "", enRoute: false };

/** @param {Fabrique} doc @param {string} cle */
function rendre(doc, cle) {
  const pose = posees.get(cle);
  if (pose === undefined) return;
  const etat = etatDe(cle);
  pose.champ.value = etat.texte;
  pose.champ.readOnly = etat.enRoute;
  pose.bouton.disabled = etat.enRoute;
  pose.raison.replaceChildren(...(etat.raison === undefined ? [] : [ligneErreur(doc, etat.raison, etat.detail, { classe: "mot-au-cook-raison", alerte: true })]));
}

/**
 * Le champ du mot au cook pour cette carte : rien, si son ticket n'est pas en cuisine.
 * @param {Fabrique} doc @param {string} projet @param {{ ticket: number, etat?: string }} carte @returns {any[]}
 */
export function poserLeMotAuCook(doc, projet, { ticket, etat }) {
  const cle = `${projet}#${ticket}`;
  if (etat === undefined || !EN_CUISINE.includes(etat)) {
    etats.delete(cle);
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
  champ.dataset.champ = CHAMP_DU_MOT;
  const envoyer = async () => {
    const texte = champ.value;
    if (etatDe(cle).enRoute || texte.trim() === "") return;
    etats.set(cle, { texte, enRoute: true });
    rendre(doc, cle);
    const reponse = await source.envoyer({ ticket, text: texte }, projet);
    // Le ticket a quitté la cuisine pendant l'envoi : sa carte n'a plus de champ, rien n'est gardé pour lui.
    if (!posees.has(cle)) return;
    etats.set(cle, reponse.ok ? { texte: "", enRoute: false } : { texte, raison: reponse.reason, detail: reponse.detail, enRoute: false });
    rendre(doc, cle);
  };
  champ.addEventListener("input", () => etats.set(cle, { ...etatDe(cle), texte: champ.value }));
  champ.addEventListener("keydown", (/** @type {any} */ evenement) => {
    if (evenement.key !== "Enter" || evenement.isComposing === true) return;
    evenement.preventDefault();
    void envoyer();
  });
  const action = boutonAction(doc, ENVOYER, () => void envoyer());
  saisie.append(champ, action);
  const raison = doc.createElement("div");
  raison.className = "mot-au-cook-ligne";
  racine.append(saisie, raison);
  posees.set(cle, { champ, bouton: action.children?.[0] ?? action, raison });
  rendre(doc, cle);
  return [racine];
}
