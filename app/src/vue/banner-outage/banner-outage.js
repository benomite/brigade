// @ts-check
// Le bandeau de panne du projet (ticket 4216, épique 4112) : il rend le statut que le runtime lui donne —
// `{ state: "fault" | "idle", cause, action }` — et rien d'autre. En panne : la phrase de la cause, en rouge, marquée
// d'une icône de panne ; avec `action.kind = "done"`, ce que le système a fait ; avec `action.kind = "button"`, UN bouton,
// dont le clic lance la réparation `action.id`. À l'arrêt tranquille (`idle`) : la phrase de la cause, en neutre — ni rouge,
// ni icône de panne, ni bouton. Aucun texte que le chef doive porter ailleurs.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.

import { button } from "../composants/button/button.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ kind: "done", text: string } | { kind: "button", label: string, id: string }} ActionDeOutage */
/** @typedef {{ state: "fault" | "idle", cause: string, action: ActionDeOutage | null }} StatusDeOutage */

/** @param {unknown} statut @returns {statut is StatusDeOutage} */
export const estUnStatusDeOutage = (statut) =>
  typeof statut === "object" && statut !== null && "state" in statut && (statut.state === "fault" || statut.state === "idle");

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} hote @param {(id: string) => void} reparer @returns {{ maj(statut: unknown): void }} */
export function monterLeBanner(doc, hote, reparer) {
  return {
    maj(statut) {
      if (!estUnStatusDeOutage(statut)) return hote.replaceChildren();
      const line = doc.createElement("p");
      if (statut.state === "idle") {
        line.className = "bandeau-repos";
        const phrase = doc.createElement("span");
        phrase.textContent = statut.cause;
        line.append(phrase);
        return hote.replaceChildren(line);
      }
      line.className = "panne-du-rail bandeau-en-panne panne";
      line.role = "alert";
      const marque = doc.createElement("span");
      marque.className = "marque icone-panne";
      marque.textContent = "FAULT";
      const phrase = doc.createElement("strong");
      phrase.textContent = statut.cause;
      line.append(marque, phrase);
      const action = statut.action;
      if (action?.kind === "done") {
        const fait = doc.createElement("span");
        fait.className = "fait-du-systeme";
        fait.textContent = action.text;
        line.append(fait);
      } else if (action?.kind === "button") line.append(button(doc, action.label, () => reparer(action.id), { sorte: "recommande" }));
      hote.replaceChildren(line);
    },
  };
}
