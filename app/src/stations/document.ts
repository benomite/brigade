// Ce qu'une station écrit d'elle sur GitHub, tel que l'app le lit. Le format
// est celui de la station (runtime/src/appairage/document.ts) : un gist secret
// du compte du chef, qui porte `brigade-station.json`, écrit par la station
// seule, et `brigade-appairage.json`, écrit par l'app seule quand le chef a
// tapé le bon code. Aucune liaison directe entre l'app et la station : c'est
// tout ce qu'elles se disent.
//
// L'appairage porte aussi ce que la station fournit (`fournit`, #1757), quand
// c'est l'app de sa machine qui l'appaire — elle seule voit la machine : un Mac
// fournit `macos`, plus ce que l'installation y détecte (fournit.ts).
// L'app le reprend dans la demande de chaque projet où la station est ajoutée
// (projets/projets.ts) : c'est là que la station principale du projet le lit.
// Une station appairée d'ailleurs, ou avant #1757, n'en dit rien.
import { createHash } from "node:crypto";
import { lireEtatsPublies, type EtatsPublies } from "../pannes/etats.ts";
import { capacitesLues } from "../projets/demande.ts";

export const FICHIER_STATION = "brigade-station.json";
export const FICHIER_APPAIRAGE = "brigade-appairage.json";

export type DocumentStation = {
  nom: string;
  machine: string;
  // Les cœurs de sa machine : l'app en tire le nombre de cooks qu'elle propose (projets/projets.ts).
  // Absents d'une station qui ne les publie pas encore.
  coeurs?: number;
  // Faux : elle ne fait tourner aucun cook — un téléphone (#1158). Une station qui ne le publie pas cuisine.
  cuisine?: false;
  version: string;
  projets: string[];
  // Le dernier signe de vie, et la cadence à laquelle la station en donne.
  signeDeVie: string;
  cadenceMs: number;
  // L'heure de son arrêt, quand elle s'est arrêtée proprement — nulle sinon.
  arreteeLe: string | null;
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
  const { nom, machine, coeurs, cuisine, version, projets, signeDeVie, cadenceMs, arreteeLe, appairage, echus } = lu;
  if (!texte(nom) || !texte(machine) || !texte(version) || !date(signeDeVie)) return { illisible: "its state on GitHub lacks its name, version or last sign of life" };
  if (!Array.isArray(projets) || !projets.every(texte)) return { illisible: "its state on GitHub does not list its projects" };
  const code = appairage as { empreinte?: unknown; expireLe?: unknown } | null | undefined;
  return {
    nom,
    machine,
    ...(typeof coeurs === "number" && Number.isSafeInteger(coeurs) && coeurs > 0 ? { coeurs } : {}),
    ...(cuisine === false ? { cuisine: false as const } : {}),
    version,
    projets,
    signeDeVie,
    cadenceMs: typeof cadenceMs === "number" && cadenceMs > 0 ? cadenceMs : 60_000,
    arreteeLe: date(arreteeLe) ? arreteeLe : null,
    appairage: code !== null && typeof code === "object" && texte(code.empreinte) && date(code.expireLe) ? { empreinte: code.empreinte, expireLe: code.expireLe } : null,
    echus: Array.isArray(echus) ? echus.filter(texte) : [],
    ...lireEtatsPublies(lu),
  };
}

// L'appairage, tel que l'app l'écrit : quand, par quel code — son empreinte —, et ce que la station fournit.
export type DocumentAppairage = { appaireeLe: string; empreinte: string; fournit?: string[] };

export function documentDAppairage(appairage: DocumentAppairage): string {
  const fournit = capacitesLues(appairage.fournit);
  return `${JSON.stringify({ appaireeLe: appairage.appaireeLe, empreinte: appairage.empreinte, ...(fournit.length === 0 ? {} : { fournit }) }, null, 2)}\n`;
}

// L'appairage relu : illisible, ou d'une app d'avant #1757, il ne fournit rien.
export function lireAppairage(brut: string | undefined): DocumentAppairage | null {
  if (brut === undefined) return null;
  try {
    const { appaireeLe, empreinte, fournit } = (JSON.parse(brut) ?? {}) as Record<string, unknown>;
    if (!date(appaireeLe) || !texte(empreinte)) return null;
    const capacites = capacitesLues(fournit);
    return { appaireeLe, empreinte, ...(capacites.length === 0 ? {} : { fournit: capacites }) };
  } catch {
    return null;
  }
}
