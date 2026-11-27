// @ts-check
// La section « capacités et cooks » de la page d'une station (ticket 2645, épique 2497) : ce que la machine sait faire,
// le plafond de cooks que la station partage entre ses projets, et les projets qu'elle sert avec la part de cooks
// qu'elle donne à chacun. Tout cela vit sur la machine, jamais dans le dépôt (aucune PR) : chaque réglage est une rangée
// de réglage (components/setting, ticket 2920) avec la marque de son niveau (`contexte.niveau`, que la coque pose).
// - Cet ordinateur : une capacité se déclare d'ici, le plafond se change d'ici — d'un champ qui s'applique dès qu'il
//   change, sans « Save » ; le temps qu'il court, la rangée dit « applying… », puis son refus s'il y en a un.
// - Une autre station : la section se montre sans se régler (`contexte.lectureSeule`) — jamais de champ ni de bouton.
// - Les projets servis ne se règlent pas ici : seule leur part de cooks paraît, aucun autre réglage du projet.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

import { rowOfSetting } from "../../../components/setting/setting.js";
import { apply, tell, NOTHING_N_A_CHANGE } from "../apply.js";
import { THIS_COMPUTER } from "../../../lexicon.js";

/** @typedef {import("../../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../apply.js").Rendered} Rendered */
/**
 * Ce que la coque lit de la station : ses capacités détectées et déclarées ; son plafond de cooks ; ses projets servis,
 * chacun avec sa part de cooks en pour cent ; et les gestes de cet ordinateur — absents ailleurs —, qui rendent ce
 * qu'ils ont fait, leur refus (`{ refus, detail }`), ou rien.
 * @typedef {{
 *   capacites?: { detectees?: string[], declarees?: string[], declarer?: (name: string) => Rendered | Promise<Rendered> },
 *   plafond?: { valeur?: number, regler?: (value: number) => Rendered | Promise<Rendered> },
 *   projets?: { nom: string, part: number }[],
 * }} CapacitiesAndCooks
 */

export const UNKNOWN = "unknown";
export const A_DECLARE = "declare a capability";
export const CAP_WHOLE = "the cook cap is a whole number above zero";
export const NO = "none";
export const HOVER_OF_THE_DECLARATION = `Tells the project ${THIS_COMPUTER} can do it; the station does not check.`;

/** @param {Fabrique} doc @param {any} context */
export function setSection(doc, context) {
  /** @type {CapacitiesAndCooks} */
  const data = context.capacitesEtCooks ?? {};
  const root = doc.createElement("div");
  root.className = "capacites-et-cuisiniers";
  root.append(capacities(doc, context, data.capacites ?? {}), cap(doc, context, data.plafond ?? {}), projects(doc, context, data.projets ?? []));
  return root;
}

/** @param {Fabrique} doc @param {string} classe @param {string} text */
function text(doc, classe, text) {
  const span = doc.createElement("span");
  span.className = classe;
  span.textContent = text;
  return span;
}

// Le champ d'un réglage : il s'applique dès qu'il change (`change`), par le geste de la coque, sans bouton ; la rangée le
// dit pendant qu'il court, puis dit ce qu'il a rendu. `voulu` lit ce qui est saisi : rien quand il n'y a rien à changer,
// un refus quand ce qui est saisi ne se règle pas.
/**
 * @param {Fabrique} doc @param {any} row
 * @param {{ nom: string, type: string, valeur: string, placeholder?: string, voulu: (typed: string) => { refus: string, detail?: string } | { appliquer: () => Rendered | Promise<Rendered> } | undefined }} champ
 */
function field(doc, row, { nom: name, type, valeur: value, placeholder = "", voulu: wanted }) {
  const entry = doc.createElement("input");
  entry.type = type;
  entry.value = value;
  entry.placeholder = placeholder;
  entry.ariaLabel = name;
  entry.addEventListener("change", () => {
    const readOne = wanted(String(entry.value));
    if (readOne === undefined) return tell(doc, row, undefined);
    if ("refus" in readOne) return tell(doc, row, readOne);
    void apply(doc, row, [entry], readOne.appliquer);
  });
  row.children[2].append(entry);
  return entry;
}

/** @param {Fabrique} doc @param {any} context @param {NonNullable<CapacitiesAndCooks["capacites"]>} capacites */
function capacities(doc, context, { detectees: detected = [], declarees: declaredEntries = [], declarer: declareIt }) {
  const saidEntries = [...detected.map((name) => ({ nom: name, origine: "detected" })), ...declaredEntries.filter((name) => !detected.includes(name)).map((name) => ({ nom: name, origine: "declared" }))];
  const value = saidEntries.length === 0 ? [text(doc, "capacite", NO)] : [];
  for (const { nom: name, origine: origin } of saidEntries) {
    const capacity = text(doc, "capacite", `${name} (${origin})`);
    capacity.dataset.origine = origin;
    value.push(capacity);
  }
  const root = rowOfSetting(doc, { nom: "capabilities", cle: "capabilities", niveau: context.niveau("capacites"), valeur: value });
  if (!context.lectureSeule && declareIt !== undefined) {
    const declare = declareIt;
    field(doc, root, {
      nom: "capability to declare",
      type: "text",
      valeur: "",
      placeholder: A_DECLARE,
      voulu(typed) {
        const name = typed.trim();
        if (name === "" || detected.includes(name) || declaredEntries.includes(name)) return undefined;
        return { appliquer: () => declare(name) };
      },
    });
  }
  return root;
}

/** @param {Fabrique} doc @param {any} context @param {NonNullable<CapacitiesAndCooks["plafond"]>} plafond */
function cap(doc, context, { valeur: value, regler: set }) {
  const knownOne = typeof value === "number" && Number.isInteger(value) && value > 0;
  const root = rowOfSetting(doc, { nom: "cook cap", cle: "cook cap", niveau: context.niveau("cooks"), valeur: [knownOne ? String(value) : UNKNOWN] });
  if (!context.lectureSeule && set !== undefined) {
    const change = set;
    field(doc, root, {
      nom: "overall cook cap",
      type: "number",
      valeur: knownOne ? String(value) : "",
      voulu(typed) {
        const wanted = Number(typed);
        if (typed.trim() === "" || wanted === value) return undefined;
        if (!Number.isInteger(wanted) || wanted <= 0) return { refus: NOTHING_N_A_CHANGE, detail: CAP_WHOLE };
        return { appliquer: () => change(wanted) };
      },
    });
  }
  return root;
}

// Les projets servis : leur nom et la part de cooks de la station qu'ils reçoivent — rien d'autre du projet, rien à régler.
/** @param {Fabrique} doc @param {any} context @param {NonNullable<CapacitiesAndCooks["projets"]>} projects */
function projects(doc, context, projects) {
  const root = doc.createElement("div");
  root.className = "projets-servis";
  if (projects.length === 0) root.append(text(doc, "valeur", NO));
  for (const { nom: name, part } of projects) {
    const line = rowOfSetting(doc, { nom: name, cle: "part-de-cooks", niveau: context.niveau("station-part-de-cooks"), valeur: [Number.isFinite(part) ? `${part}% of cooks` : UNKNOWN] });
    line.dataset.projet = name;
    root.append(line);
  }
  return root;
}
