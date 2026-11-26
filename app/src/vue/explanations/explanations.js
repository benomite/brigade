// @ts-check
// Les explications des mots de la cuisine (ticket 3308, épique 3304) : rail, pass, cook, second, TODO et WAITING sont
// l'identité du produit, mais un nouveau venu ne les connaît pas. La première fois que le chef rencontre l'un d'eux dans
// l'app, une ligne l'explique à côté de lui — le mot, puis sa ligne de docs/glossary.md, mot pour mot, et « got it ».
// Montrée, l'explication est vue : le registre du chef, gardé par le runtime du projet (`explanations`,
// runtime/src/explications/), le retient, et aucun de ses appareils ne la remontre. Elle reste à l'écran jusqu'à ce
// qu'il l'écarte, ou que l'app se recharge. Settings la remontre toutes : le registre est effacé.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js). Le service a ce contrat :
// `lire(projet)` rend `{ vus }` ou `{ sans, detail? }` — `undefined` quand le pont ne porte pas les explications (le
// téléphone) ; `marquer(projet, mot)` et `effacer(projet)` rendent `{ vus }` ou un refus d'une ligne.

import { survol } from "../briques.js";
import { button } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../composants/setting/setting.js";
import { NON_ATTEINT } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./explanations-box.ts").WordExplique} Word */
/** @typedef {import("./explanations-box.ts").ReadDesExplanations} Read */
/** @typedef {import("./explanations-box.ts").EcritureDesExplanations} Ecriture */
/** @typedef {{ lire(project: string): Promise<Read | undefined>, marquer(project: string, word: Word): Promise<Ecriture>, effacer(project: string): Promise<Ecriture> }} Service */
// Ce que l'app sait du registre d'un projet : les mots vus — `null` tant qu'il n'est pas lu, ou qu'il ne se lit pas :
// rien ne se montre alors, rien ne s'écrit —, ceux dont l'explication est à l'écran depuis cette ouverture de l'app, ce
// qui l'empêche de se lire, la dernière écriture refusée, et ce que le geste de Settings a rendu.
/** @typedef {{ vus: Set<Word> | null, montrees: Set<Word>, sans?: { ligne: string, detail: string }, refus?: { ligne: string, detail: string }, dit?: import("../composants/setting/setting.js").Dit }} Tenu */

/** @type {readonly Word[]} */
export const MOTS_EXPLIQUES = ["rail", "pass", "cook", "second", "TODO", "WAITING"];

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
export const WORD_A_L_SCREEN = { rail: "Rail", pass: "Pass", cook: "Cooks", second: "Second", TODO: "TODO", WAITING: "Parked" };

// Les colonnes du rail qui portent un mot : l'explication se pose sous leur titre. TODO n'est pas une colonne (ticket 3458) :
// la sienne se pose à côté de l'entrée « TODO (N) ». WAITING n'en est plus une (ticket 4238) : la sienne se pose sous le
// titre de la première colonne où une carte est parked.
/** @type {Readonly<Record<string, Word>>} */
export const WORD_DE_LA_COLONNE = { Pass: "pass" };

export const MOTS = {
  ecarter: "got it",
  nom: "Explanations of the kitchen's words",
  aide: "rail, pass, cook, second, TODO and WAITING are each explained once, next to the word, the first time you meet it — kept for you, on all your devices",
  remontrer: "show all the explanations again",
  enCours: "clearing what you have seen…",
  fait: "each explanation shows again the next time you meet its word, on all your devices",
  /** @param {number} nombre */
  vus: (nombre) => `${nombre} of ${MOTS_EXPLIQUES.length} seen`,
  indisponible: NON_ATTEINT("explanations"),
  rienEnvoye: "nothing was changed: no answer from the service",
  /** @param {string} line */
  nonGarde: (line) => `an explanation seen was not kept — ${line}`,
};

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));
/** @param {unknown} mots @returns {mots is Word[]} */
const sontDesMots = (mots) => Array.isArray(mots) && mots.every((word) => MOTS_EXPLIQUES.includes(word));

// Ce qu'une écriture a rendu, lu : les mots vus, ou un refus — toute autre réponse est un refus, jamais un registre deviné.
/** @param {unknown} rendu @returns {{ vus: Word[] } | { refus: string, detail: string }} */
function ecritureLue(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { vus, refus: refusal, detail } = /** @type {Record<string, any>} */ (rendu);
    if (sontDesMots(vus)) return { vus };
    if (typeof refusal === "string" && refusal.trim() !== "") return { refus: refusal.trim().split("\n")[0] ?? "", detail: typeof detail === "string" ? detail : "" };
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'explication d'un mot, à poser à côté de lui : le mot, sa ligne du glossaire, et « got it » qui l'écarte.
/** @param {Fabrique} doc @param {Word} word @param {() => void} ecarter */
export function poserExplanation(doc, word, ecarter) {
  const line = doc.createElement("p");
  line.className = "explication";
  line.dataset.mot = word;
  const nomme = doc.createElement("strong");
  nomme.className = "mot";
  nomme.textContent = WORD_A_L_SCREEN[word];
  const dit = doc.createElement("span");
  dit.className = "dit";
  dit.textContent = EXPLANATIONS[word];
  const action = button(doc, MOTS.ecarter, ecarter, { sorte: "discret" });
  action.ariaLabel = `${MOTS.ecarter}: ${WORD_A_L_SCREEN[word]}`;
  line.append(nomme, dit, action);
  return line;
}

// Ce que l'app tient des registres, projet par projet. `rendre(projet)` : ce qui est à l'écran pour ce projet change — une
// lecture, un mot écarté, le registre effacé.
/** @param {{ service: Service, rendre: (project: string) => void }} options */
export function holdLesExplanations({ service, rendre }) {
  /** @type {Map<string, Tenu>} */
  const projects = new Map();
  /** @param {string} project @returns {Tenu} */
  const tenu = (project) => {
    const deja = projects.get(project);
    if (deja !== undefined) return deja;
    /** @type {Tenu} */
    const neuf = { vus: null, montrees: new Set() };
    projects.set(project, neuf);
    return neuf;
  };
  return {
    // Lit le registre du chef, à chaque ouverture du projet : un autre de ses appareils a pu voir un mot, ou tout effacer.
    /** @param {string} project */
    async lire(project) {
      const ici = tenu(project);
      /** @type {Read | undefined} */
      let lu;
      try {
        lu = await service.lire(project);
      } catch (error) {
        lu = { sans: MOTS.indisponible, detail: message(error) };
      }
      if (lu !== undefined && "vus" in lu && sontDesMots(lu.vus)) {
        ici.vus = new Set(lu.vus);
        ici.sans = undefined;
      } else {
        ici.vus = null;
        ici.sans = lu === undefined ? undefined : { ligne: "sans" in lu && typeof lu.sans === "string" ? lu.sans : MOTS.indisponible, detail: "sans" in lu ? (lu.detail ?? "") : JSON.stringify(lu) };
      }
      rendre(project);
    },
    // Le mot est à l'écran : son explication se montre-t-elle ? Oui s'il est déjà montré depuis cette ouverture, et pas
    // écarté ; oui s'il n'est pas dans le registre lu — il y est alors marqué vu. Non sans registre lu.
    /** @param {string} project @param {Word} word */
    aMontrer(project, word) {
      const ici = projects.get(project);
      if (ici === undefined) return false;
      if (ici.montrees.has(word)) return true;
      if (ici.vus === null || ici.vus.has(word)) return false;
      ici.vus.add(word);
      ici.montrees.add(word);
      void service
        .marquer(project, word)
        .catch((error) => ({ refus: MOTS.rienEnvoye, detail: message(error) }))
        .then((rendu) => {
          const lu = ecritureLue(rendu);
          ici.refus = "refus" in lu ? { ligne: MOTS.nonGarde(lu.refus), detail: lu.detail } : undefined;
          if ("refus" in lu) rendre(project);
        });
      return true;
    },
    /** @param {string} project @param {Word} word */
    ecarter(project, word) {
      projects.get(project)?.montrees.delete(word);
      rendre(project);
    },
    // Settings : remontre toutes les explications — le registre du chef est effacé, pour tous ses appareils.
    /** @param {string} project */
    async effacer(project) {
      const ici = tenu(project);
      if (ici.dit !== undefined && "enCours" in ici.dit) return;
      ici.dit = { enCours: MOTS.enCours };
      rendre(project);
      /** @type {unknown} */
      let rendu;
      try {
        rendu = await service.effacer(project);
      } catch (error) {
        rendu = { refus: MOTS.rienEnvoye, detail: message(error) };
      }
      const lu = ecritureLue(rendu);
      if ("vus" in lu) {
        ici.vus = new Set(lu.vus);
        ici.montrees.clear();
        ici.sans = undefined;
        ici.refus = undefined;
        ici.dit = { fait: MOTS.fait };
      } else ici.dit = { refus: lu.refus, detail: lu.detail };
      rendre(project);
    },
    /** @param {string} project @returns {Tenu | undefined} */
    etat: (project) => projects.get(project),
  };
}

// La rangée de Settings : son nom, ce qui est vu — l'aide au survol —, et le geste qui remontre tout. Dessous, ce que le
// geste a rendu, ou la dernière écriture refusée. Sans registre lisible, la valeur dit pourquoi, et le geste est éteint.
/** @param {Fabrique} doc @param {{ etat: Tenu | undefined, remontrer: () => void }} options */
export function poserLaRangeeDesExplanations(doc, { etat: state, remontrer }) {
  const valeur = state?.vus != null ? [MOTS.vus(state.vus.size)] : state?.sans !== undefined ? [lineError(doc, state.sans.ligne, state.sans.detail, { balise: "span" })] : [MOTS.indisponible];
  const action = button(doc, MOTS.remontrer, remontrer);
  action.disabled = state?.vus == null || (state.dit !== undefined && "enCours" in state.dit);
  const dessous = state?.dit !== undefined ? ditDuSetting(doc, state.dit) : state?.refus !== undefined ? [lineError(doc, state.refus.ligne, state.refus.detail)] : [];
  const rangee = rangeeDeSetting(doc, { nom: MOTS.nom, valeur, controle: [action], depot: false, dessous, classe: "explications-du-chef" });
  rangee.children[0]?.append(survol(doc, MOTS.aide));
  return rangee;
}

// Le service tel que le pont le porte : sans ses gestes (le téléphone), rien ne se lit — aucune explication ne se montre.
/** @param {Partial<Pick<import("../pont.d.ts").Pont, "lireLesExplications" | "marquerUneExplication" | "remontrerLesExplications">>} pont @returns {Service} */
export function serviceDesExplanations(pont) {
  return {
    lire: async (project) => (typeof pont.lireLesExplications === "function" ? pont.lireLesExplications(project) : undefined),
    marquer: async (project, word) => (typeof pont.marquerUneExplication === "function" ? pont.marquerUneExplication(project, word) : { refus: MOTS.rienEnvoye }),
    effacer: async (project) => (typeof pont.remontrerLesExplications === "function" ? pont.remontrerLesExplications(project) : { refus: MOTS.rienEnvoye }),
  };
}
