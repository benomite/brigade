// @ts-check
// La page d'une station (ticket 2641, épique 2497) : la coque qui pose ses sections, dans cet ordre — son identité, ses
// connexions, ses dossiers et son bac à sable, ses capacités, ses cooks —, chacune sous son titre. vue.js la monte sur
// la page d'une station, à son ouverture. Chaque section est un module de `sections/`, nommé dans SECTIONS, qui exporte
// `poserSection(doc, contexte)` et rend un élément (ou sa promesse). Une section n'est chargée que lorsque son fichier
// est déclaré dans LIVREES : tant qu'il ne l'est pas, la coque pose son titre et une ligne qui dit qu'elle n'est pas
// encore là, sans demander de fichier absent. Une section livrée qui ne se charge pas, ou qui lève en se posant, dit en
// une ligne qu'elle est indisponible, son détail au survol ; les autres sections se posent quand même.
// La coque lit si la page est celle de cet ordinateur : pour une autre station, elle passe `lectureSeule` aux sections,
// qui montrent alors ce qui ne se règle que sur la machine elle-même sans offrir de le changer.
// Aucun réglage du projet n'y paraît (ils sont sur l'onglet Stations du projet, ticket 2484) : `contexte.niveau(cle)`
// refuse une clé de niveau « project ». Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { lectureIndisponible } from "../../briques.js";
import { NIVEAUX } from "../../niveaux.js";
import { niveauReglage } from "./NiveauReglage.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/**
 * La station dont la page est ouverte : son id, celui que l'app compare à la station de ce poste, et son nom.
 * @typedef {{ id: string, nom: string }} StationOuverte
 */
/**
 * Ce que chaque section reçoit : la station, si elle est celle de cet ordinateur, si elle se montre sans se régler, et
 * la marque du niveau d'un réglage, par sa clé de niveaux.js.
 * @typedef {{ station: StationOuverte, ici: boolean, lectureSeule: boolean, niveau(cle: string): any }} Contexte
 */
/** @typedef {{ poserSection(doc: Fabrique, contexte: Contexte): any }} Section */
/** @typedef {(fichier: string) => Promise<Partial<Section>> | undefined} Charger */

// Les sections, dans leur ordre sur la page : leur fichier sous `sections/` et leur titre.
export const SECTIONS = /** @type {const} */ ([
  { fichier: "identite", titre: "Identity" },
  { fichier: "connexions", titre: "Connections" },
  { fichier: "dossiers-et-bac-a-sable", titre: "Folders and sandbox" },
  { fichier: "capacites", titre: "Capabilities" },
  { fichier: "cooks", titre: "Cooks" },
]);

// Les sections dont le fichier est livré sous `sections/` : le ticket qui livre une section y ajoute son nom.
/** @type {ReadonlySet<string>} */
export const LIVREES = new Set([]);

export const PAS_ENCORE = "not shown yet";
export const INDISPONIBLE = "this section is unavailable";

// La page est celle de cet ordinateur quand la station ouverte est la station locale que l'app connaît.
/** @param {StationOuverte} station @param {string | null | undefined} locale */
export function estCetOrdinateur(station, locale) {
  return typeof locale === "string" && locale !== "" && station.id === locale;
}

/** @type {Charger} */
const depuisSections = (fichier) => (LIVREES.has(fichier) ? import(`./sections/${fichier}.js`) : undefined);

// La page entière : un élément par section, dans l'ordre de SECTIONS, posé quand toutes sont rendues.
/** @param {Fabrique} doc @param {{ station: StationOuverte, locale: string | null | undefined, charger?: Charger }} ouverte */
export async function poserPageDeStation(doc, { station, locale, charger = depuisSections }) {
  const ici = estCetOrdinateur(station, locale);
  /** @type {Contexte} */
  const contexte = {
    station,
    ici,
    lectureSeule: !ici,
    niveau(cle) {
      const niveau = NIVEAUX[cle];
      if (niveau === undefined) throw new Error(`setting "${cle}" has no level in niveaux.js`);
      if (niveau === "project") throw new Error(`setting "${cle}" belongs to the project: the station page shows none`);
      return niveauReglage(doc, niveau);
    },
  };
  const page = doc.createElement("div");
  page.className = "page-de-station";
  page.dataset.ici = String(ici);
  page.append(...(await Promise.all(SECTIONS.map((section) => poserUneSection(doc, section, contexte, charger)))));
  return page;
}

/** @param {Fabrique} doc @param {(typeof SECTIONS)[number]} section @param {Contexte} contexte @param {Charger} charger */
async function poserUneSection(doc, { fichier, titre }, contexte, charger) {
  const racine = doc.createElement("section");
  racine.className = "section-de-station";
  racine.dataset.section = fichier;
  const tete = doc.createElement("h3");
  tete.textContent = titre;
  racine.append(tete);
  try {
    const chargee = charger(fichier);
    if (chargee === undefined) {
      const vide = doc.createElement("p");
      vide.className = "a-venir";
      vide.textContent = PAS_ENCORE;
      racine.append(vide);
      return racine;
    }
    const module = await chargee;
    if (typeof module?.poserSection !== "function") throw new Error(`sections/${fichier}.js exports no poserSection`);
    racine.append(await module.poserSection(doc, contexte));
  } catch (erreur) {
    racine.append(lectureIndisponible(doc, INDISPONIBLE, erreur instanceof Error ? erreur.message : String(erreur)));
  }
  return racine;
}
