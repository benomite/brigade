// @ts-check
// Les gestes de WAITING (tickets 591 et 3075), sur la carte d'un ticket et sur sa fiche : « waiting for… » sur une carte de TODO,
// qui ouvre son formulaire — ce qu'elle attend, dans les mots du chef ; de qui ; le jour de la relance, proposé à sept
// jours ; puis « resume » et « it arrived, back to the kitchen » sur une carte de WAITING. Ce qui part se décide dans le
// process principal (attente.ts, vue/attente/attente-github.ts) : ce module pose les boutons et le formulaire, et rend
// chaque clic à la vue, qui tient l'état de chaque carte. Il ne touche pas `document` : la vue lui donne le sien, les
// tests un faux.

import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ANNULER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ id: string, libelle: string }} Geste */
/** @typedef {{ quoi: string, qui: string, relance: string, refus?: string }} Ouvert */
/** @typedef {{ envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }} Arrivee */

// Le jour de la relance que le formulaire propose : dans sept jours, au calendrier du poste (vue/attente/saisie.ts,
// `relanceProposee`) — modifiable.
/** @param {Date} maintenant */
export function relanceProposee(maintenant) {
  const dans = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 7);
  return `${dans.getFullYear()}-${String(dans.getMonth() + 1).padStart(2, "0")}-${String(dans.getDate()).padStart(2, "0")}`;
}

/** @param {Fabrique} doc @param {string} balise @param {string} texte */
const bloc = (doc, balise, texte) => {
  const cree = doc.createElement(balise);
  cree.textContent = texte;
  return cree;
};

// Ce que chaque bouton dit au survol.
/** @param {string} id @param {number} ticket */
const survolDe = (id, ticket) =>
  id === "attente-poser"
    ? `put #${ticket} in WAITING: say what it waits for, from whom, and when to come back to it`
    : id === "attente-reprendre"
      ? `bring #${ticket} back into TODO, now — it stops waiting`
      : `#${ticket} goes back to the kitchen, without going through TODO — \`waiting\` removed from its issue`;

// Les gestes de WAITING d'une carte : une rangée de boutons — ou, le formulaire ouvert, le formulaire. `arrivee` : ce
// qu'il est advenu de son « it arrived », dit sous la rangée. `cle` : `<projet>#<ticket>`, qui nomme ses champs. `cliquer` : un bouton touché, par son geste.
/**
 * @param {Fabrique} doc
 * @param {{ ticket: number, cle: string, siens: readonly Geste[], ouvert: Ouvert | undefined, arrivee: Arrivee | undefined }} etat
 * @param {{ cliquer: (id: string) => void, valider: () => void, renoncer: () => void }} gestes
 * @returns {HTMLElement[]}
 */
export function poserLesGestesDAttente(doc, { ticket, cle, siens, ouvert, arrivee }, gestes) {
  if (siens.length === 0) return [];
  if (ouvert !== undefined && siens.some(({ id }) => id === "attente-poser")) return [poserLeFormulaire(doc, ticket, cle, ouvert, gestes)];
  const rangee = doc.createElement("p");
  rangee.className = "gestes attente";
  rangee.append(
    ...siens.map(({ id, libelle }) => {
      const pose = bouton(doc, libelle, () => gestes.cliquer(id));
      pose.dataset.attente = id;
      pose.title = survolDe(id, ticket);
      if (arrivee !== undefined && "envoi" in arrivee) pose.disabled = true;
      return pose;
    }),
  );
  if (arrivee === undefined) return [rangee];
  const dite = "refus" in arrivee ? ligneErreur(doc, arrivee.refus, arrivee.detail, { classe: "arrivee refus" }) : bloc(doc, "p", "envoi" in arrivee ? "it arrived, back to the kitchen: sent, waiting for the answer…" : arrivee.fait);
  if (!("refus" in arrivee)) dite.className = "arrivee";
  dite.ariaLive = "polite";
  if ("fait" in arrivee && arrivee.detail !== "") dite.title = arrivee.detail;
  return [rangee, dite];
}

// Le formulaire « waiting for… » : trois champs, que le chef remplit, puis « put in WAITING », qui fait partir le geste —
// ou dit, sous les champs, pourquoi il ne part pas (`ouvert.refus`) ; « Cancel » le referme, et rien ne part.
/** @param {Fabrique} doc @param {number} ticket @param {string} cle @param {Ouvert} ouvert @param {{ valider: () => void, renoncer: () => void }} gestes */
function poserLeFormulaire(doc, ticket, cle, ouvert, { valider, renoncer }) {
  const formulaire = doc.createElement("form");
  formulaire.className = "attente";
  /** @param {"quoi" | "qui" | "relance"} champ @param {string} libelle @param {string} [type] */
  const saisie = (champ, libelle, type) => {
    const etiquette = doc.createElement("label");
    const entree = doc.createElement("input");
    if (type !== undefined) entree.type = type;
    entree.value = ouvert[champ];
    entree.dataset.champ = champ;
    // La vue rend le clavier au champ qu'il tenait quand elle redessine la carte.
    entree.dataset.cle = cle;
    entree.addEventListener("input", () => void (ouvert[champ] = entree.value));
    etiquette.append(bloc(doc, "span", libelle), entree);
    return etiquette;
  };
  const poser = bouton(doc, "put in WAITING", undefined, { sorte: "recommande", type: "submit" });
  poser.dataset.attente = "attente-poser";
  const rangee = doc.createElement("p");
  rangee.className = "gestes";
  rangee.append(poser, bouton(doc, ANNULER, renoncer, { sorte: "discret" }));
  formulaire.append(
    bloc(doc, "strong", `#${ticket} waits for a third party`),
    saisie("quoi", "what it waits for, in your words"),
    saisie("qui", "from whom"),
    saisie("relance", "follow-up on", "date"),
    ...(ouvert.refus === undefined ? [] : [Object.assign(bloc(doc, "p", ouvert.refus), { className: "refus" })]),
    rangee,
  );
  formulaire.addEventListener("submit", (/** @type {Event} */ soumission) => {
    soumission.preventDefault();
    valider();
  });
  return formulaire;
}
