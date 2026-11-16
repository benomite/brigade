// @ts-check
// Le moteur d'une livraison, à deux endroits (#3747) : sur sa fiche, « cooked with … », et sur la page des coûts, le prix
// d'une livraison cuisinée sur une clé d'API Claude. Subscription et Codex n'ont aucun prix. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (briques.js).

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ engine: "claude-subscription" | "claude-api-key" | "codex", costUsd?: number }} MoteurDeLivraison */

// Une livraison d'avant `engine` : cuisinée sur l'abonnement Claude.
/** @type {MoteurDeLivraison} */
export const SANS_MOTEUR = { engine: "claude-subscription" };

export const NOMS = { "claude-subscription": "Claude subscription", "claude-api-key": "Claude API key", codex: "Codex" };

// Le prix, en dollars, au centime : « $1.24 » ; nul pour tout moteur qui n'en a pas.
/** @param {MoteurDeLivraison | undefined} moteur @returns {string | null} */
export function prixDit(moteur) {
  return moteur?.engine === "claude-api-key" && moteur.costUsd !== undefined ? `$${moteur.costUsd.toFixed(2)}` : null;
}

// La ligne de la fiche : le moteur, et son prix s'il en a un.
/** @param {Fabrique} doc @param {MoteurDeLivraison} moteur */
export function poserMoteur(doc, moteur) {
  const ligne = doc.createElement("p");
  ligne.className = "moteur-livraison";
  const nom = doc.createElement("strong");
  nom.textContent = NOMS[moteur.engine];
  const libelle = doc.createElement("span");
  libelle.textContent = "cooked with";
  ligne.append(libelle, nom);
  const prix = prixDit(moteur);
  if (prix !== null) {
    const cout = doc.createElement("span");
    cout.className = "prix";
    cout.textContent = prix;
    ligne.append(cout);
  }
  return ligne;
}

// Le prix d'une ligne de la page des coûts ; rien pour un moteur sans prix.
/** @param {Fabrique} doc @param {MoteurDeLivraison | undefined} moteur */
export function poserPrix(doc, moteur) {
  const prix = prixDit(moteur);
  const pose = doc.createElement("span");
  pose.className = "prix";
  if (prix !== null) pose.textContent = prix;
  return pose;
}
