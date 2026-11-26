// @ts-check
// Le savoir-faire du projet (ticket 4241, épique 4140) : l'onglet Know-how du menu du projet, entre Stations et Settings.
// Il liste les entrées que les cooks du projet reçoivent, chacune avec le ticket d'où elle est née. Le chef en réécrit une
// sur place — « edit » ouvre son texte dans un champ, « save » l'enregistre, « cancel » le laisse — ou en retire une —
// « remove », puis « Yes, remove ». Sans entrée, l'onglet le dit. Une lecture ou un geste qui échoue se dit en une ligne,
// le détail au survol, et le texte en cours reste dans son champ.
// Chaque ouverture de l'onglet relit les entrées (`relireLeSavoirFaire`) ; ce que le chef a ouvert, tapé ou envoyé est
// gardé ici, par projet, et chaque rendu le reprend : la vue repose l'onglet à chaque lecture de la cuisine.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { buttonAction } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { ANNULER, ENREGISTREMENT, READ_DE, OUI, PAS_ENCORE, REESSAYER } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Entree} Entree */
/** @typedef {typeof EN_COURS | { entrees: Entree[] } | { raison: string, detail: string }} Read */
/**
 * `edition` : l'entrée ouverte dans son champ, et ce qui y est tapé ; `aRetirer` : l'entrée dont le retrait attend sa
 * confirmation ; `enRoute` : l'entrée dont un geste est parti ; `refus` : le dernier geste refusé, sous son entrée.
 * @typedef {{ lecture: Read, edition?: { id: string, texte: string }, aRetirer?: string, enRoute?: string, refus?: { id: string, raison: string, detail: string } }} State
 */

export const TITRE = "Know-how";
const AIDE = "What the project's cooks have learned, each entry with the ticket it came from. Each cook receives the latest entries when it starts.";
const CHAMP = "savoir-faire";
// La lecture partie, pas encore revenue.
const EN_COURS = "en-cours";

/** @type {Map<string, State>} */
const states = new Map();

/** @param {unknown} error */
const raisonDe = (error) => ({ raison: error instanceof Error ? error.message : String(error), detail: String(/** @type {{ detail?: unknown }} */ (error)?.detail ?? "") });

/**
 * Relit les entrées du projet, et oublie ce qui était ouvert : `reposer` est appelé quand elles sont là.
 * @param {string} project @param {() => void} reposer
 */
export function relireLeKnowHow(project, reposer) {
  /** @type {State} */
  const state = { lecture: EN_COURS };
  states.set(project, state);
  void source.lire(project).then(
    (entrees) => ({ entrees }),
    (error) => raisonDe(error),
  ).then((read) => {
    // Une lecture plus récente est partie : celle-ci ne dit plus rien.
    if (states.get(project) !== state) return;
    state.lecture = read;
    reposer();
  });
}

/**
 * Un geste sur une entrée : parti, puis `appliquer` s'il passe, ou son refus sous l'entrée.
 * @param {string} project @param {State} state @param {string} id @param {() => Promise<void>} action @param {(entrees: Entree[]) => Entree[]} appliquer @param {() => void} reposer
 */
async function jouer(project, state, id, action, appliquer, reposer) {
  state.enRoute = id;
  delete state.refus;
  reposer();
  try {
    await action();
  } catch (error) {
    if (states.get(project) !== state) return;
    delete state.enRoute;
    state.refus = { id, ...raisonDe(error) };
    return reposer();
  }
  if (states.get(project) !== state) return;
  delete state.enRoute;
  delete state.edition;
  delete state.aRetirer;
  // Un geste ne part que d'une entrée lue : la lecture de cet état a ses entrées.
  state.lecture = { entrees: appliquer(/** @type {{ entrees: Entree[] }} */ (state.lecture).entrees) };
  reposer();
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} texte */
function texte(doc, balise, classe, texte) {
  const cree = doc.createElement(balise);
  cree.className = classe;
  cree.textContent = texte;
  return cree;
}

/**
 * Une entrée : son texte — ou son champ, ouverte —, le ticket d'où elle vient, ses gestes, et le refus du dernier.
 * @param {Fabrique} doc @param {string} project @param {State} state @param {Entree} entree @param {() => void} reposer
 */
function poserLEntree(doc, project, state, entree, reposer) {
  const { id } = entree;
  const line = doc.createElement("li");
  line.className = "entree";
  const enRoute = state.enRoute === id;
  const edition = state.edition?.id === id ? state.edition : undefined;
  /** @type {any[]} */
  const actionRow = [];
  if (edition !== undefined) {
    const champ = doc.createElement("textarea");
    champ.className = "texte";
    champ.ariaLabel = `the text of the entry from #${entree.ticket}`;
    champ.dataset.cle = `${project}#${id}`;
    champ.dataset.champ = CHAMP;
    // Le texte d'avant, en valeur par défaut ; ce qui est tapé, en valeur.
    champ.textContent = entree.text;
    champ.value = edition.texte;
    champ.readOnly = enRoute;
    champ.addEventListener("input", () => (edition.texte = champ.value));
    line.append(champ);
    // Le texte tel que le runtime l'écrit : sur une ligne (runtime/src/savoir-faire/savoir-faire.ts).
    const enregistrer = () => {
      const tape = champ.value;
      const ecrit = tape.replace(/\s+/g, " ").trim();
      void jouer(project, state, id, () => source.modifier(id, tape, project), (entrees) => entrees.map((une) => (une.id === id ? { ...une, text: ecrit } : une)), reposer);
    };
    actionRow.push(
      buttonAction(doc, enRoute ? ENREGISTREMENT : "save", enregistrer, { recommande: true }),
      buttonAction(doc, ANNULER, () => {
        delete state.edition;
        delete state.refus;
        reposer();
      }),
    );
  } else {
    line.append(texte(doc, "p", "texte", entree.text));
    if (state.aRetirer === id) {
      line.append(texte(doc, "p", "confirmation", "Remove this entry? No cook will receive it any more."));
      const retirer = () => source.retirer(id, project);
      actionRow.push(
        buttonAction(doc, OUI("remove"), () => void jouer(project, state, id, retirer, (entrees) => entrees.filter((une) => une.id !== id), reposer), { sorte: "danger" }),
        buttonAction(doc, ANNULER, () => {
          delete state.aRetirer;
          reposer();
        }),
      );
    } else {
      actionRow.push(
        buttonAction(doc, "edit", () => {
          state.edition = { id, texte: entree.text };
          delete state.aRetirer;
          delete state.refus;
          reposer();
        }),
        buttonAction(doc, "remove", () => {
          state.aRetirer = id;
          delete state.edition;
          delete state.refus;
          reposer();
        }),
      );
    }
  }
  line.append(texte(doc, "span", "ticket", `from #${entree.ticket}`));
  const actions = doc.createElement("div");
  actions.className = "gestes";
  for (const action of actionRow) action.children[0].disabled = enRoute;
  actions.append(...actionRow);
  line.append(actions);
  if (state.refus?.id === id) line.append(lineError(doc, state.refus.raison, state.refus.detail, { classe: "refus", alerte: true }));
  return line;
}

/**
 * L'onglet Know-how du projet. Jamais lu pour ce projet : la lecture part, et l'onglet le dit en l'attendant.
 * @param {Fabrique} doc @param {string} project @param {() => void} reposer
 */
export function poserLeKnowHow(doc, project, reposer) {
  if (!states.has(project)) relireLeKnowHow(project, reposer);
  const state = /** @type {State} */ (states.get(project));
  const section = doc.createElement("section");
  section.className = "savoir-faire";
  section.ariaLabel = TITRE;
  section.append(texte(doc, "h2", "titre", TITRE), texte(doc, "p", "aide", AIDE));
  const { lecture: read } = state;
  if (read === EN_COURS) section.append(texte(doc, "p", "lecture", READ_DE("the know-how")));
  else if ("raison" in read) section.append(lineError(doc, read.raison, read.detail), buttonAction(doc, REESSAYER, () => relireLeKnowHow(project, reposer)));
  else if (read.entrees.length === 0) section.append(texte(doc, "p", "aucune", `${PAS_ENCORE("know-how")} The project has no entry.`));
  else {
    const liste = doc.createElement("ul");
    liste.className = "entrees";
    liste.append(...read.entrees.map((entree) => poserLEntree(doc, project, state, entree, reposer)));
    section.append(liste);
  }
  return section;
}
