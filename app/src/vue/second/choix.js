// @ts-check
// Les choix du second, sous son terminal (ticket 1520, épique 1518) : quand le second demande au chef de choisir, il
// publie ses choix par son canal (runtime/src/second-propositions/) — l'app ne lit pas le terminal —, et l'onglet du
// second les montre sous le terminal, un bouton par choix, son libellé d'une ligne. Un clic envoie le choix au second
// comme si le chef l'avait tapé ; répondre en tapant dans le terminal marche aussi. Dans les deux cas, les boutons
// partent, et l'app signale la réponse au canal, qui efface la proposition. Une proposition nouvelle remplace la
// précédente ; le second passé à autre chose, il n'y a plus rien à montrer. Sans proposition, rien sous le terminal.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../second/propositions.ts").Proposition} Proposition */
/** @typedef {Extract<Proposition, { kind: "choices" }>} Choix */

export const ATTENDU = "The second asks you to choose";
export const AIDE = "a click answers as if you had typed the choice in the terminal — you can also type your own answer there";

// Une frappe dans le terminal du second qui envoie une réponse : elle porte une Entrée. Un collage — entre les
// marques que xterm pose autour — n'envoie rien : `claude` le garde dans son champ.
/** @param {string} donnees */
export function reponseTapee(donnees) {
  return donnees.includes("\r") && !donnees.startsWith("\x1b[200~");
}

// Ce que la vue tient des propositions du second, projet par projet : la dernière reçue, et celles auxquelles le chef a
// répondu — leurs boutons sont partis, même si le canal ne l'a pas encore dit.
export function tenirLesChoix() {
  /** @type {Map<string, Proposition>} */
  const tenues = new Map();
  /** @type {Set<string>} */
  const repondues = new Set();
  return {
    // Tout ce que le canal envoie : une proposition, ou null quand il n'y en a plus.
    /** @param {Readonly<Record<string, Proposition>>} vues */
    recevoirToutes(vues) {
      for (const [projet, proposition] of Object.entries(vues)) if (!tenues.has(projet)) tenues.set(projet, proposition);
    },
    /** @param {string} projet @param {Proposition | null} proposition */
    recevoir(projet, proposition) {
      if (proposition === null) tenues.delete(projet);
      else tenues.set(projet, proposition);
    },
    // Les choix à montrer sous le terminal du second de ce projet : une liste de choix, sans réponse.
    /** @param {string} projet @returns {Choix | undefined} */
    aMontrer(projet) {
      const tenue = tenues.get(projet);
      return tenue?.kind === "choices" && !repondues.has(tenue.id) ? tenue : undefined;
    },
    // Le chef a répondu aux choix de ce projet : rend ceux auxquels il a répondu, qui ne se montrent plus.
    /** @param {string} projet @returns {Choix | undefined} */
    repondre(projet) {
      const montres = this.aMontrer(projet);
      if (montres !== undefined) repondues.add(montres.id);
      return montres;
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La zone sous le terminal : ce qu'on attend du chef, en une phrase, puis un bouton par choix — sa valeur, ce qu'un
// clic tape, et son libellé. Rien n'est coupé : un libellé long passe à la ligne.
/** @param {Fabrique} doc @param {Choix} proposition @param {{ choisir: (valeur: string) => void }} gestes */
export function poserChoixDuSecond(doc, proposition, { choisir }) {
  const racine = cree(doc, "section");
  racine.className = "choix-du-second";
  racine.ariaLabel = ATTENDU;
  racine.dataset.proposition = proposition.id;
  const attendu = cree(doc, "p");
  attendu.className = "attendu";
  attendu.append(ATTENDU, survol(doc, AIDE));
  const liste = cree(doc, "ul");
  liste.append(
    ...proposition.choices.map(({ value, label }) => {
      const choix = cree(doc, "li");
      const bouton = cree(doc, "button");
      bouton.type = "button";
      bouton.className = "choix";
      bouton.dataset.valeur = value;
      bouton.title = `answers ${value}`;
      const valeur = cree(doc, "span", value);
      valeur.className = "valeur mono";
      const libelle = cree(doc, "span", label);
      libelle.className = "libelle";
      bouton.append(valeur, libelle);
      bouton.addEventListener("click", () => choisir(value));
      choix.append(bouton);
      return choix;
    }),
  );
  racine.append(attendu, liste);
  return racine;
}
