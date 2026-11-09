// @ts-check
// « Awaiting others » au pied de TODO (ticket 2985) : les cartes qui attendent un autre humain du projet que le compte
// connecté (vue/cartes-assignees/), repliées par défaut sous leur nombre, après les siennes. Dépliée, chacune dit son
// ticket, sa question et qui elle attend, leurs logins GitHub — en lecture seule : ni choix, ni champ, ni geste. Rien
// n'attend un autre humain : la section n'est pas posée. Le même bloc ferme TODO sur un écran étroit, la vue étant la même.

export const TITRE = "Awaiting others";

/** @typedef {import("../../faits.ts").CarteDAutrui} CarteDAutrui */

/**
 * @param {import("../briques.js").Fabrique} doc
 * @param {{ autres: readonly CarteDAutrui[] | undefined, deplie: boolean, deplier: (ouvert: boolean) => void }} options
 * `deplie` : le chef l'a dépliée, et la lecture suivante la garde dépliée ; `deplier` : il l'ouvre ou la referme.
 * @returns {HTMLElement | undefined}
 */
export function poserLesAutres(doc, { autres, deplie, deplier }) {
  if (autres === undefined || autres.length === 0) return undefined;
  const pli = /** @type {HTMLDetailsElement} */ (doc.createElement("details"));
  pli.className = "replie autres";
  if (deplie) pli.open = true;
  pli.addEventListener("toggle", () => deplier(pli.open === true));
  const tete = doc.createElement("summary");
  tete.textContent = `${TITRE} (${autres.length})`;
  const liste = doc.createElement("ul");
  liste.append(
    ...autres.map(({ ticket, titre, question, qui }) => {
      const ligne = doc.createElement("li");
      ligne.className = "carte-d-autrui";
      ligne.dataset.ticket = String(ticket);
      const numero = doc.createElement("span");
      numero.className = "numero mono";
      numero.textContent = `#${ticket}`;
      if (titre !== undefined) numero.title = titre;
      const dit = doc.createElement("p");
      dit.className = "question";
      dit.textContent = question;
      const attend = doc.createElement("p");
      attend.className = "qui";
      attend.textContent = `awaits ${qui.join(", ")}`;
      ligne.append(numero, dit, attend);
      return ligne;
    }),
  );
  pli.append(tete, liste);
  return pli;
}
