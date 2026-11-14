// @ts-check
// Essayer une livraison depuis sa carte (essai.ts, ticket 3215) : « try it » quand le projet déclare `.brigade/try.json` et que la
// carte est en pass ou livrée ; en route, où la version se trouve et un seul « stop » ; raté, une ligne de raison puis la fin de
// la sortie de la commande. Sans déclaration utilisable (absente, `tryable: false`, illisible), la carte ne dit rien : on ne
// demande jamais au chef d'écrire un fichier. Ce module ne touche pas `document`.

import { bouton } from "../composants/bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../essai.ts").VuDesEssais} Vu */

export const ESSAYER = "try it";
export const ARRETER = "stop";
export const SANS_ADRESSE = "it runs in the opened window or process";

// Ce qui se pose sur une carte essayable, d'après ce que le process principal a lu du projet (`vu`) : rien tant qu'il n'a
// rien dit ou que le projet n'a pas de déclaration utilisable, ou ce que l'essai de cette carte en dit.
/**
 * @param {Fabrique} doc
 * @param {Vu | undefined} vu
 * @param {number} ticket
 * @param {{ essayer: () => void, arreter: () => void }} gestes
 * @returns {any[]}
 */
export function poserLEssai(doc, vu, ticket, gestes) {
  if (vu === undefined) return [];
  const { declaration, essais } = vu;
  if (!("declaration" in declaration)) return [];
  const essai = essais[ticket];
  const rangee = doc.createElement("div");
  rangee.className = "essai";
  if (essai !== undefined && "enCours" in essai) {
    const ou = doc.createElement("p");
    ou.className = "essai-ou";
    ou.textContent = essai.url === undefined ? SANS_ADRESSE : `running at ${essai.url}`;
    const arret = bouton(doc, ARRETER, gestes.arreter);
    arret.dataset.geste = "essai-arreter";
    rangee.append(ou, arret);
    return [rangee];
  }
  const essayer = bouton(doc, ESSAYER, gestes.essayer, { sorte: "secondaire" });
  essayer.dataset.geste = "essai-essayer";
  rangee.append(essayer);
  if (essai !== undefined && "echec" in essai) {
    const raison = doc.createElement("p");
    raison.className = "essai-echec";
    raison.textContent = essai.echec.raison;
    rangee.append(raison);
    if (essai.echec.fin !== "") {
      const fin = doc.createElement("pre");
      fin.className = "essai-fin mono";
      fin.textContent = essai.echec.fin;
      rangee.append(fin);
    }
  }
  return [rangee];
}
