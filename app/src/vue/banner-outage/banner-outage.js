// @ts-check
// Le bandeau de panne du projet (ticket 4216, épique 4112) : il rend le statut que le runtime lui donne —
// `{ state: "fault" | "idle", cause, action }` — et rien d'autre. En panne : la phrase de la cause, en rouge, marquée
// d'une icône de panne ; avec `action.kind = "done"`, ce que le système a fait ; avec `action.kind = "button"`, UN bouton,
// dont le clic lance la réparation `action.id`. À l'arrêt tranquille (`idle`) : la phrase de la cause, en neutre — ni rouge,
// ni icône de panne, ni bouton. Aucun texte que le chef doive porter ailleurs.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.

import { button } from "../components/button/button.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ kind: "done", text: string } | { kind: "button", label: string, id: string }} ActionOfOutage */
/** @typedef {{ state: "fault" | "idle", cause: string, action: ActionOfOutage | null }} StatusOfOutage */

/** @param {unknown} statut @returns {statut is StatusOfOutage} */
export const isOneStatusOfOutage = (statut) =>
  typeof statut === "object" && statut !== null && "state" in statut && (statut.state === "fault" || statut.state === "idle");

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} host @param {(id: string) => void} reparer @returns {{ maj(statut: unknown): void }} */
export function mountTheBanner(doc, host, reparer) {
  return {
    maj(statut) {
      if (!isOneStatusOfOutage(statut)) return host.replaceChildren();
      const line = doc.createElement("p");
      if (statut.state === "idle") {
        line.className = "bandeau-repos";
        const sentence = doc.createElement("span");
        sentence.textContent = statut.cause;
        line.append(sentence);
        return host.replaceChildren(line);
      }
      line.className = "panne-du-rail bandeau-en-panne panne";
      line.role = "alert";
      const brand = doc.createElement("span");
      brand.className = "marque icone-panne";
      brand.textContent = "FAULT";
      const sentence = doc.createElement("strong");
      sentence.textContent = statut.cause;
      line.append(brand, sentence);
      const action = statut.action;
      if (action?.kind === "done") {
        const done = doc.createElement("span");
        done.className = "fait-du-systeme";
        done.textContent = action.text;
        line.append(done);
      } else if (action?.kind === "button") line.append(button(doc, action.label, () => reparer(action.id), { sorte: "recommande" }));
      host.replaceChildren(line);
    },
  };
}
