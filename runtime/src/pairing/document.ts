// What a station writes about itself on GitHub, and the code by which the chief
// pairs it with their app. No direct link between machines: the station writes
// its state into a secret gist of the machine's GitHub account — the chief's
// —, and the app reads it there (`app/src/stations/`). The gist stays when the
// station goes off: the home shows it offline, it does not lose it.
//
// The gist holds two files:
//   - `brigade-station.json`, written by the station alone, at each sign of life:
//       { "brigade": "station", "format": 1, "nom": "box", "machine": "Linux 6.1.0",
//         "version": "…", "projets": ["brigade"], "signeDeVie": "<ISO>",
//         "cadenceMs": 60000, "arreteeLe": null | "<ISO>",
//         "appairage": null | { "empreinte": "<sha256>", "expireLe": "<ISO>" },
//         "echus": ["<sha256>", …],
//         "miseAJour": null | { "visee": "…", "restauree": "…", "le": "<ISO>", "retourRate": false },
//         "connexionMax": null | { "etat": "connectee" | "perdue" | "inconnue", "depuis": null | "<ISO>" } }
//     `miseAJour` and `connexionMax` are what the app reports as broken on the
//     home (app/src/pannes/): the last update when it failed and the station
//     rolled back, and the machine's Max connection. Versions and dates, never
//     the reason for a failure nor a command.
//   - `brigade-appairage.json`, written by the app alone, when the chief typed
//     the right code: { "appaireeLe": "<ISO>", "empreinte": "<sha256>" }.
//
// The code is only published by its fingerprint: whoever reads the gist gets no
// code to type from it. The fingerprints of the last expired codes stay
// published, so that an expired code is reported expired, and not unknown.
import { createHash, randomInt } from "node:crypto";

export const STATION_FILE = "brigade-station.json";
export const PAIRING_FILE = "brigade-appairage.json";
export const FORMAT = 1;
// The gist's description: what makes it recognizable among the account's.
export const description = (name: string) => `brigade — station ${name}`;

// Eight characters of the Crockford alphabet — no I, L, O or U: it reads and
// types without ambiguity. 2⁴⁰ codes, for a quarter of an hour.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LENGTH = 8;
// Time enough to log in to Max then open the app; expired, the station draws another.
export const CODE_DURATION_MS = 15 * 60_000;
// The expired codes whose fingerprint stays published.
export const EXPIRED_KEPT = 5;

export type Pairing = { empreinte: string; expireLe: string };
// The last update, when it did not start: `visee` failed, the station rolled
// back to `restauree` — or not, `retourRate`.
export type RolledBackUpdate = { visee: string; restauree: string; le: string; retourRate: boolean };
export type PublishedConnection = { etat: "connectee" | "perdue" | "inconnue"; depuis: string | null };
// What the station publishes about its breakdowns: null, it knows nothing of them.
export type PublishedStates = { miseAJour: RolledBackUpdate | null; connexionMax: PublishedConnection | null };

export type StationDocument = {
  brigade: "station";
  format: number;
  nom: string;
  machine: string;
  version: string;
  projets: string[];
  signeDeVie: string;
  cadenceMs: number;
  arreteeLe: string | null;
  appairage: Pairing | null;
  echus: string[];
} & PublishedStates;

// A new code, as the station displays it: `ABCD-EFGH`.
export function drawCode(draw: (bound: number) => number = randomInt): string {
  const chars = Array.from({ length: LENGTH }, () => ALPHABET[draw(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// The code as it is compared: what the chief typed, without blanks or dashes,
// in capitals, the letters that get confused brought back to their digit. Null
// if it does not have the shape of a code.
export function normalize(typed: string): string | null {
  const chars = typed
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return chars.length === LENGTH && [...chars].every((char) => ALPHABET.includes(char)) ? chars : null;
}

export const fingerprint = (code: string): string => createHash("sha256").update(normalize(code) ?? code).digest("hex");
