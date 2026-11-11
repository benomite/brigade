// @ts-check
// Essayer une livraison depuis sa carte (essai.ts, ticket 3215) : « try it » quand le projet déclare `.brigade/try.json` et que la
// carte est en pass ou livrée ; en route, où la version se trouve et un seul « stop » ; raté, une ligne de raison puis la fin de
// la sortie de la commande. Sans déclaration, une phrase dit quoi créer. Ce module ne touche pas `document`.

import { bouton } from "../composants/bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../essai.ts").VuDesEssais} Vu */

export const ESSAYER = "try it";
export const ARRETER = "stop";
export const FICHIER = ".brigade/try.json";
export const EXEMPLE = '{"command": "npm install && npm run dev", "url": "http://localhost:5173"}';
export const MESSAGE_SANS_DECLARATION = `to try a delivery from its card, create ${FICHIER} with a \`command\` key and an optional \`url\` key, e.g. ${EXEMPLE}`;
export const SANS_ADRESSE = "it runs in the opened window or process";

// Ce qui se pose sur une carte essayable, d'après ce que le process principal a lu du projet (`vu`) : rien tant qu'il n'a
// rien dit, la phrase de la déclaration manquante, ou ce que l'essai de cette carte en dit.
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
  if ("absente" in declaration) {
    const phrase = doc.createElement("p");
    phrase.className = "essai-sans-declaration";
    phrase.textContent = MESSAGE_SANS_DECLARATION;
    return [phrase];
  }
  if ("invalide" in declaration) {
    const phrase = doc.createElement("p");
    phrase.className = "essai-sans-declaration";
    phrase.textContent = declaration.invalide;
    return [phrase];
  }
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
