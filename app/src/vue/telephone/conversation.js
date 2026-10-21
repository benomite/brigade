// @ts-check
// La conversation avec le second d'un projet, sur le téléphone (le ticket 1165, épique 1151) : l'onglet Second d'un
// téléphone n'a pas de terminal — aucun pty n'y tourne —, il a la conversation, en messages. C'est celle du second du
// desktop : ce que le chef y a écrit, d'ici ou de son ordinateur, et ce que le second a répondu, du plus ancien au
// plus récent, son markdown rendu. Dessous, le champ du message et « send » : le message part dans cette même
// conversation, comme s'il était tapé dans le terminal du second, et la réponse vient ici quand le pont la pousse
// (`surConversation`). Rien ne part d'un champ vide, ni deux fois : pendant l'envoi, le champ et « send » attendent.
// Pas parti, le texte reste dans le champ, une ligne dit pourquoi, et le détail est au survol. Une conversation qui
// ne se lit pas se dit en une ligne — « conversation unavailable » —, avec « read again ».
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément (briques.js), le pont, et
// de quoi rendre du markdown — `poserBlocs` de vue.js.

import { boutonAction, lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../pont.d.ts").Conversation} Conversation */
/** @typedef {import("../pont.d.ts").RefusDeConversation} Refus */
/** @typedef {import("../../markdown.ts").Bloc} Bloc */
/**
 * @typedef {{
 *   conversation?(projet: string): Promise<Conversation | Refus | undefined>,
 *   envoyerAuSecond?(projet: string, texte: string): Promise<Conversation | Refus | undefined>,
 *   ouvrirLienDuSecond?(projet: string, url: string): Promise<boolean>,
 * }} PontDeLaConversation
 */

export const AIDE = "The same conversation as your computer's Second: what you send from here is written there, and the second's replies come back here.";
export const ENVOYER = "send";
// Ce qu'un message au second coûte : sa réponse, que le second écrit sur ton quota Max.
export const PRIX = "the second's reply is spent on your Max quota";
export const ILLISIBLE = "conversation unavailable";
export const NON_ENVOYE = "your message was not sent";
// Un pont qui ne porte pas la conversation — celui de l'app Android, tant que le guichet de sa station ne la sert
// pas — ne rend rien : rien n'est lu ni envoyé, et l'écran le dit.
export const SANS_PONT = "this app does not carry the second's conversation to the station yet";
export const ATTENTE = "sending to the second…";
export const REPOND = "the second is answering…";

/** @param {string} projet */
export const attenduDe = (projet) => `Write to ${projet}'s second: it answers here.`;

// Une réponse du pont, telle que l'écran la lit : la conversation, ou pourquoi il n'y en a pas — un pont qui ne rend
// rien, ou rien qui ait la forme d'une conversation, est un refus.
/** @param {unknown} rendu @param {string} ligne @returns {Conversation | { refus: string, detail: string }} */
export function luDe(rendu, ligne) {
  if (rendu === undefined || rendu === null || typeof rendu !== "object") return { refus: ligne, detail: SANS_PONT };
  const lu = /** @type {Record<string, unknown>} */ (rendu);
  if (Array.isArray(lu.messages)) return /** @type {Conversation} */ (rendu);
  if (typeof lu.refus === "string") return { refus: lu.refus, detail: typeof lu.detail === "string" ? lu.detail : "" };
  return { refus: ligne, detail: SANS_PONT };
}

// Ce qu'une lecture refusée dit au survol : ce que le pont en a dit, sa phrase puis son détail — rien de répété.
/** @param {{ refus: string, detail: string }} refus */
const detailDe = ({ refus, detail }) => [refus, detail].filter((dit) => dit !== "" && dit !== ILLISIBLE).join(" — ");

// L'heure d'un message, comme l'app les écrit — en anglais —, sans les secondes : sur un téléphone, la ligne est courte.
/** @param {string} a */
const heureDe = (a) => {
  const date = new Date(a);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function poser(doc, balise, texte) {
  const cree = doc.createElement(balise);
  if (texte !== undefined) cree.textContent = texte;
  return cree;
}
// Ce que l'écran dit lui-même à la place d'un message — la lecture en route, une conversation vide, le second qui
// répond —, sans bulle. Les classes s'écrivent en toutes lettres : peau.test.ts les cherche ainsi.
/** @param {Fabrique} doc @param {"sans" | "repond"} sorte @param {string} texte */
function ligneDuFil(doc, sorte, texte) {
  const ligne = poser(doc, "li", texte);
  if (sorte === "sans") ligne.className = "sans";
  else ligne.className = "second repond";
  return ligne;
}

// La conversation, tenue : son champ et « send » sont posés une fois — ce que le chef tape ne se perd ni quand une
// réponse arrive, ni d'un projet à l'autre (un brouillon par projet) —, et seuls les messages et la ligne d'issue se
// reposent. `rendre` : le markdown d'un message en éléments (vue.js, `poserBlocs`), ses liens ouverts par `ouvrir`.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ pont: PontDeLaConversation, rendre: (blocs: Bloc[], ouvrir: (url: string) => void) => HTMLElement[] }} options */
export function tenirConversation(lieu, doc, { pont, rendre }) {
  const attendu = poser(doc, "p");
  attendu.className = "attendu";
  const fil = poser(doc, "ol");
  fil.className = "messages";
  fil.ariaLive = "polite";
  const issue = poser(doc, "div");
  issue.className = "issue-conversation";
  issue.ariaLive = "polite";
  const saisie = /** @type {HTMLTextAreaElement} */ (poser(doc, "textarea"));
  saisie.rows = 2;
  const envoyer = boutonAction(doc, ENVOYER, () => void envoyerLeMessage(), { recommande: true, prix: PRIX });
  const bouton = /** @type {HTMLButtonElement} */ (envoyer.firstChild);
  bouton.dataset.geste = "envoyer-au-second";
  const champ = poser(doc, "div");
  champ.className = "message-au-second";
  champ.append(saisie, envoyer);
  lieu.replaceChildren(attendu, fil, issue, champ);

  /** @type {Map<string, Conversation | { refus: string, detail: string }>} */
  const lues = new Map();
  // Les lectures en route, par projet : une seule à la fois.
  /** @type {Set<string>} */
  const enLecture = new Set();
  /** @type {Map<string, string>} */
  const brouillons = new Map();
  // Ce qu'il est advenu du dernier envoi, par projet : en route, ou pourquoi rien n'est parti.
  /** @type {Map<string, { envoi: true } | { refus: string, detail: string }>} */
  const envois = new Map();
  /** @type {string | undefined} */
  let montre;

  saisie.addEventListener("input", () => {
    if (montre === undefined) return;
    brouillons.set(montre, saisie.value);
    const envoi = envois.get(montre);
    if (envoi !== undefined && "refus" in envoi) envois.delete(montre);
    poserIssue();
  });

  function poserIssue() {
    const envoi = montre === undefined ? undefined : envois.get(montre);
    const enRoute = envoi !== undefined && "envoi" in envoi;
    const lue = montre === undefined ? undefined : lues.get(montre);
    // Une conversation illisible n'a pas de champ : son seul geste est de la relire.
    champ.hidden = lue === undefined || "refus" in lue;
    saisie.disabled = enRoute;
    bouton.disabled = enRoute || saisie.value.trim() === "";
    if (enRoute) {
      const attente = poser(doc, "p", ATTENTE);
      attente.className = "attente";
      return void issue.replaceChildren(attente);
    }
    if (envoi !== undefined && "refus" in envoi) {
      const ligne = lectureIndisponible(doc, envoi.refus, envoi.detail);
      ligne.className = "indisponible refus";
      return void issue.replaceChildren(ligne);
    }
    issue.replaceChildren();
  }

  function poserMessages() {
    if (montre === undefined) return;
    const projet = montre;
    const lue = lues.get(projet);
    attendu.replaceChildren(attenduDe(projet), survol(doc, AIDE));
    if (lue === undefined) fil.replaceChildren(ligneDuFil(doc, "sans", "reading the conversation…"));
    else if ("refus" in lue) {
      const relire = boutonAction(doc, "read again", () => void lire(projet));
      const ligne = poser(doc, "li");
      ligne.className = "illisible";
      ligne.append(lectureIndisponible(doc, ILLISIBLE, detailDe(lue)), relire);
      fil.replaceChildren(ligne);
    } else {
      /** @param {string} url */
      const ouvrir = (url) => void pont.ouvrirLienDuSecond?.(projet, url);
      const messages = lue.messages.map(({ de, a, blocs }) => {
        const message = poser(doc, "li");
        if (de === "chef") message.className = "chef";
        else message.className = "second";
        const tete = poser(doc, "header");
        tete.append(poser(doc, "strong", de === "chef" ? "you" : "second"), poser(doc, "time", heureDe(a)));
        const corps = poser(doc, "div");
        corps.className = "rendu";
        corps.append(...rendre(blocs, ouvrir));
        message.append(tete, corps);
        return message;
      });
      if (messages.length === 0) messages.push(ligneDuFil(doc, "sans", "nothing said yet: your message starts the conversation"));
      if (lue.repond === true) messages.push(ligneDuFil(doc, "repond", REPOND));
      fil.replaceChildren(...messages);
      // Le dernier message en vue : la conversation se lit par le bas.
      fil.scrollTop = fil.scrollHeight;
    }
    poserIssue();
  }

  /** @param {string} projet */
  async function lire(projet) {
    if (enLecture.has(projet)) return;
    enLecture.add(projet);
    /** @type {unknown} */
    let rendu;
    try {
      rendu = await pont.conversation?.(projet);
    } catch (erreur) {
      rendu = { refus: "the station did not answer", detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    enLecture.delete(projet);
    const lu = luDe(rendu, ILLISIBLE);
    // Une conversation déjà lue le reste quand une relecture échoue : la ligne d'issue le dit.
    const avant = lues.get(projet);
    if ("refus" in lu && avant !== undefined && !("refus" in avant)) envois.set(projet, { refus: ILLISIBLE, detail: detailDe(lu) });
    else lues.set(projet, lu);
    if (projet === montre) poserMessages();
  }

  async function envoyerLeMessage() {
    if (montre === undefined) return;
    const projet = montre;
    const texte = saisie.value.trim();
    const avant = envois.get(projet);
    if (texte === "" || (avant !== undefined && "envoi" in avant)) return;
    envois.set(projet, { envoi: true });
    poserIssue();
    /** @type {unknown} */
    let rendu;
    try {
      rendu = await pont.envoyerAuSecond?.(projet, texte);
    } catch (erreur) {
      rendu = { refus: NON_ENVOYE, detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    const lu = luDe(rendu, NON_ENVOYE);
    if ("refus" in lu) envois.set(projet, lu);
    else {
      envois.delete(projet);
      lues.set(projet, lu);
      brouillons.delete(projet);
      if (projet === montre) saisie.value = "";
    }
    if (projet === montre) poserMessages();
  }

  return {
    // L'onglet Second du projet est montré : sa conversation, lue une fois s'il ne l'a jamais été. Rien ne se repose
    // quand c'est déjà lui — le chef qui tape ne perd rien.
    /** @param {string} projet */
    montrer(projet) {
      if (montre === projet) return;
      montre = projet;
      saisie.value = brouillons.get(projet) ?? "";
      saisie.ariaLabel = `your message to ${projet}'s second`;
      saisie.placeholder = `a message to ${projet}'s second`;
      bouton.title = `sends what you wrote to ${projet}'s second, in the same conversation as on your computer`;
      poserMessages();
      if (!lues.has(projet)) void lire(projet);
    },
    // L'onglet est rechoisi : la conversation est relue, ce qui est montré reste en attendant.
    /** @param {string} projet */
    relire(projet) {
      void lire(projet);
    },
    // Le pont pousse la conversation d'un projet : une réponse du second, un message écrit du desktop.
    /** @param {string} projet @param {unknown} conversation */
    recevoir(projet, conversation) {
      const lu = luDe(conversation, ILLISIBLE);
      if ("refus" in lu) return;
      lues.set(projet, lu);
      if (projet === montre) poserMessages();
    },
    fil,
    saisie,
    bouton,
  };
}
