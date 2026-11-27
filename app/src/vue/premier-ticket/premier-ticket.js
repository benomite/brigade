// @ts-check
// Le premier ticket d'un projet neuf, écrit dans l'app (ticket 3306, épique 3301). Le projet prêt, au-dessus du rail, le
// second demande au chef ce qu'il veut changer d'abord, avec un champ pour sa réponse. Envoyée, le second écrit l'issue
// (runtime/src/premier-ticket/, `rediger`) et l'app la montre — son titre et son corps — avec deux gestes : « Yes, put it on
// the rail », le recommandé, et le champ de ce qui doit changer, avec « ask for changes ». Un changement demandé, le second
// réécrit et la montre de nouveau ; rien n'est créé avant le « oui ». Sur le « oui », le runtime crée l'issue avec ses
// labels (`creer`, `fire` compris) : elle est sur le rail. Le chef n'ouvre pas GitHub, ne tape ni ne voit aucun label.
// Une rédaction ou une création qui échoue se dit en une ligne, sa cause au survol, et le geste reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { gestes } from "../parcours-projet/connexion.js";
import { AU_RETOUR } from "../choix-station/choix-station.js";
import { OUI as OUI_A } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Brouillon} Brouillon */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Demande} Demande */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Redaction} Redaction */
/** @typedef {import("../../../../runtime/src/premier-ticket/premier-ticket.ts").Creation} Creation */
/** @typedef {{ dit: string, detail: string }} Refus */
// Où en est le premier ticket d'un projet :
//   question    le second demande ce qu'il faut changer d'abord ; `reponse`, ce que le chef a tapé ; `refus`, la dernière
//               rédaction qui a échoué
//   redaction   le second écrit (ou réécrit, avec `brouillon` et `changements`) : le chef n'a rien à faire
//   brouillon   l'issue écrite, montrée : le « oui » ou les changements ; `changements`, ce que le chef a tapé ; `refus`,
//               la réécriture ou la création qui a échoué
//   creation    le « oui » est parti : l'issue se crée
//   cree        l'issue est sur le rail
/**
 * @typedef {{ etape: "question", reponse: string, refus?: Refus }
 *   | { etape: "redaction", reponse: string, brouillon?: Brouillon, changements?: string }
 *   | { etape: "brouillon", reponse: string, brouillon: Brouillon, changements: string, refus?: Refus }
 *   | { etape: "creation", reponse: string, brouillon: Brouillon }
 *   | { etape: "cree", ticket: number, url: string }} Etat
 */

// Les mots de docs/glossary.md : le second, le rail, la cuisine (`kitchen`), le ticket.
export const LE_SECOND = "the second";
/** @param {string} depot */
export const QUESTION = (depot) => `${depot} is ready. What do you want to change first?`;
export const CHAMP_REPONSE = "In your words: what should change, and for whom";
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
export const CHAMP_DE_LA_REPONSE = "premier-ticket-reponse";
export const CHAMP_DES_CHANGEMENTS = "premier-ticket-changements";

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {{ valeur: string, placeholder: string, champ: string, figee: boolean }} quoi @param {(texte: string) => void} ecrire @param {any} [aAllumer] */
function champ(doc, { valeur, placeholder, champ: nom, figee }, ecrire, aAllumer) {
  const saisie = cree(doc, "textarea");
  saisie.value = valeur;
  saisie.rows = 3;
  saisie.placeholder = placeholder;
  saisie.ariaLabel = placeholder;
  saisie.disabled = figee;
  saisie.dataset.champ = nom;
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
 * }} GestesDuPremierTicket
 */

// Le premier ticket, dans son état, au-dessus du rail. `absente` : la station choisie hors ligne (ticket 3187) — la page dit
// qu'elle prend le projet à son retour.
/** @param {Fabrique} doc @param {{ depot: string, etat: Etat, absente?: string }} donnees @param {GestesDuPremierTicket} geste */
export function poserPremierTicket(doc, { depot, etat, absente }, geste) {
  const racine = cree(doc, "section", "premier-ticket carte");
  racine.dataset.etape = etat.etape;
  racine.ariaLabel = `${depot}: its first ticket`;
  const qui = cree(doc, "p", "qui", LE_SECOND);
  const auRetour = absente === undefined ? [] : [cree(doc, "p", "au-retour", AU_RETOUR(absente, depot))];
  if (etat.etape === "question") {
    const envoyer = boutonAction(doc, ENVOYER, geste.envoyer, { recommande: true });
    eteindre(envoyer, etat.reponse.trim() === "");
    const saisie = champ(doc, { valeur: etat.reponse, placeholder: CHAMP_REPONSE, champ: CHAMP_DE_LA_REPONSE, figee: false }, geste.ecrire, envoyer.children?.[0]);
    racine.append(qui, cree(doc, "h2", "attendu", QUESTION(depot)), ...auRetour, saisie, gestes(doc, [envoyer, boutonAction(doc, PLUS_TARD, geste.fermer)]));
    if (etat.refus !== undefined) racine.append(ligneErreur(doc, etat.refus.dit, etat.refus.detail, { classe: "erreur" }));
    return racine;
  }
  if (etat.etape === "redaction") {
    racine.append(qui, cree(doc, "h2", "attendu", etat.brouillon === undefined ? REDACTION : REECRITURE), ...auRetour, cree(doc, "p", "reponse", `“${etat.changements ?? etat.reponse}”`));
    return racine;
  }
  if (etat.etape === "cree") {
    racine.append(cree(doc, "h2", "attendu", CREE(etat.ticket)), ...auRetour, gestes(doc, [boutonAction(doc, FERMER, geste.fermer)]));
    return racine;
  }
  const figee = etat.etape === "creation";
  const oui = boutonAction(doc, OUI, geste.oui, { recommande: true, prix: PRIX_OUI });
  eteindre(oui, figee);
  const changer = boutonAction(doc, CHANGER, geste.changer);
  const changements = etat.etape === "brouillon" ? etat.changements : "";
  eteindre(changer, figee || changements.trim() === "");
  const saisie = champ(doc, { valeur: changements, placeholder: CHAMP_CHANGEMENTS, champ: CHAMP_DES_CHANGEMENTS, figee }, geste.ecrire, changer.children?.[0]);
  const renvoi = cree(doc, "div", "changements");
  renvoi.append(saisie, changer);
  racine.append(qui, cree(doc, "h2", "attendu", RELIRE), ...auRetour, poserLeBrouillon(doc, etat.brouillon), gestes(doc, [oui]), renvoi);
  if (figee) racine.append(cree(doc, "p", "phrase", CREATION));
  if (etat.etape === "brouillon" && etat.refus !== undefined) racine.append(ligneErreur(doc, etat.refus.dit, etat.refus.detail, { classe: "erreur" }));
  return racine;
}

const parti = (/** @type {unknown} */ erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les premiers tickets tenus pour la vue, un par projet prêt que « Add a project » a ouvert, le temps que l'app tourne.
// `rediger` et `creer` sont les gestes du pont (le process principal joue runtime/src/premier-ticket/) : la vue n'appelle
// `creer` que sur le « oui » du chef.
/**
 * @param {{
 *   rendre: (projet: string) => void,
 *   rediger: (projet: string, demande: Demande) => Promise<Redaction>,
 *   creer: (projet: string, brouillon: Brouillon) => Promise<Creation>,
 * }} options
 */
export function tenirLesPremiersTickets({ rendre, rediger, creer }) {
  /** @type {Map<string, Etat>} */
  const tenus = new Map();
  /** @param {string} projet @param {Etat} etat */
  const poser = (projet, etat) => {
    tenus.set(projet, etat);
    rendre(projet);
  };
  return {
    /** @param {string} projet @returns {Etat | undefined} */
    de: (projet) => tenus.get(projet),
    // Le projet est prêt : le second pose sa question, une fois.
    /** @param {string} projet */
    commencer(projet) {
      if (!tenus.has(projet)) tenus.set(projet, { etape: "question", reponse: "" });
    },
    // Ce que le chef tape : gardé, sans redessiner — le champ l'a déjà.
    /** @param {string} projet @param {string} texte */
    ecrire(projet, texte) {
      const etat = tenus.get(projet);
      if (etat?.etape === "question") tenus.set(projet, { ...etat, reponse: texte });
      else if (etat?.etape === "brouillon") tenus.set(projet, { ...etat, changements: texte });
    },
    // La réponse part au second ; son brouillon revient, ou ce qui l'a empêché, et la question reste.
    /** @param {string} projet */
    async envoyer(projet) {
      const etat = tenus.get(projet);
      if (etat?.etape !== "question" || etat.reponse.trim() === "") return;
      const reponse = etat.reponse;
      poser(projet, { etape: "redaction", reponse });
      /** @type {Redaction} */
      let rendu;
      try {
        rendu = await rediger(projet, { answer: reponse });
      } catch (erreur) {
        rendu = { refus: "the app could not ask the second to write the ticket", detail: parti(erreur) };
      }
      if (tenus.get(projet)?.etape !== "redaction") return;
      poser(projet, "draft" in rendu ? { etape: "brouillon", reponse, brouillon: rendu.draft, changements: "" } : { etape: "question", reponse, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    // Les changements partent au second, avec le brouillon vu ; il revient réécrit — rien n'est créé.
    /** @param {string} projet */
    async changer(projet) {
      const etat = tenus.get(projet);
      if (etat?.etape !== "brouillon" || etat.changements.trim() === "") return;
      const { reponse, brouillon, changements } = etat;
      poser(projet, { etape: "redaction", reponse, brouillon, changements });
      /** @type {Redaction} */
      let rendu;
      try {
        rendu = await rediger(projet, { answer: reponse, draft: brouillon, changes: changements });
      } catch (erreur) {
        rendu = { refus: "the app could not ask the second to rewrite the ticket", detail: parti(erreur) };
      }
      if (tenus.get(projet)?.etape !== "redaction") return;
      poser(projet, "draft" in rendu ? { etape: "brouillon", reponse, brouillon: rendu.draft, changements: "" } : { etape: "brouillon", reponse, brouillon, changements, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    // Le « oui » : l'issue se crée, une fois ; refusée, le brouillon reste, et le « oui » aussi.
    /** @param {string} projet */
    async oui(projet) {
      const etat = tenus.get(projet);
      if (etat?.etape !== "brouillon") return;
      const { reponse, brouillon, changements } = etat;
      poser(projet, { etape: "creation", reponse, brouillon });
      /** @type {Creation} */
      let rendu;
      try {
        rendu = await creer(projet, brouillon);
      } catch (erreur) {
        rendu = { refus: "nothing was created: GitHub could not be reached", detail: parti(erreur) };
      }
      if (tenus.get(projet)?.etape !== "creation") return;
      poser(projet, "ticket" in rendu ? { etape: "cree", ticket: rendu.ticket, url: rendu.url } : { etape: "brouillon", reponse, brouillon, changements, refus: { dit: rendu.refus, detail: rendu.detail } });
    },
    /** @param {string} projet */
    oublier: (projet) => tenus.delete(projet),
  };
}
