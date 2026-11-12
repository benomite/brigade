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
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ditDuReglage, rangeeDeReglage } from "../composants/reglage/reglage.js";
import { NON_ATTEINT } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./explications-box.ts").MotExplique} Mot */
/** @typedef {import("./explications-box.ts").LectureDesExplications} Lecture */
/** @typedef {import("./explications-box.ts").EcritureDesExplications} Ecriture */
/** @typedef {{ lire(projet: string): Promise<Lecture | undefined>, marquer(projet: string, mot: Mot): Promise<Ecriture>, effacer(projet: string): Promise<Ecriture> }} Service */
// Ce que l'app sait du registre d'un projet : les mots vus — `null` tant qu'il n'est pas lu, ou qu'il ne se lit pas :
// rien ne se montre alors, rien ne s'écrit —, ceux dont l'explication est à l'écran depuis cette ouverture de l'app, ce
// qui l'empêche de se lire, la dernière écriture refusée, et ce que le geste de Settings a rendu.
/** @typedef {{ vus: Set<Mot> | null, montrees: Set<Mot>, sans?: { ligne: string, detail: string }, refus?: { ligne: string, detail: string }, dit?: import("../composants/reglage/reglage.js").Dit }} Tenu */

/** @type {readonly Mot[]} */
export const MOTS_EXPLIQUES = ["rail", "pass", "cook", "second", "TODO", "WAITING"];

// La ligne de chaque mot, telle que docs/glossary.md la dit (test/explications/ le compare) : celle de son entrée, ou la
// première phrase de son entrée quand elle en a plusieurs (cook, TODO).
/** @type {Readonly<Record<Mot, string>>} */
export const EXPLICATIONS = {
  // §3, la commande `rail`.
  rail: "The ticket rail",
  // §2, `en pass` / `Pass`.
  pass: "The ticket is being judged",
  // §1, `cuisiner` / `cuisiné par` : la première phrase.
  cook: "A station takes a ticket and runs a cook on it.",
  // §2, `second`.
  second: "Your product assistant, who helps you write the tickets",
  // §2, `attend` — ce qui attend le chef, sa colonne `Awaiting you` : la première phrase.
  TODO: "What waits for the chef's decision.",
  // §2, `WAITING`.
  WAITING: "Waiting for a third party, not for you; the kitchen does not take it",
};

// Le mot tel que l'écran le montre, en tête de son explication.
/** @type {Readonly<Record<Mot, string>>} */
export const MOT_A_L_ECRAN = { rail: "Rail", pass: "Pass", cook: "Cooks", second: "Second", TODO: "Awaiting you", WAITING: "Waiting" };

// Les colonnes du rail qui portent un mot : l'explication se pose sous leur titre.
/** @type {Readonly<Record<string, Mot>>} */
export const MOT_DE_LA_COLONNE = { Pass: "pass", "Awaiting you": "TODO", Waiting: "WAITING" };

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
  /** @param {string} ligne */
  nonGarde: (ligne) => `an explanation seen was not kept — ${ligne}`,
};

/** @param {unknown} erreur */
const message = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));
/** @param {unknown} mots @returns {mots is Mot[]} */
const sontDesMots = (mots) => Array.isArray(mots) && mots.every((mot) => MOTS_EXPLIQUES.includes(mot));

// Ce qu'une écriture a rendu, lu : les mots vus, ou un refus — toute autre réponse est un refus, jamais un registre deviné.
/** @param {unknown} rendu @returns {{ vus: Mot[] } | { refus: string, detail: string }} */
function ecritureLue(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { vus, refus, detail } = /** @type {Record<string, any>} */ (rendu);
    if (sontDesMots(vus)) return { vus };
    if (typeof refus === "string" && refus.trim() !== "") return { refus: refus.trim().split("\n")[0] ?? "", detail: typeof detail === "string" ? detail : "" };
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'explication d'un mot, à poser à côté de lui : le mot, sa ligne du glossaire, et « got it » qui l'écarte.
/** @param {Fabrique} doc @param {Mot} mot @param {() => void} ecarter */
export function poserExplication(doc, mot, ecarter) {
  const ligne = doc.createElement("p");
  ligne.className = "explication";
  ligne.dataset.mot = mot;
  const nomme = doc.createElement("strong");
  nomme.className = "mot";
  nomme.textContent = MOT_A_L_ECRAN[mot];
  const dit = doc.createElement("span");
  dit.className = "dit";
  dit.textContent = EXPLICATIONS[mot];
  const geste = bouton(doc, MOTS.ecarter, ecarter, { sorte: "discret" });
  geste.ariaLabel = `${MOTS.ecarter}: ${MOT_A_L_ECRAN[mot]}`;
  ligne.append(nomme, dit, geste);
  return ligne;
}

// Ce que l'app tient des registres, projet par projet. `rendre(projet)` : ce qui est à l'écran pour ce projet change — une
// lecture, un mot écarté, le registre effacé.
/** @param {{ service: Service, rendre: (projet: string) => void }} options */
export function tenirLesExplications({ service, rendre }) {
  /** @type {Map<string, Tenu>} */
  const projets = new Map();
  /** @param {string} projet @returns {Tenu} */
  const tenu = (projet) => {
    const deja = projets.get(projet);
    if (deja !== undefined) return deja;
    /** @type {Tenu} */
    const neuf = { vus: null, montrees: new Set() };
    projets.set(projet, neuf);
    return neuf;
  };
  return {
    // Lit le registre du chef, à chaque ouverture du projet : un autre de ses appareils a pu voir un mot, ou tout effacer.
    /** @param {string} projet */
    async lire(projet) {
      const ici = tenu(projet);
      /** @type {Lecture | undefined} */
      let lu;
      try {
        lu = await service.lire(projet);
      } catch (erreur) {
        lu = { sans: MOTS.indisponible, detail: message(erreur) };
      }
      if (lu !== undefined && "vus" in lu && sontDesMots(lu.vus)) {
        ici.vus = new Set(lu.vus);
        ici.sans = undefined;
      } else {
        ici.vus = null;
        ici.sans = lu === undefined ? undefined : { ligne: "sans" in lu && typeof lu.sans === "string" ? lu.sans : MOTS.indisponible, detail: "sans" in lu ? (lu.detail ?? "") : JSON.stringify(lu) };
      }
      rendre(projet);
    },
    // Le mot est à l'écran : son explication se montre-t-elle ? Oui s'il est déjà montré depuis cette ouverture, et pas
    // écarté ; oui s'il n'est pas dans le registre lu — il y est alors marqué vu. Non sans registre lu.
    /** @param {string} projet @param {Mot} mot */
    aMontrer(projet, mot) {
      const ici = projets.get(projet);
      if (ici === undefined) return false;
      if (ici.montrees.has(mot)) return true;
      if (ici.vus === null || ici.vus.has(mot)) return false;
      ici.vus.add(mot);
      ici.montrees.add(mot);
      void service
        .marquer(projet, mot)
        .catch((erreur) => ({ refus: MOTS.rienEnvoye, detail: message(erreur) }))
        .then((rendu) => {
          const lu = ecritureLue(rendu);
          ici.refus = "refus" in lu ? { ligne: MOTS.nonGarde(lu.refus), detail: lu.detail } : undefined;
          if ("refus" in lu) rendre(projet);
        });
      return true;
    },
    /** @param {string} projet @param {Mot} mot */
    ecarter(projet, mot) {
      projets.get(projet)?.montrees.delete(mot);
      rendre(projet);
    },
    // Settings : remontre toutes les explications — le registre du chef est effacé, pour tous ses appareils.
    /** @param {string} projet */
    async effacer(projet) {
      const ici = tenu(projet);
      if (ici.dit !== undefined && "enCours" in ici.dit) return;
      ici.dit = { enCours: MOTS.enCours };
      rendre(projet);
      /** @type {unknown} */
      let rendu;
      try {
        rendu = await service.effacer(projet);
      } catch (erreur) {
        rendu = { refus: MOTS.rienEnvoye, detail: message(erreur) };
      }
      const lu = ecritureLue(rendu);
      if ("vus" in lu) {
        ici.vus = new Set(lu.vus);
        ici.montrees.clear();
        ici.sans = undefined;
        ici.refus = undefined;
        ici.dit = { fait: MOTS.fait };
      } else ici.dit = { refus: lu.refus, detail: lu.detail };
      rendre(projet);
    },
    /** @param {string} projet @returns {Tenu | undefined} */
    etat: (projet) => projets.get(projet),
  };
}

// La rangée de Settings : son nom, ce qui est vu — l'aide au survol —, et le geste qui remontre tout. Dessous, ce que le
// geste a rendu, ou la dernière écriture refusée. Sans registre lisible, la valeur dit pourquoi, et le geste est éteint.
/** @param {Fabrique} doc @param {{ etat: Tenu | undefined, remontrer: () => void }} options */
export function poserLaRangeeDesExplications(doc, { etat, remontrer }) {
  const valeur = etat?.vus != null ? [MOTS.vus(etat.vus.size)] : etat?.sans !== undefined ? [ligneErreur(doc, etat.sans.ligne, etat.sans.detail, { balise: "span" })] : [MOTS.indisponible];
  const geste = bouton(doc, MOTS.remontrer, remontrer);
  geste.disabled = etat?.vus == null || (etat.dit !== undefined && "enCours" in etat.dit);
  const dessous = etat?.dit !== undefined ? ditDuReglage(doc, etat.dit) : etat?.refus !== undefined ? [ligneErreur(doc, etat.refus.ligne, etat.refus.detail)] : [];
  const rangee = rangeeDeReglage(doc, { nom: MOTS.nom, valeur, controle: [geste], depot: false, dessous, classe: "explications-du-chef" });
  rangee.children[0]?.append(survol(doc, MOTS.aide));
  return rangee;
}

// Le service tel que le pont le porte : sans ses gestes (le téléphone), rien ne se lit — aucune explication ne se montre.
/** @param {Partial<Pick<import("../pont.d.ts").Pont, "lireLesExplications" | "marquerUneExplication" | "remontrerLesExplications">>} pont @returns {Service} */
export function serviceDesExplications(pont) {
  return {
    lire: async (projet) => (typeof pont.lireLesExplications === "function" ? pont.lireLesExplications(projet) : undefined),
    marquer: async (projet, mot) => (typeof pont.marquerUneExplication === "function" ? pont.marquerUneExplication(projet, mot) : { refus: MOTS.rienEnvoye }),
    effacer: async (projet) => (typeof pont.remontrerLesExplications === "function" ? pont.remontrerLesExplications(projet) : { refus: MOTS.rienEnvoye }),
  };
}
