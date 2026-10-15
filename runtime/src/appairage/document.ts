// Ce qu'une station écrit d'elle sur GitHub, et le code par lequel le chef
// l'appaire à son app. Aucune liaison directe entre machines : la station
// écrit son état dans un gist secret du compte GitHub de la machine — celui
// du chef —, et l'app le lit là (`app/src/stations/`). Le gist reste quand la
// station s'éteint : la home la montre hors ligne, elle ne la perd pas.
//
// Le gist porte deux fichiers :
//   - `brigade-station.json`, écrit par la station seule, à chaque signe de vie :
//       { "brigade": "station", "format": 1, "nom": "box", "machine": "Linux 6.1.0",
//         "version": "…", "projets": ["brigade"], "signeDeVie": "<ISO>",
//         "cadenceMs": 60000, "arreteeLe": null | "<ISO>",
//         "appairage": null | { "empreinte": "<sha256>", "expireLe": "<ISO>" },
//         "echus": ["<sha256>", …] }
//   - `brigade-appairage.json`, écrit par l'app seule, quand le chef a tapé le
//     bon code : { "appaireeLe": "<ISO>", "empreinte": "<sha256>" }.
//
// Le code ne se publie que par son empreinte : qui lit le gist n'en tire aucun
// code à taper. Les empreintes des derniers codes échus restent publiées, pour
// qu'un code expiré se dise expiré, et non inconnu.
import { createHash, randomInt } from "node:crypto";

export const FICHIER_STATION = "brigade-station.json";
export const FICHIER_APPAIRAGE = "brigade-appairage.json";
export const FORMAT = 1;
// La description du gist : ce qui le fait reconnaître parmi ceux du compte.
export const description = (nom: string) => `brigade — station ${nom}`;

// Huit signes de l'alphabet de Crockford — ni I, ni L, ni O, ni U : il se lit
// et se tape sans ambiguïté. 2⁴⁰ codes, pour un quart d'heure.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LONGUEUR = 8;
// Le temps de se connecter à Max puis d'ouvrir l'app ; échu, la station en tire un autre.
export const DUREE_DU_CODE_MS = 15 * 60_000;
// Les codes échus dont l'empreinte reste publiée.
export const ECHUS_GARDES = 5;

export type Appairage = { empreinte: string; expireLe: string };

export type DocumentStation = {
  brigade: "station";
  format: number;
  nom: string;
  machine: string;
  version: string;
  projets: string[];
  signeDeVie: string;
  cadenceMs: number;
  arreteeLe: string | null;
  appairage: Appairage | null;
  echus: string[];
};

// Un code neuf, tel que la station l'affiche : `ABCD-EFGH`.
export function tirerCode(tirer: (borne: number) => number = randomInt): string {
  const signes = Array.from({ length: LONGUEUR }, () => ALPHABET[tirer(ALPHABET.length)]).join("");
  return `${signes.slice(0, 4)}-${signes.slice(4)}`;
}

// Le code tel qu'il se compare : ce que le chef a tapé, sans blancs ni tirets,
// en majuscules, les lettres qu'on confond ramenées à leur chiffre. Null s'il
// n'a pas la forme d'un code.
export function normaliser(tape: string): string | null {
  const signes = tape
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return signes.length === LONGUEUR && [...signes].every((signe) => ALPHABET.includes(signe)) ? signes : null;
}

export const empreinte = (code: string): string => createHash("sha256").update(normaliser(code) ?? code).digest("hex");
