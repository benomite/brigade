// @ts-check
// Le moteur d'une livraison, à deux endroits (ticket 3747) : sur sa fiche, « cooked with … », et sur la page des coûts, le prix
// d'une livraison cuisinée sur une clé d'API Claude. Subscription et Codex n'ont aucun prix. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (bricks.js).

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ engine: "claude-subscription" | "claude-api-key" | "codex", costUsd?: number }} EngineOfDelivery */

// Une livraison d'avant `engine` : cuisinée sur l'abonnement Claude.
/** @type {EngineOfDelivery} */
export const WITHOUT_ENGINE = { engine: "claude-subscription" };

export const NAMES = { "claude-subscription": "Claude subscription", "claude-api-key": "Claude API key", codex: "Codex" };

// Le prix, en dollars, au centime : « $1.24 » ; nul pour tout moteur qui n'en a pas.
/** @param {EngineOfDelivery | undefined} engine @returns {string | null} */
export function priceSays(engine) {
  return engine?.engine === "claude-api-key" && engine.costUsd !== undefined ? `$${engine.costUsd.toFixed(2)}` : null;
}

// La ligne de la fiche : le moteur, et son prix s'il en a un.
/** @param {Fabrique} doc @param {EngineOfDelivery} engine */
export function setEngine(doc, engine) {
  const line = doc.createElement("p");
  line.className = "moteur-livraison";
  const name = doc.createElement("strong");
  name.textContent = NAMES[engine.engine];
  const wording = doc.createElement("span");
  wording.textContent = "cooked with";
  line.append(wording, name);
  const price = priceSays(engine);
  if (price !== null) {
    const cost = doc.createElement("span");
    cost.className = "prix";
    cost.textContent = price;
    line.append(cost);
  }
  return line;
}

// Le prix d'une ligne de la page des coûts ; rien pour un moteur sans prix.
/** @param {Fabrique} doc @param {EngineOfDelivery | undefined} engine */
export function setPrice(doc, engine) {
  const price = priceSays(engine);
  const pose = doc.createElement("span");
  pose.className = "prix";
  if (price !== null) pose.textContent = price;
  return pose;
}
