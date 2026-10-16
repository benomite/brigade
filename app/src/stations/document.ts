// Ce qu'une station écrit d'elle sur GitHub, tel que l'app le lit. Le format
// est celui de la station (runtime/src/appairage/document.ts) : un gist secret
// du compte du chef, qui porte `brigade-station.json`, écrit par la station
// seule, et `brigade-appairage.json`, écrit par l'app seule quand le chef a
// tapé le bon code. Aucune liaison directe entre l'app et la station : c'est
// tout ce qu'elles se disent.
import { createHash } from "node:crypto";
import { lireEtatsPublies, type EtatsPublies } from "../pannes/etats.ts";

export const FICHIER_STATION = "brigade-station.json";
export const FICHIER_APPAIRAGE = "brigade-appairage.json";

export type DocumentStation = {
  nom: string;
  machine: string;
  version: string;
  projets: string[];
  // Le dernier signe de vie, et la cadence à laquelle la station en donne.
  signeDeVie: string;
  cadenceMs: number;
  // L'heure de son arrêt, quand elle s'est arrêtée proprement — nulle sinon.
  arreteeLe: string | null;
  // Depuis quand elle tourne sur cette version, quand elle le publie — nulle sinon.
  versionDepuis?: string | null;
  // L'empreinte du code qu'elle affiche, tant qu'elle n'est pas appairée.
  appairage: { empreinte: string; expireLe: string } | null;
  // Les empreintes de ses derniers codes échus.
  echus: string[];
  // Sa mise à jour revenue en arrière et sa connexion Max : ses pannes (pannes/).
} & EtatsPublies;

// Les huit signes d'un code, dans l'alphabet de Crockford.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LONGUEUR = 8;

// Le code tel qu'il se compare : sans blancs ni tirets, en majuscules, les
// lettres qu'on confond ramenées à leur chiffre. Null s'il n'a pas la forme d'un code.
export function normaliser(tape: string): string | null {
  const signes = tape
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return signes.length === LONGUEUR && [...signes].every((signe) => ALPHABET.includes(signe)) ? signes : null;
}

// Ce que la station publie d'un code : son empreinte, jamais le code.
export const empreinte = (code: string): string => createHash("sha256").update(normaliser(code) ?? code).digest("hex");

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const date = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));

// Le document d'une station, ou en quoi ce qu'on a lu n'en a pas la forme.
export function lireDocument(brut: string): DocumentStation | { illisible: string } {
  let lu: Record<string, unknown>;
  try {
    lu = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return { illisible: "its state on GitHub is not JSON" };
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "station") return { illisible: "its state on GitHub is not a brigade station's" };
  const { nom, machine, version, projets, signeDeVie, cadenceMs, arreteeLe, versionDepuis, appairage, echus } = lu;
  if (!texte(nom) || !texte(machine) || !texte(version) || !date(signeDeVie)) return { illisible: "its state on GitHub lacks its name, version or last sign of life" };
  if (!Array.isArray(projets) || !projets.every(texte)) return { illisible: "its state on GitHub does not list its projects" };
  const code = appairage as { empreinte?: unknown; expireLe?: unknown } | null | undefined;
  return {
    nom,
    machine,
    version,
    projets,
    signeDeVie,
    cadenceMs: typeof cadenceMs === "number" && cadenceMs > 0 ? cadenceMs : 60_000,
    arreteeLe: date(arreteeLe) ? arreteeLe : null,
    versionDepuis: date(versionDepuis) ? versionDepuis : null,
    appairage: code !== null && typeof code === "object" && texte(code.empreinte) && date(code.expireLe) ? { empreinte: code.empreinte, expireLe: code.expireLe } : null,
    echus: Array.isArray(echus) ? echus.filter(texte) : [],
    ...lireEtatsPublies(lu),
  };
}
