// @ts-check
// Le bilan d'une passe de nettoyage finie, dans la partie « closer » (ticket 992, épique 986) : ce que la
// passe a retiré et la PR qu'elle a ouverte, lus dans la demande de `closing --json` (`request`,
// runtime/src/fermeture-lecture/lecture.ts) — l'app ne recompte rien. Une demande qui n'est pas
// finie n'a pas de bilan : la place reste vide. Une passe finie sans PR (rien de livré) le dit et
// ne montre aucun lien. Ce module ne touche pas `document` : il rend des éléments.

import { survol } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/**
 * @typedef {{ state: string }
 *   | { state: "done", delivered: boolean, pr: string | null, removed: { id: string, what: string }[], removedLines: number | null, addedLines: number | null, files: string[], text: string }} Demande
 */

export const TITRE = "Last cleanup report";
export const RETIRE = "removed";
export const RIEN_RETIRE = "nothing was removed";
export const PR = "opened PR";
export const SANS_PR = "no PR was opened";

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une adresse que l'app ouvre : https seulement, ce que la box a écrit — rien d'autre n'est un lien.
/** @param {string | null} adresse */
const ouvrable = (adresse) => adresse !== null && /^https:\/\/[^\s]+$/.test(adresse);

// Le nombre de lignes, tel que la passe l'a compté ; nul, il ne s'écrit pas.
/** @param {{ removedLines: number | null, addedLines: number | null, files: string[] }} fin */
function lignes({ removedLines, addedLines, files }) {
  if (removedLines === null) return "";
  const ajoutees = addedLines === null ? "" : ` / +${addedLines}`;
  return `−${removedLines}${ajoutees} line${s(removedLines)} in ${files.length} file${s(files.length)}`;
}

/**
 * La place du bilan : vide tant que la dernière demande n'est pas finie. `ouvrir` ouvre la PR dans le
 * navigateur du poste ; le lien garde son adresse, que le survol montre.
 * @param {Fabrique} doc @param {Demande} demande @param {(url: string) => void} [ouvrir]
 * @returns {any[]}
 */
export function poserBilan(doc, demande, ouvrir = () => {}) {
  if (demande.state !== "done") return [];
  const fin = /** @type {Extract<Demande, { state: "done" }>} */ (demande);
  const bloc = cree(doc, "div");
  bloc.className = "bilan";
  bloc.append(cree(doc, "h3", TITRE));

  const retire = cree(doc, "div");
  retire.className = "bilan-retire";
  const titreRetire = cree(doc, "h4", `${RETIRE} (${fin.removed.length})`);
  const total = lignes(fin);
  if (total !== "") titreRetire.append(survol(doc, total));
  retire.append(titreRetire);
  if (fin.removed.length === 0) {
    const vide = cree(doc, "p", RIEN_RETIRE);
    vide.className = "sans";
    retire.append(vide);
  } else {
    const liste = cree(doc, "ul");
    liste.className = "retraits";
    for (const { id, what } of fin.removed) {
      const item = cree(doc, "li");
      const nom = cree(doc, "span", id);
      nom.className = "nom mono";
      const quoi = cree(doc, "span", what);
      quoi.className = "quoi";
      item.append(nom, quoi);
      liste.append(item);
    }
    retire.append(liste);
  }

  const pr = cree(doc, "p");
  pr.className = "bilan-pr";
  if (ouvrable(fin.pr)) {
    const adresse = /** @type {string} */ (fin.pr);
    pr.append(`${PR}: `);
    const lien = cree(doc, "a", adresse.replace(/^https:\/\/[^/]+\//, ""));
    lien.href = adresse;
    lien.title = `open ${adresse} in your browser`;
    lien.addEventListener("click", (/** @type {{ preventDefault: () => void }} */ evenement) => {
      evenement.preventDefault();
      ouvrir(adresse);
    });
    pr.append(lien);
  } else {
    pr.className = "bilan-pr sans";
    pr.append(SANS_PR);
  }
  bloc.append(retire, pr);
  return [bloc];
}
