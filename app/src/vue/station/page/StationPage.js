// @ts-check
// La page d'une station (ticket 2641, épique 2497) : la coque qui pose ses sections, dans cet ordre — son identité, ses
// connexions, ses dossiers et son bac à sable, ses capacités, ses cooks, son moteur —, chacune sous son titre. vue.js la monte sur
// la page d'une station, à son ouverture. Chaque section est un module de `sections/`, nommé dans SECTIONS, qui exporte
// `setSection(doc, contexte)` et rend un élément (ou sa promesse). Une section n'est chargée que lorsque son fichier
// est déclaré dans LIVREES : tant qu'il ne l'est pas, la coque pose son titre et une ligne qui dit qu'elle n'est pas
// encore là, sans demander de fichier absent. Une section livrée qui ne se charge pas, ou qui lève en se posant, dit en
// une ligne qu'elle est indisponible, son détail au survol ; les autres sections se posent quand même.
// La coque lit si la page est celle de cet ordinateur : pour une autre station, elle passe `lectureSeule` aux sections,
// qui montrent alors ce qui ne se règle que sur la machine elle-même sans offrir de le changer.
// Aucun réglage du projet n'y paraît (ils sont sur l'onglet Stations du projet, ticket 2484) : `contexte.niveau(cle)`
// refuse une clé de niveau « project ». Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { lineError } from "../../components/line-error/line-error.js";
import { LEVELS } from "../../levels.js";
import { levelSetting } from "./SettingLevel.js";
import { NOT_REACHED } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/**
 * La station dont la page est ouverte : son id, celui que l'app compare à la station de ce poste, et son nom.
 * @typedef {{ id: string, nom: string }} StationOpen
 */
/**
 * Ce que chaque section reçoit : la station, si elle est celle de cet ordinateur, si elle se montre sans se régler, et
 * la marque du niveau d'un réglage, par sa clé de niveaux.js.
 * @typedef {{ station: StationOpen, ici: boolean, lectureSeule: boolean, niveau(key: string): any, reglages?: Port, connexions?: import("./sections/connections.js").Connections }} Context
 */
/** @typedef {import("./sections/folders-and-sandbox.js").Port} Port */
/** @typedef {{ setSection(doc: Fabrique, context: Context): any }} Section */
/** @typedef {(file: string) => Promise<Partial<Section>> | undefined} Load */

// Les sections, dans leur ordre sur la page : leur fichier sous `sections/` et leur titre.
export const SECTIONS = /** @type {const} */ ([
  { fichier: "identite", titre: "Identity" },
  { fichier: "connexions", titre: "Connections" },
  { fichier: "dossiers-et-bac-a-sable", titre: "Folders and sandbox" },
  { fichier: "capacites", titre: "Capabilities" },
  { fichier: "cooks", titre: "Cooks" },
  { fichier: "moteur", titre: "Engine" },
]);

// Les sections dont le fichier est livré sous `sections/` : le ticket qui livre une section y ajoute son nom.
/** @type {ReadonlySet<string>} */
export const DELIVERED = new Set(["dossiers-et-bac-a-sable", "connexions", "moteur"]);
// Une section dont le module n'est pas `sections/<son nom>.js` : son module, par son nom (le moteur, ticket 3746, sous
// `engine/` ; les fichiers renommés en anglais par le ticket 4413, dont le nom de section reste celui de la page).
/** @type {Readonly<Record<string, string>>} */
const ELSEWHERE = {
  moteur: "../../engine/EngineSection.js",
  "dossiers-et-bac-a-sable": "./sections/folders-and-sandbox.js",
  connexions: "./sections/connections.js",
};

export const NOT_STILL = "not shown yet";
export const UNAVAILABLE = NOT_REACHED("this section");

// La page est celle de cet ordinateur quand la station ouverte est la station locale que l'app connaît.
/** @param {StationOpen} station @param {string | null | undefined} locale */
export function isThisComputer(station, locale) {
  return typeof locale === "string" && locale !== "" && station.id === locale;
}

/** @type {Load} */
const sinceSections = (file) => (DELIVERED.has(file) ? import(ELSEWHERE[file] ?? `./sections/${file}.js`) : undefined);

// La page entière : un élément par section, dans l'ordre de SECTIONS, posé quand toutes sont rendues.
/** @param {Fabrique} doc @param {{ station: StationOpen, locale: string | null | undefined, charger?: Load, reglages?: Port, connexions?: import("./sections/connections.js").Connections }} ouverte */
export async function setPageOfStation(doc, { station, locale, charger: load = sinceSections, reglages: settings, connexions: connections }) {
  const here = isThisComputer(station, locale);
  /** @type {Context} */
  const context = {
    station,
    ici: here,
    lectureSeule: !here,
    reglages: settings,
    connexions: connections,
    niveau(key) {
      const level = LEVELS[key];
      if (level === undefined) throw new Error(`setting "${key}" has no level in levels.js`);
      if (level === "project") throw new Error(`setting "${key}" belongs to the project: the station page shows none`);
      return levelSetting(doc, level);
    },
  };
  const page = doc.createElement("div");
  page.className = "page-de-station";
  page.dataset.ici = String(here);
  page.append(...(await Promise.all(SECTIONS.map((section) => setOneSection(doc, section, context, load)))));
  return page;
}

/** @param {Fabrique} doc @param {(typeof SECTIONS)[number]} section @param {Context} context @param {Load} load */
async function setOneSection(doc, { fichier: file, titre: title }, context, load) {
  const root = doc.createElement("section");
  root.className = "section-de-station";
  root.dataset.section = file;
  const head = doc.createElement("h3");
  head.textContent = title;
  root.append(head);
  try {
    const loaded = load(file);
    if (loaded === undefined) {
      const empty = doc.createElement("p");
      empty.className = "a-venir";
      empty.textContent = NOT_STILL;
      root.append(empty);
      return root;
    }
    const module = await loaded;
    if (typeof module?.setSection !== "function") throw new Error(`sections/${file}.js exports no setSection`);
    root.append(await module.setSection(doc, context));
  } catch (error) {
    root.append(lineError(doc, UNAVAILABLE, error instanceof Error ? error.message : String(error)));
  }
  return root;
}
