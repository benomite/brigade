// Ce qu'une station écrit d'elle sur GitHub, tel que l'app le lit. Le format
// est celui de la station : un gist secret
// du compte du chef, qui porte `brigade-station.json`, écrit par la station
// seule, et `brigade-appairage.json`, écrit par l'app seule quand le chef a
// tapé le bon code. Aucune liaison directe entre l'app et la station : c'est
// tout ce qu'elles se disent.
//
// L'appairage porte aussi ce que la station fournit (`fournit`, #1757), quand
// c'est l'app de sa machine qui l'appaire — elle seule voit la machine : un Mac
// fournit `macos`, plus ce que l'installation y détecte (provides.ts).
// L'app le reprend dans la demande de chaque projet où la station est ajoutée
// (projects/projects.ts) : c'est là que la station principale du projet le lit.
// Une station appairée d'ailleurs, ou avant #1757, n'en dit rien.
import { createHash } from "node:crypto";
import { readStatesPublished, type StatesPublished } from "../outages/states.ts";
import { capacitiesRead } from "../projects/request.ts";

export const FILE_STATION = "brigade-station.json";
export const FILE_PAIRING = "brigade-appairage.json";

export type DocumentStation = {
  nom: string;
  machine: string;
  // Les cœurs de sa machine : l'app en tire le nombre de cooks qu'elle propose (projects/projects.ts).
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
} & StatesPublished;

// Les huit signes d'un code, dans l'alphabet de Crockford.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

// Le code tel qu'il se compare : sans blancs ni tirets, en majuscules, les
// lettres qu'on confond ramenées à leur chiffre. Null s'il n'a pas la forme d'un code.
export function normalize(tape: string): string | null {
  const signs = tape
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return signs.length === LENGTH && [...signs].every((sign) => ALPHABET.includes(sign)) ? signs : null;
}

// Ce que la station publie d'un code : son empreinte, jamais le code.
export const fingerprint = (code: string): string => createHash("sha256").update(normalize(code) ?? code).digest("hex");

const text = (value: unknown): value is string => typeof value === "string";
const date = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));

// Le document d'une station, ou en quoi ce qu'on a lu n'en a pas la forme.
export function readDocument(raw: string): DocumentStation | { illisible: string } {
  let readOne: Record<string, unknown>;
  try {
    readOne = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { illisible: "its state on GitHub is not JSON" };
  }
  if (readOne === null || typeof readOne !== "object" || readOne.brigade !== "station") return { illisible: "its state on GitHub is not a brigade station's" };
  const { nom: name, machine, coeurs: cores, cuisine: kitchen, version, projets: projects, signeDeVie: signOfLife, cadenceMs, arreteeLe: stoppedThe, appairage: pairing, echus } = readOne;
  if (!text(name) || !text(machine) || !text(version) || !date(signOfLife)) return { illisible: "its state on GitHub lacks its name, version or last sign of life" };
  if (!Array.isArray(projects) || !projects.every(text)) return { illisible: "its state on GitHub does not list its projects" };
  const code = pairing as { empreinte?: unknown; expireLe?: unknown } | null | undefined;
  return {
    nom: name,
    machine,
    ...(typeof cores === "number" && Number.isSafeInteger(cores) && cores > 0 ? { coeurs: cores } : {}),
    ...(kitchen === false ? { cuisine: false as const } : {}),
    version,
    projets: projects,
    signeDeVie: signOfLife,
    cadenceMs: typeof cadenceMs === "number" && cadenceMs > 0 ? cadenceMs : 60_000,
    arreteeLe: date(stoppedThe) ? stoppedThe : null,
    appairage: code !== null && typeof code === "object" && text(code.empreinte) && date(code.expireLe) ? { empreinte: code.empreinte, expireLe: code.expireLe } : null,
    echus: Array.isArray(echus) ? echus.filter(text) : [],
    ...readStatesPublished(readOne),
  };
}

// L'appairage, tel que l'app l'écrit : quand, par quel code — son empreinte —, et ce que la station fournit.
export type DocumentPairing = { appaireeLe: string; empreinte: string; fournit?: string[] };

export function documentOfPairing(pairing: DocumentPairing): string {
  const provides = capacitiesRead(pairing.fournit);
  return `${JSON.stringify({ appaireeLe: pairing.appaireeLe, empreinte: pairing.empreinte, ...(provides.length === 0 ? {} : { fournit: provides }) }, null, 2)}\n`;
}

// L'appairage relu : illisible, ou d'une app d'avant #1757, il ne fournit rien.
export function readPairing(raw: string | undefined): DocumentPairing | null {
  if (raw === undefined) return null;
  try {
    const { appaireeLe: pairedThe, empreinte: fingerprint, fournit: provides } = (JSON.parse(raw) ?? {}) as Record<string, unknown>;
    if (!date(pairedThe) || !text(fingerprint)) return null;
    const capacities = capacitiesRead(provides);
    return { appaireeLe: pairedThe, empreinte: fingerprint, ...(capacities.length === 0 ? {} : { fournit: capacities }) };
  } catch {
    return null;
  }
}
