// @ts-check
// Les gestes retenus sur le TODO (#4273, épique #4209) : une carte par geste qu'un agent retient pour l'OK du chef — son
// résumé, sa raison, la ligne `awaiting` mot pour mot, et un seul bouton, Approve, qui appelle l'action d'approuver avec
// son id. Faite, la carte quitte la liste ; refusée, elle reste, et dit pourquoi. Ni ssh, ni commande tapée.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.
// Il est en JavaScript pour que la vue l'importe telle quelle ; cartes-retenues.ts le donne aux modules TypeScript.

import { bouton } from "../vue/composants/bouton/bouton.js";
import { ligneErreur } from "../vue/composants/ligne-erreur/ligne-erreur.js";

/** @typedef {import("./contrat.ts").GesteRetenu} GesteRetenu */
/** @typedef {import("./contrat.ts").LectureDesRetenus} LectureDesRetenus */
/** @typedef {import("./contrat.ts").Approuver} Approuver */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

export const APPROUVER = "Approve";
// L'en-tête des cartes, dans le TODO du projet.
export const TETE = "Held for your OK";
// La classe de la ligne d'erreur d'une carte, par laquelle elle se retrouve — et se remplace — au refus suivant.
const ERREUR = "erreur-du-geste-retenu";

/**
 * Une carte par geste retenu : son résumé, puis sa raison, et le bouton Approve. Un clic appelle `approuver` avec l'id du
 * geste, le bouton inerte le temps de la réponse ; faite, la carte quitte sa liste ; refusée, elle dit le refus et se
 * reclique.
 * @param {Fabrique} doc @param {readonly GesteRetenu[]} gestes @param {Approuver} approuver
 */
export function poserCartesRetenues(doc, gestes, approuver) {
  return gestes.map((geste) => {
    const carte = doc.createElement("li");
    carte.className = "entree-du-todo";
    carte.dataset.geste = geste.id;
    const resume = Object.assign(doc.createElement("p"), { className: "demande-du-todo", textContent: geste.summary });
    const raison = Object.assign(doc.createElement("p"), { className: "raison-du-geste-retenu", textContent: geste.reason });
    const ok = bouton(doc, APPROUVER, () => void approuverLaCarte(), { sorte: "recommande" });
    const reponses = doc.createElement("div");
    reponses.className = "reponses-du-todo";
    reponses.append(ok);
    carte.append(resume, raison, reponses);
    async function approuverLaCarte() {
      ok.disabled = true;
      try {
        await approuver(geste.id);
        carte.remove();
      } catch (erreur) {
        for (const ancienne of carte.children.filter((/** @type {any} */ pose) => pose.className === ERREUR)) ancienne.remove();
        carte.append(ligneErreur(doc, erreur instanceof Error ? erreur.message : String(erreur), "", { classe: ERREUR, alerte: true }));
      }
      ok.disabled = false;
    }
    return carte;
  });
}

/**
 * Le cadre des gestes retenus dans le TODO du projet : l'en-tête et ses cartes ; ou, quand ils ne se lisent pas, une ligne
 * d'erreur — jamais rien à la place. Rien quand aucun geste n'est retenu, ou qu'ils ne sont pas lus ici.
 * @param {Fabrique} doc @param {LectureDesRetenus | undefined} lus @param {Approuver} approuver
 */
export function poserLesRetenus(doc, lus, approuver) {
  if (lus === undefined) return undefined;
  if ("sans" in lus) return ligneErreur(doc, lus.sans, lus.detail);
  if (lus.gestes.length === 0) return undefined;
  const cadre = doc.createElement("div");
  cadre.className = "todo-du-rail";
  cadre.ariaLabel = TETE;
  const tete = Object.assign(doc.createElement("p"), { className: "tete-du-todo", textContent: `${TETE} (${lus.gestes.length})` });
  const liste = doc.createElement("ol");
  liste.className = "entrees-du-todo";
  liste.append(...poserCartesRetenues(doc, lus.gestes, approuver));
  cadre.append(tete, liste);
  return cadre;
}

/**
 * Ce que le rail vide dit quand des gestes sont retenus (#4273) : « N splits wait for your OK » — jamais un arrêt sans
 * cause, ni une attente de place en cuisine. Nul quand le rail porte un ticket ou qu'aucun geste n'est retenu : la phrase
 * d'avant reste.
 * @param {{ rail: number, retenus: readonly GesteRetenu[] }} etat
 * @returns {string | null}
 */
export function phraseDuRailVide({ rail, retenus }) {
  if (rail > 0 || retenus.length === 0) return null;
  return `${retenus.length} splits wait for your OK`;
}

/**
 * Les gestes retenus lus, sans celui que le chef vient d'approuver : la carte ne revient pas avant la lecture suivante.
 * @param {LectureDesRetenus | undefined} lus @param {string} id
 * @returns {LectureDesRetenus | undefined}
 */
export function sansLApprouve(lus, id) {
  if (lus === undefined || "sans" in lus) return lus;
  return { gestes: lus.gestes.filter((geste) => geste.id !== id) };
}

/**
 * Les gestes retenus d'une lecture : aucun quand elle ne les donne pas.
 * @param {LectureDesRetenus | undefined} lus
 */
export const retenusDe = (lus) => (lus !== undefined && "gestes" in lus ? lus.gestes : []);
