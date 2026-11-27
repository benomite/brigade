// @ts-check
// Les explications des mots de la cuisine (ticket 3308, épique 3304) : rail, pass, cook, second, TODO et WAITING sont
// l'identité du produit, mais un nouveau venu ne les connaît pas. La première fois que le chef rencontre l'un d'eux dans
// l'app, une ligne l'explique à côté de lui — le mot, puis sa ligne de docs/glossary.md, mot pour mot, et « got it ».
// Montrée, l'explication est vue : le registre du chef, gardé par le runtime du projet (`explanations`,
// runtime/src/explications/), le retient, et aucun de ses appareils ne la remontre. Elle reste à l'écran jusqu'à ce
// qu'il l'écarte, ou que l'app se recharge. Settings la remontre toutes : le registre est effacé.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js). Le service a ce contrat :
// `lire(projet)` rend `{ vus }` ou `{ sans, detail? }` — `undefined` quand le pont ne porte pas les explications (le
// téléphone) ; `marquer(projet, mot)` et `effacer(projet)` rendent `{ vus }` ou un refus d'une ligne.

import { hover } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { NOT_REACHED } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./explanations-box.ts").WordExplained} Word */
/** @typedef {import("./explanations-box.ts").ReadOfExplanations} Reading */
/** @typedef {import("./explanations-box.ts").WritingOfExplanations} Writing */
/** @typedef {{ lire(project: string): Promise<Reading | undefined>, marquer(project: string, word: Word): Promise<Writing>, effacer(project: string): Promise<Writing> }} Service */
// Ce que l'app sait du registre d'un projet : les mots vus — `null` tant qu'il n'est pas lu, ou qu'il ne se lit pas :
// rien ne se montre alors, rien ne s'écrit —, ceux dont l'explication est à l'écran depuis cette ouverture de l'app, ce
// qui l'empêche de se lire, la dernière écriture refusée, et ce que le geste de Settings a rendu.
/** @typedef {{ vus: Set<Word> | null, montrees: Set<Word>, sans?: { ligne: string, detail: string }, refus?: { ligne: string, detail: string }, dit?: import("../components/setting/setting.js").Says }} Held */

/** @type {readonly Word[]} */
export const WORDS_EXPLAINED = ["rail", "pass", "cook", "second", "TODO", "WAITING"];

// La ligne de chaque mot, telle que docs/glossary.md la dit (test/explications/ le compare) : celle de son entrée, ou la
// première phrase de son entrée quand elle en a plusieurs (cook, TODO).
/** @type {Readonly<Record<Word, string>>} */
export const EXPLANATIONS = {
  // §3, la commande `rail`.
  rail: "The ticket rail",
  // §2, `en pass` / `Pass`.
  pass: "The ticket is being judged",
  // §1, `cuisiner` / `cuisiné par` : la première phrase.
  cook: "A station takes a ticket and runs a cook on it.",
  // §2, `second`.
  second: "Your product assistant, who helps you write the tickets",
  // §2, `attend` — ce qui attend le chef, ses cartes rouges et l'entrée « TODO (N) » (ticket 3458) : la première phrase.
  TODO: "What waits for the chef's decision.",
  // §2, `WAITING`.
  WAITING: "Waiting for a third party, not for you; the kitchen does not take it",
};

// Le mot tel que l'écran le montre, en tête de son explication.
/** @type {Readonly<Record<Word, string>>} */
export const WORD_AT_THE_SCREEN = { rail: "Rail", pass: "Pass", cook: "Cooks", second: "Second", TODO: "TODO", WAITING: "Parked" };

// Les colonnes du rail qui portent un mot : l'explication se pose sous leur titre. TODO n'est pas une colonne (ticket 3458) :
// la sienne se pose à côté de l'entrée « TODO (N) ». WAITING n'en est plus une (ticket 4238) : la sienne se pose sous le
// titre de la première colonne où une carte est parked.
/** @type {Readonly<Record<string, Word>>} */
export const WORD_OF_THE_COLUMN = { Pass: "pass" };

export const WORDS = {
  ecarter: "got it",
  nom: "Explanations of the kitchen's words",
  aide: "rail, pass, cook, second, TODO and WAITING are each explained once, next to the word, the first time you meet it — kept for you, on all your devices",
  remontrer: "show all the explanations again",
  enCours: "clearing what you have seen…",
  fait: "each explanation shows again the next time you meet its word, on all your devices",
  /** @param {number} count */
  vus: (count) => `${count} of ${WORDS_EXPLAINED.length} seen`,
  indisponible: NOT_REACHED("explanations"),
  rienEnvoye: "nothing was changed: no answer from the service",
  /** @param {string} line */
  nonGarde: (line) => `an explanation seen was not kept — ${line}`,
};

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));
/** @param {unknown} words @returns {mots is Word[]} */
const areOfWords = (words) => Array.isArray(words) && words.every((word) => WORDS_EXPLAINED.includes(word));

// Ce qu'une écriture a rendu, lu : les mots vus, ou un refus — toute autre réponse est un refus, jamais un registre deviné.
/** @param {unknown} rendered @returns {{ vus: Word[] } | { refus: string, detail: string }} */
function writingRead(rendered) {
  if (typeof rendered === "object" && rendered !== null) {
    const { vus: seenOnes, refus: refusal, detail } = /** @type {Record<string, any>} */ (rendered);
    if (areOfWords(seenOnes)) return { vus: seenOnes };
    if (typeof refusal === "string" && refusal.trim() !== "") return { refus: refusal.trim().split("\n")[0] ?? "", detail: typeof detail === "string" ? detail : "" };
  }
  return { refus: WORDS.rienEnvoye, detail: rendered === undefined ? "" : JSON.stringify(rendered) };
}

// L'explication d'un mot, à poser à côté de lui : le mot, sa ligne du glossaire, et « got it » qui l'écarte.
/** @param {Fabrique} doc @param {Word} word @param {() => void} setAside */
export function setExplanation(doc, word, setAside) {
  const line = doc.createElement("p");
  line.className = "explication";
  line.dataset.mot = word;
  const named = doc.createElement("strong");
  named.className = "mot";
  named.textContent = WORD_AT_THE_SCREEN[word];
  const said = doc.createElement("span");
  said.className = "dit";
  said.textContent = EXPLANATIONS[word];
  const action = button(doc, WORDS.ecarter, setAside, { sorte: "discret" });
  action.ariaLabel = `${WORDS.ecarter}: ${WORD_AT_THE_SCREEN[word]}`;
  line.append(named, said, action);
  return line;
}

// Ce que l'app tient des registres, projet par projet. `rendre(projet)` : ce qui est à l'écran pour ce projet change — une
// lecture, un mot écarté, le registre effacé.
/** @param {{ service: Service, rendre: (project: string) => void }} options */
export function holdTheExplanations({ service, rendre: render }) {
  /** @type {Map<string, Held>} */
  const projects = new Map();
  /** @param {string} project @returns {Held} */
  const held = (project) => {
    const already = projects.get(project);
    if (already !== undefined) return already;
    /** @type {Held} */
    const fresh = { vus: null, montrees: new Set() };
    projects.set(project, fresh);
    return fresh;
  };
  return {
    // Lit le registre du chef, à chaque ouverture du projet : un autre de ses appareils a pu voir un mot, ou tout effacer.
    /** @param {string} project */
    async lire(project) {
      const here = held(project);
      /** @type {Reading | undefined} */
      let readOne;
      try {
        readOne = await service.lire(project);
      } catch (error) {
        readOne = { sans: WORDS.indisponible, detail: message(error) };
      }
      if (readOne !== undefined && "vus" in readOne && areOfWords(readOne.vus)) {
        here.vus = new Set(readOne.vus);
        here.sans = undefined;
      } else {
        here.vus = null;
        here.sans = readOne === undefined ? undefined : { ligne: "sans" in readOne && typeof readOne.sans === "string" ? readOne.sans : WORDS.indisponible, detail: "sans" in readOne ? (readOne.detail ?? "") : JSON.stringify(readOne) };
      }
      render(project);
    },
    // Le mot est à l'écran : son explication se montre-t-elle ? Oui s'il est déjà montré depuis cette ouverture, et pas
    // écarté ; oui s'il n'est pas dans le registre lu — il y est alors marqué vu. Non sans registre lu.
    /** @param {string} project @param {Word} word */
    aMontrer(project, word) {
      const here = projects.get(project);
      if (here === undefined) return false;
      if (here.montrees.has(word)) return true;
      if (here.vus === null || here.vus.has(word)) return false;
      here.vus.add(word);
      here.montrees.add(word);
      void service
        .marquer(project, word)
        .catch((error) => ({ refus: WORDS.rienEnvoye, detail: message(error) }))
        .then((rendered) => {
          const readOne = writingRead(rendered);
          here.refus = "refus" in readOne ? { ligne: WORDS.nonGarde(readOne.refus), detail: readOne.detail } : undefined;
          if ("refus" in readOne) render(project);
        });
      return true;
    },
    /** @param {string} project @param {Word} word */
    ecarter(project, word) {
      projects.get(project)?.montrees.delete(word);
      render(project);
    },
    // Settings : remontre toutes les explications — le registre du chef est effacé, pour tous ses appareils.
    /** @param {string} project */
    async effacer(project) {
      const here = held(project);
      if (here.dit !== undefined && "enCours" in here.dit) return;
      here.dit = { enCours: WORDS.enCours };
      render(project);
      /** @type {unknown} */
      let rendered;
      try {
        rendered = await service.effacer(project);
      } catch (error) {
        rendered = { refus: WORDS.rienEnvoye, detail: message(error) };
      }
      const readOne = writingRead(rendered);
      if ("vus" in readOne) {
        here.vus = new Set(readOne.vus);
        here.montrees.clear();
        here.sans = undefined;
        here.refus = undefined;
        here.dit = { fait: WORDS.fait };
      } else here.dit = { refus: readOne.refus, detail: readOne.detail };
      render(project);
    },
    /** @param {string} project @returns {Held | undefined} */
    etat: (project) => projects.get(project),
  };
}

// La rangée de Settings : son nom, ce qui est vu — l'aide au survol —, et le geste qui remontre tout. Dessous, ce que le
// geste a rendu, ou la dernière écriture refusée. Sans registre lisible, la valeur dit pourquoi, et le geste est éteint.
/** @param {Fabrique} doc @param {{ etat: Held | undefined, remontrer: () => void }} options */
export function setTheRowOfExplanations(doc, { etat: state, remontrer: showAgain }) {
  const value = state?.vus != null ? [WORDS.vus(state.vus.size)] : state?.sans !== undefined ? [lineError(doc, state.sans.ligne, state.sans.detail, { balise: "span" })] : [WORDS.indisponible];
  const action = button(doc, WORDS.remontrer, showAgain);
  action.disabled = state?.vus == null || (state.dit !== undefined && "enCours" in state.dit);
  const below = state?.dit !== undefined ? saysOfSetting(doc, state.dit) : state?.refus !== undefined ? [lineError(doc, state.refus.ligne, state.refus.detail)] : [];
  const row = rowOfSetting(doc, { nom: WORDS.nom, valeur: value, controle: [action], depot: false, dessous: below, classe: "explications-du-chef" });
  row.children[0]?.append(hover(doc, WORDS.aide));
  return row;
}

// Le service tel que le pont le porte : sans ses gestes (le téléphone), rien ne se lit — aucune explication ne se montre.
/** @param {Partial<Pick<import("../bridge.d.ts").Bridge, "lireLesExplications" | "marquerUneExplication" | "remontrerLesExplications">>} bridge @returns {Service} */
export function serviceOfExplanations(bridge) {
  return {
    lire: async (project) => (typeof bridge.lireLesExplications === "function" ? bridge.lireLesExplications(project) : undefined),
    marquer: async (project, word) => (typeof bridge.marquerUneExplication === "function" ? bridge.marquerUneExplication(project, word) : { refus: WORDS.rienEnvoye }),
    effacer: async (project) => (typeof bridge.remontrerLesExplications === "function" ? bridge.remontrerLesExplications(project) : { refus: WORDS.rienEnvoye }),
  };
}
