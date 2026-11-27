// @ts-check
// La section « Engine » de la page d'une station (ticket 3746, épique 3518) : sur quoi ses cooks tournent — l'abonnement
// Claude, une clé d'API de Claude ou Codex —, la clé quand elle en demande une, et le moteur de secours, ou aucun. Chaque
// réglage est une rangée de réglage (components/setting, ticket 2920) avec la marque de son niveau (« this computer ») : il
// vit sur la machine, jamais dans le dépôt. Un contrôle s'applique dès qu'il change — pas de « Save » —, par le geste
// d'écriture des réglages de la station (settings-of-the-station.ts), puis la section se relit : ce qui est gardé est ce qui
// se montre à la réouverture. La clé se tape dans un champ masqué ; une fois gardée, elle ne revient jamais à l'écran : la
// rangée dit seulement qu'elle l'est. Sur une autre station (`lectureSeule`), la section dit en une ligne que cela se
// règle sur son ordinateur.
// La section ne touche ni `document` ni le pont : la coque (station/page/StationPage.js) lui donne une fabrique et
// `contexte.reglages`, qui lit et écrit.

import { hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { READING, NOT_REACHED } from "../lexicon.js";
import { levelOf } from "../levels.js";
import { apply, NOTHING_N_A_CHANGE } from "../station/page/apply.js";
import { A_KEY, isOneEngine, ENGINES, WORDS, nameOf, PAR_DEFAULT, fallbackPossible } from "./engines.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../components/setting/setting.js").Says} Says */
/** @typedef {{ refus: string, detail?: string }} Refusal */
/**
 * Ce que la station garde de son moteur : `engine` et `fallbackEngine` — absents, l'abonnement et aucun —, et si une clé
 * d'API est gardée (`apiKey`), jamais la clé elle-même.
 * @typedef {{ engine?: string, fallbackEngine?: string | null, apiKey?: boolean }} Read
 */
/** @typedef {{ engine?: string, fallbackEngine?: string | null, apiKey?: string }} Change */
/** @typedef {{ lire(): Promise<Read | Refusal>, ecrire?(change: Change): Promise<{ fait: string } | Refusal> }} Port */

const UNAVAILABLE = NOT_REACHED("its engine");
const WITHOUT_READ = "this app does not read it";
const OTHER_STATION = "not available for this station";
const ON_ITS_COMPUTER = "its engine is read and changed on its own computer";

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une liste de moteurs : chacun son nom, la valeur gardée choisie.
/** @param {Fabrique} doc @param {string} wording @param {{ cle: string, nom: string }[]} choice @param {string} chosen */
function list(doc, wording, choice, chosen) {
  const select = doc.createElement("select");
  select.ariaLabel = wording;
  select.append(
    ...choice.map(({ cle: key, nom: name }) => {
      const option = withIt(doc, "option", name);
      option.value = key;
      option.selected = key === chosen;
      return option;
    }),
  );
  select.value = chosen;
  return select;
}

/** @param {Fabrique} doc @param {{ station: { nom: string }, lectureSeule: boolean, reglages?: Port }} context */
export function setSection(doc, context) {
  const root = doc.createElement("div");
  root.className = "moteur-de-la-station";
  const port = context.lectureSeule ? undefined : context.reglages;
  // Ce que le dernier changement a rendu, sous son réglage — un seul parle à la fois.
  /** @type {Record<string, Says | undefined>} */
  let saidOnes = {};

  const read = async () => {
    /** @type {Read | Refusal} */
    const readOnes = context.lectureSeule
      ? { refus: OTHER_STATION, detail: ON_ITS_COMPUTER }
      : port === undefined
        ? { refus: UNAVAILABLE, detail: WITHOUT_READ }
        : await port.lire().catch((/** @type {unknown} */ e) => ({ refus: UNAVAILABLE, detail: e instanceof Error ? e.message : String(e) }));
    if ("refus" in readOnes) return root.replaceChildren(lineError(doc, readOnes.refus, readOnes.detail ?? ""));
    root.replaceChildren(...lines(readOnes));
  };

  /** @param {string} key @param {any} row @param {any[]} checks @param {Change} change */
  const write = async (key, row, checks, change) => {
    const said = await apply(doc, row, checks, () => port?.ecrire?.(change) ?? { refus: NOTHING_N_A_CHANGE, detail: "this app cannot write it" });
    saidOnes = { [key]: said };
    await read();
  };

  /** @param {Read} readOnes */
  function lines(readOnes) {
    const editable = port?.ecrire !== undefined;
    const engine = readOnes.engine ?? PAR_DEFAULT;
    const fallback = readOnes.fallbackEngine ?? null;
    const knownOne = isOneEngine(engine);

    // Le moteur : les trois, dans une liste. Choisir celui du secours le retire du secours, dans le même changement.
    const rowEngine = rowOfSetting(doc, {
      nom: WORDS.moteur,
      cle: "moteur",
      niveau: levelOf(doc, "moteur"),
      valeur: [withIt(doc, "strong", knownOne ? nameOf(engine) : WORDS.inconnu(engine)), hover(doc, WORDS.aideMoteur)],
      dessous: saysOfSetting(doc, saidOnes.moteur),
    });
    if (editable) {
      const choice = list(doc, "Choose the engine", knownOne ? [...ENGINES] : [{ cle: engine, nom: WORDS.inconnu(engine) }, ...ENGINES], engine);
      choice.addEventListener("change", () => {
        const wanted = String(choice.value);
        if (wanted !== engine) void write("moteur", rowEngine, [choice], wanted === fallback ? { engine: wanted, fallbackEngine: null } : { engine: wanted });
      });
      rowEngine.children[2].append(choice);
    }

    // La clé, quand le moteur ou son secours en demande une : un champ masqué, vidé après chaque envoi.
    const rows = [rowEngine];
    if (engine === A_KEY || fallback === A_KEY) {
      const keptOne = readOnes.apiKey === true;
      const rowKey = rowOfSetting(doc, {
        nom: WORDS.cle,
        cle: "cle-api",
        niveau: levelOf(doc, "moteur"),
        valeur: [withIt(doc, "span", keptOne ? `${WORDS.masque} ${WORDS.cleGardee}` : WORDS.cleAbsente, keptOne ? "cle-gardee" : "cle-absente"), hover(doc, WORDS.aideCle)],
        dessous: saysOfSetting(doc, saidOnes.cle),
      });
      if (editable) {
        const field = doc.createElement("input");
        field.type = "password";
        field.autocomplete = "off";
        field.spellcheck = false;
        field.value = "";
        field.placeholder = keptOne ? WORDS.remplacerLaCle : WORDS.saisirLaCle;
        field.ariaLabel = WORDS.cle;
        field.addEventListener("change", () => {
          const wanted = String(field.value).trim();
          field.value = "";
          if (wanted !== "") void write("cle", rowKey, [field], { apiKey: wanted });
        });
        rowKey.children[2].append(field);
      }
      rows.push(rowKey);
    }

    // Le secours : aucun, ou l'un des deux autres moteurs.
    const rowFallback = rowOfSetting(doc, {
      nom: WORDS.secours,
      cle: "secours",
      niveau: levelOf(doc, "moteur"),
      valeur: [withIt(doc, "strong", fallback === null ? WORDS.aucun : nameOf(fallback)), hover(doc, WORDS.aideSecours)],
      dessous: saysOfSetting(doc, saidOnes.secours),
    });
    if (editable) {
      const choice = list(doc, "Choose the fallback engine", [{ cle: "", nom: WORDS.aucun }, ...fallbackPossible(engine)], fallback ?? "");
      choice.addEventListener("change", () => {
        const wanted = String(choice.value) === "" ? null : String(choice.value);
        if (wanted !== fallback) void write("secours", rowFallback, [choice], { fallbackEngine: wanted });
      });
      rowFallback.children[2].append(choice);
    }
    rows.push(rowFallback);
    return rows;
  }

  root.append(withIt(doc, "p", READING, "dit"));
  return read().then(() => root);
}
