// @ts-check
// Essayer une livraison depuis sa carte (trial.ts, ticket 3215) : « try it » quand le projet déclare `.brigade/try.json` et que la
// carte est en pass ou livrée ; en route, où la version se trouve et un seul « stop » ; raté, une ligne de raison puis la fin de
// la sortie de la commande. Sans déclaration utilisable (absente, `tryable: false`, illisible), la carte ne dit rien : on ne
// demande jamais au chef d'écrire un fichier. Ce module ne touche pas `document`.

import { button } from "../composants/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../trial.ts").VuDesEssais} Vu */

export const ESSAYER = "try it";
export const ARRETER = "stop";
export const SANS_ADRESSE = "it runs in the opened window or process";

// Ce qui se pose sur une carte essayable, d'après ce que le process principal a lu du projet (`vu`) : rien tant qu'il n'a
// rien dit ou que le projet n'a pas de déclaration utilisable, ou ce que l'essai de cette carte en dit.
/**
 * @param {Fabrique} doc
 * @param {Vu | undefined} vu
 * @param {number} ticket
 * @param {{ essayer: () => void, arreter: () => void }} actions
 * @returns {any[]}
 */
export function poserLTrial(doc, vu, ticket, actions) {
  if (vu === undefined) return [];
  const { declaration, essais } = vu;
  if (!("declaration" in declaration)) return [];
  const trial = essais[ticket];
  const rangee = doc.createElement("div");
  rangee.className = "essai-rangee";
  if (trial !== undefined && "enCours" in trial) {
    const ou = doc.createElement("p");
    ou.className = "essai-ou";
    ou.textContent = trial.url === undefined ? SANS_ADRESSE : `running at ${trial.url}`;
    const stop = button(doc, ARRETER, actions.arreter);
    stop.dataset.geste = "essai-arreter";
    rangee.append(ou, stop);
    return [rangee];
  }
  const essayer = button(doc, ESSAYER, actions.essayer, { sorte: "secondaire" });
  essayer.dataset.geste = "essai-essayer";
  rangee.append(essayer);
  if (trial !== undefined && "echec" in trial) {
    const raison = doc.createElement("p");
    raison.className = "essai-echec";
    raison.textContent = trial.echec.raison;
    rangee.append(raison);
    if (trial.echec.fin !== "") {
      const fin = doc.createElement("pre");
      fin.className = "essai-fin mono";
      fin.textContent = trial.echec.fin;
      rangee.append(fin);
    }
  }
  return [rangee];
}
