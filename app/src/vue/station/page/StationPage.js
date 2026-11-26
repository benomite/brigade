// @ts-check
// La page d'une station (ticket 2641, épique 2497) : la coque qui pose ses sections, dans cet ordre — son identité, ses
// connexions, ses dossiers et son bac à sable, ses capacités, ses cooks, son moteur —, chacune sous son titre. vue.js la monte sur
// la page d'une station, à son ouverture. Chaque section est un module de `sections/`, nommé dans SECTIONS, qui exporte
// `poserSection(doc, contexte)` et rend un élément (ou sa promesse). Une section n'est chargée que lorsque son fichier
// est déclaré dans LIVREES : tant qu'il ne l'est pas, la coque pose son titre et une ligne qui dit qu'elle n'est pas
// encore là, sans demander de fichier absent. Une section livrée qui ne se charge pas, ou qui lève en se posant, dit en
// une ligne qu'elle est indisponible, son détail au survol ; les autres sections se posent quand même.
// La coque lit si la page est celle de cet ordinateur : pour une autre station, elle passe `lectureSeule` aux sections,
// qui montrent alors ce qui ne se règle que sur la machine elle-même sans offrir de le changer.
// Aucun réglage du projet n'y paraît (ils sont sur l'onglet Stations du projet, ticket 2484) : `contexte.niveau(cle)`
// refuse une clé de niveau « project ». Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { lineError } from "../../composants/line-error/line-error.js";
import { NIVEAUX } from "../../niveaux.js";
import { niveauSetting } from "./SettingLevel.js";
import { NON_ATTEINT } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/**
 * La station dont la page est ouverte : son id, celui que l'app compare à la station de ce poste, et son nom.
 * @typedef {{ id: string, nom: string }} StationOuverte
 */
/**
 * Ce que chaque section reçoit : la station, si elle est celle de cet ordinateur, si elle se montre sans se régler, et
 * la marque du niveau d'un réglage, par sa clé de niveaux.js.
 * @typedef {{ station: StationOuverte, ici: boolean, lectureSeule: boolean, niveau(cle: string): any, reglages?: Port, connexions?: import("./sections/connections.js").Connections }} Context
 */
/** @typedef {import("./sections/dossiers-et-sandbox.js").Port} Port */
/** @typedef {{ poserSection(doc: Fabrique, context: Context): any }} Section */
/** @typedef {(fichier: string) => Promise<Partial<Section>> | undefined} Charger */

// Les sections, dans leur ordre sur la page : leur fichier sous `sections/` et leur titre.
export const SECTIONS = /** @type {const} */ ([
  { fichier: "identity", titre: "Identity" },
  { fichier: "connections", titre: "Connections" },
  { fichier: "dossiers-et-sandbox", titre: "Folders and sandbox" },
  { fichier: "capacites", titre: "Capabilities" },
  { fichier: "cooks", titre: "Cooks" },
  { fichier: "moteur", titre: "Engine" },
]);

// Les sections dont le fichier est livré sous `sections/` : le ticket qui livre une section y ajoute son nom.
/** @type {ReadonlySet<string>} */
export const LIVREES = new Set(["dossiers-et-sandbox", "connections", "moteur"]);
// Une section livrée hors de `sections/` : son module, par son nom (le moteur, ticket 3746, sous `moteur/`).
/** @type {Readonly<Record<string, string>>} */
const AILLEURS = { moteur: "../../engine/EngineSection.js" };

export const PAS_ENCORE = "not shown yet";
export const INDISPONIBLE = NON_ATTEINT("this section");

// La page est celle de cet ordinateur quand la station ouverte est la station locale que l'app connaît.
/** @param {StationOuverte} station @param {string | null | undefined} locale */
export function estCetOrdinateur(station, locale) {
  return typeof locale === "string" && locale !== "" && station.id === locale;
}

/** @type {Charger} */
const depuisSections = (fichier) => (LIVREES.has(fichier) ? import(AILLEURS[fichier] ?? `./sections/${fichier}.js`) : undefined);

// La page entière : un élément par section, dans l'ordre de SECTIONS, posé quand toutes sont rendues.
/** @param {Fabrique} doc @param {{ station: StationOuverte, locale: string | null | undefined, charger?: Charger, reglages?: Port, connexions?: import("./sections/connections.js").Connections }} ouverte */
export async function poserPageDeStation(doc, { station, locale, charger = depuisSections, reglages: settings, connexions: connections }) {
  const ici = estCetOrdinateur(station, locale);
  /** @type {Context} */
  const context = {
    station,
    ici,
    lectureSeule: !ici,
    reglages: settings,
    connexions: connections,
    niveau(cle) {
      const niveau = NIVEAUX[cle];
      if (niveau === undefined) throw new Error(`setting "${cle}" has no level in niveaux.js`);
      if (niveau === "project") throw new Error(`setting "${cle}" belongs to the project: the station page shows none`);
      return niveauSetting(doc, niveau);
    },
  };
  const page = doc.createElement("div");
  page.className = "page-de-station";
  page.dataset.ici = String(ici);
  page.append(...(await Promise.all(SECTIONS.map((section) => poserUneSection(doc, section, context, charger)))));
  return page;
}

/** @param {Fabrique} doc @param {(typeof SECTIONS)[number]} section @param {Context} context @param {Charger} charger */
async function poserUneSection(doc, { fichier, titre }, context, charger) {
  const racine = doc.createElement("section");
  racine.className = "section-de-station";
  racine.dataset.section = fichier;
  const tete = doc.createElement("h3");
  tete.textContent = titre;
  racine.append(tete);
  try {
    const chargee = charger(fichier);
    if (chargee === undefined) {
      const empty = doc.createElement("p");
      empty.className = "a-venir";
      empty.textContent = PAS_ENCORE;
      racine.append(empty);
      return racine;
    }
    const module = await chargee;
    if (typeof module?.poserSection !== "function") throw new Error(`sections/${fichier}.js exports no poserSection`);
    racine.append(await module.poserSection(doc, context));
  } catch (error) {
    racine.append(lineError(doc, INDISPONIBLE, error instanceof Error ? error.message : String(error)));
  }
  return racine;
}
