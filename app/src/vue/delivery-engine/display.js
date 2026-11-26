// @ts-check
// Le moteur d'une livraison, à deux endroits (ticket 3747) : sur sa fiche, « cooked with … », et sur la page des coûts, le prix
// d'une livraison cuisinée sur une clé d'API Claude. Subscription et Codex n'ont aucun prix. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (briques.js).

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ engine: "claude-subscription" | "claude-api-key" | "codex", costUsd?: number }} EngineDeDelivery */

// Une livraison d'avant `engine` : cuisinée sur l'abonnement Claude.
/** @type {EngineDeDelivery} */
export const SANS_ENGINE = { engine: "claude-subscription" };

export const NOMS = { "claude-subscription": "Claude subscription", "claude-api-key": "Claude API key", codex: "Codex" };

// Le prix, en dollars, au centime : « $1.24 » ; nul pour tout moteur qui n'en a pas.
/** @param {EngineDeDelivery | undefined} engine @returns {string | null} */
export function prixDit(engine) {
  return engine?.engine === "claude-api-key" && engine.costUsd !== undefined ? `$${engine.costUsd.toFixed(2)}` : null;
}

// La ligne de la fiche : le moteur, et son prix s'il en a un.
/** @param {Fabrique} doc @param {EngineDeDelivery} engine */
export function poserEngine(doc, engine) {
  const line = doc.createElement("p");
  line.className = "moteur-livraison";
  const name = doc.createElement("strong");
  name.textContent = NOMS[engine.engine];
  const libelle = doc.createElement("span");
  libelle.textContent = "cooked with";
  line.append(libelle, name);
  const prix = prixDit(engine);
  if (prix !== null) {
    const cost = doc.createElement("span");
    cost.className = "prix";
    cost.textContent = prix;
    line.append(cost);
  }
  return line;
}

// Le prix d'une ligne de la page des coûts ; rien pour un moteur sans prix.
/** @param {Fabrique} doc @param {EngineDeDelivery | undefined} engine */
export function poserPrix(doc, engine) {
  const prix = prixDit(engine);
  const pose = doc.createElement("span");
  pose.className = "prix";
  if (prix !== null) pose.textContent = prix;
  return pose;
}
