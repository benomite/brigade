// @ts-check
// Essayer une livraison depuis sa carte (trial.ts, ticket 3215) : « try it » quand le projet déclare `.brigade/try.json` et que la
// carte est en pass ou livrée ; en route, où la version se trouve et un seul « stop » ; raté, une ligne de raison puis la fin de
// la sortie de la commande. Sans déclaration utilisable (absente, `tryable: false`, illisible), la carte ne dit rien : on ne
// demande jamais au chef d'écrire un fichier. Ce module ne touche pas `document`.

import { button } from "../components/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../trial.ts").SeenOfTrials} Seen */

export const TRY = "try it";
export const STOP = "stop";
export const WITHOUT_ADDRESS = "it runs in the opened window or process";

// Ce qui se pose sur une carte essayable, d'après ce que le process principal a lu du projet (`vu`) : rien tant qu'il n'a
// rien dit ou que le projet n'a pas de déclaration utilisable, ou ce que l'essai de cette carte en dit.
/**
 * @param {Fabrique} doc
 * @param {Seen | undefined} seenOne
 * @param {number} ticket
 * @param {{ essayer: () => void, arreter: () => void }} actions
 * @returns {any[]}
 */
export function setTheTrial(doc, seenOne, ticket, actions) {
  if (seenOne === undefined) return [];
  const { declaration, essais: trials } = seenOne;
  if (!("declaration" in declaration)) return [];
  const trial = trials[ticket];
  const row = doc.createElement("div");
  row.className = "essai-rangee";
  if (trial !== undefined && "enCours" in trial) {
    const or = doc.createElement("p");
    or.className = "essai-ou";
    or.textContent = trial.url === undefined ? WITHOUT_ADDRESS : `running at ${trial.url}`;
    const stop = button(doc, STOP, actions.arreter);
    stop.dataset.geste = "essai-arreter";
    row.append(or, stop);
    return [row];
  }
  const attempt = button(doc, TRY, actions.essayer, { sorte: "secondaire" });
  attempt.dataset.geste = "essai-essayer";
  row.append(attempt);
  if (trial !== undefined && "echec" in trial) {
    const reason = doc.createElement("p");
    reason.className = "essai-echec";
    reason.textContent = trial.echec.raison;
    row.append(reason);
    if (trial.echec.fin !== "") {
      const end = doc.createElement("pre");
      end.className = "essai-fin mono";
      end.textContent = trial.echec.fin;
      row.append(end);
    }
  }
  return [row];
}
