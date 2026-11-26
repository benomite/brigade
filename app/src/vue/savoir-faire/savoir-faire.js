// @ts-check
// Le savoir-faire du projet (ticket 4241, épique 4140) : l'onglet Know-how du menu du projet, entre Stations et Settings.
// Il liste les entrées que les cooks du projet reçoivent, chacune avec le ticket d'où elle est née. Le chef en réécrit une
// sur place — « edit » ouvre son texte dans un champ, « save » l'enregistre, « cancel » le laisse — ou en retire une —
// « remove », puis « Yes, remove ». Sans entrée, l'onglet le dit. Une lecture ou un geste qui échoue se dit en une ligne,
// le détail au survol, et le texte en cours reste dans son champ.
// Chaque ouverture de l'onglet relit les entrées (`relireLeSavoirFaire`) ; ce que le chef a ouvert, tapé ou envoyé est
// gardé ici, par projet, et chaque rendu le reprend : la vue repose l'onglet à chaque lecture de la cuisine.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ANNULER, ENREGISTREMENT, LECTURE_DE, OUI, PAS_ENCORE, REESSAYER } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Entree} Entree */
/** @typedef {typeof EN_COURS | { entrees: Entree[] } | { raison: string, detail: string }} Lecture */
/**
 * `edition` : l'entrée ouverte dans son champ, et ce qui y est tapé ; `aRetirer` : l'entrée dont le retrait attend sa
 * confirmation ; `enRoute` : l'entrée dont un geste est parti ; `refus` : le dernier geste refusé, sous son entrée.
 * @typedef {{ lecture: Lecture, edition?: { id: string, texte: string }, aRetirer?: string, enRoute?: string, refus?: { id: string, raison: string, detail: string } }} Etat
 */

export const TITRE = "Know-how";
const AIDE = "What the project's cooks have learned, each entry with the ticket it came from. Each cook receives the latest entries when it starts.";
const CHAMP = "savoir-faire";
// La lecture partie, pas encore revenue.
const EN_COURS = "en-cours";

/** @type {Map<string, Etat>} */
const etats = new Map();

/** @param {unknown} erreur */
const raisonDe = (erreur) => ({ raison: erreur instanceof Error ? erreur.message : String(erreur), detail: String(/** @type {{ detail?: unknown }} */ (erreur)?.detail ?? "") });

/**
 * Relit les entrées du projet, et oublie ce qui était ouvert : `reposer` est appelé quand elles sont là.
 * @param {string} projet @param {() => void} reposer
 */
export function relireLeSavoirFaire(projet, reposer) {
  /** @type {Etat} */
  const etat = { lecture: EN_COURS };
  etats.set(projet, etat);
  void source.lire(projet).then(
    (entrees) => ({ entrees }),
    (erreur) => raisonDe(erreur),
  ).then((lecture) => {
    // Une lecture plus récente est partie : celle-ci ne dit plus rien.
    if (etats.get(projet) !== etat) return;
    etat.lecture = lecture;
    reposer();
  });
}

/**
 * Un geste sur une entrée : parti, puis `appliquer` s'il passe, ou son refus sous l'entrée.
 * @param {string} projet @param {Etat} etat @param {string} id @param {() => Promise<void>} geste @param {(entrees: Entree[]) => Entree[]} appliquer @param {() => void} reposer
 */
async function jouer(projet, etat, id, geste, appliquer, reposer) {
  etat.enRoute = id;
  delete etat.refus;
  reposer();
  try {
    await geste();
  } catch (erreur) {
    if (etats.get(projet) !== etat) return;
    delete etat.enRoute;
    etat.refus = { id, ...raisonDe(erreur) };
    return reposer();
  }
  if (etats.get(projet) !== etat) return;
  delete etat.enRoute;
  delete etat.edition;
  delete etat.aRetirer;
  // Un geste ne part que d'une entrée lue : la lecture de cet état a ses entrées.
  etat.lecture = { entrees: appliquer(/** @type {{ entrees: Entree[] }} */ (etat.lecture).entrees) };
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
 * @param {Fabrique} doc @param {string} projet @param {Etat} etat @param {Entree} entree @param {() => void} reposer
 */
function poserLEntree(doc, projet, etat, entree, reposer) {
  const { id } = entree;
  const ligne = doc.createElement("li");
  ligne.className = "entree";
  const enRoute = etat.enRoute === id;
  const edition = etat.edition?.id === id ? etat.edition : undefined;
  /** @type {any[]} */
  const gestes = [];
  if (edition !== undefined) {
    const champ = doc.createElement("textarea");
    champ.className = "texte";
    champ.ariaLabel = `the text of the entry from #${entree.ticket}`;
    champ.dataset.cle = `${projet}#${id}`;
    champ.dataset.champ = CHAMP;
    // Le texte d'avant, en valeur par défaut ; ce qui est tapé, en valeur.
    champ.textContent = entree.text;
    champ.value = edition.texte;
    champ.readOnly = enRoute;
    champ.addEventListener("input", () => (edition.texte = champ.value));
    ligne.append(champ);
    // Le texte tel que le runtime l'écrit : sur une ligne (runtime/src/savoir-faire/savoir-faire.ts).
    const enregistrer = () => {
      const tape = champ.value;
      const ecrit = tape.replace(/\s+/g, " ").trim();
      void jouer(projet, etat, id, () => source.modifier(id, tape, projet), (entrees) => entrees.map((une) => (une.id === id ? { ...une, text: ecrit } : une)), reposer);
    };
    gestes.push(
      boutonAction(doc, enRoute ? ENREGISTREMENT : "save", enregistrer, { recommande: true }),
      boutonAction(doc, ANNULER, () => {
        delete etat.edition;
        delete etat.refus;
        reposer();
      }),
    );
  } else {
    ligne.append(texte(doc, "p", "texte", entree.text));
    if (etat.aRetirer === id) {
      ligne.append(texte(doc, "p", "confirmation", "Remove this entry? No cook will receive it any more."));
      const retirer = () => source.retirer(id, projet);
      gestes.push(
        boutonAction(doc, OUI("remove"), () => void jouer(projet, etat, id, retirer, (entrees) => entrees.filter((une) => une.id !== id), reposer), { sorte: "danger" }),
        boutonAction(doc, ANNULER, () => {
          delete etat.aRetirer;
          reposer();
        }),
      );
    } else {
      gestes.push(
        boutonAction(doc, "edit", () => {
          etat.edition = { id, texte: entree.text };
          delete etat.aRetirer;
          delete etat.refus;
          reposer();
        }),
        boutonAction(doc, "remove", () => {
          etat.aRetirer = id;
          delete etat.edition;
          delete etat.refus;
          reposer();
        }),
      );
    }
  }
  ligne.append(texte(doc, "span", "ticket", `from #${entree.ticket}`));
  const actions = doc.createElement("div");
  actions.className = "gestes";
  for (const geste of gestes) geste.children[0].disabled = enRoute;
  actions.append(...gestes);
  ligne.append(actions);
  if (etat.refus?.id === id) ligne.append(ligneErreur(doc, etat.refus.raison, etat.refus.detail, { classe: "refus", alerte: true }));
  return ligne;
}

/**
 * L'onglet Know-how du projet. Jamais lu pour ce projet : la lecture part, et l'onglet le dit en l'attendant.
 * @param {Fabrique} doc @param {string} projet @param {() => void} reposer
 */
export function poserLeSavoirFaire(doc, projet, reposer) {
  if (!etats.has(projet)) relireLeSavoirFaire(projet, reposer);
  const etat = /** @type {Etat} */ (etats.get(projet));
  const section = doc.createElement("section");
  section.className = "savoir-faire";
  section.ariaLabel = TITRE;
  section.append(texte(doc, "h2", "titre", TITRE), texte(doc, "p", "aide", AIDE));
  const { lecture } = etat;
  if (lecture === EN_COURS) section.append(texte(doc, "p", "lecture", LECTURE_DE("the know-how")));
  else if ("raison" in lecture) section.append(ligneErreur(doc, lecture.raison, lecture.detail), boutonAction(doc, REESSAYER, () => relireLeSavoirFaire(projet, reposer)));
  else if (lecture.entrees.length === 0) section.append(texte(doc, "p", "aucune", `${PAS_ENCORE("know-how")} The project has no entry.`));
  else {
    const liste = doc.createElement("ul");
    liste.className = "entrees";
    liste.append(...lecture.entrees.map((entree) => poserLEntree(doc, projet, etat, entree, reposer)));
    section.append(liste);
  }
  return section;
}
