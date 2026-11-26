// @ts-check
// Le bandeau de panne du projet (ticket 4216, épique 4112) : il rend le statut que le runtime lui donne —
// `{ state: "fault" | "idle", cause, action }` — et rien d'autre. En panne : la phrase de la cause, en rouge, marquée
// d'une icône de panne ; avec `action.kind = "done"`, ce que le système a fait ; avec `action.kind = "button"`, UN bouton,
// dont le clic lance la réparation `action.id`. À l'arrêt tranquille (`idle`) : la phrase de la cause, en neutre — ni rouge,
// ni icône de panne, ni bouton. Aucun texte que le chef doive porter ailleurs.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.

import { bouton } from "../composants/bouton/bouton.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ kind: "done", text: string } | { kind: "button", label: string, id: string }} ActionDePanne */
/** @typedef {{ state: "fault" | "idle", cause: string, action: ActionDePanne | null }} StatutDePanne */

/** @param {unknown} statut @returns {statut is StatutDePanne} */
export const estUnStatutDePanne = (statut) =>
  typeof statut === "object" && statut !== null && "state" in statut && (statut.state === "fault" || statut.state === "idle");

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} hote @param {(id: string) => void} reparer @returns {{ maj(statut: unknown): void }} */
export function monterLeBandeau(doc, hote, reparer) {
  return {
    maj(statut) {
      if (!estUnStatutDePanne(statut)) return hote.replaceChildren();
      const ligne = doc.createElement("p");
      if (statut.state === "idle") {
        ligne.className = "bandeau-repos";
        const phrase = doc.createElement("span");
        phrase.textContent = statut.cause;
        ligne.append(phrase);
        return hote.replaceChildren(ligne);
      }
      ligne.className = "panne-du-rail bandeau-en-panne panne";
      ligne.role = "alert";
      const marque = doc.createElement("span");
      marque.className = "marque icone-panne";
      marque.textContent = "FAULT";
      const phrase = doc.createElement("strong");
      phrase.textContent = statut.cause;
      ligne.append(marque, phrase);
      const action = statut.action;
      if (action?.kind === "done") {
        const fait = doc.createElement("span");
        fait.className = "fait-du-systeme";
        fait.textContent = action.text;
        ligne.append(fait);
      } else if (action?.kind === "button") ligne.append(bouton(doc, action.label, () => reparer(action.id), { sorte: "recommande" }));
      hote.replaceChildren(ligne);
    },
  };
}
