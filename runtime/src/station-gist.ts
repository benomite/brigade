// What the station says of itself on GitHub: the facts of `status.json` (operator-status.ts), written into the station's
// pairing gist — a secret gist of the chef's account — as `brigade-station.json`, the file the app's Stations view reads
// (`app/src/stations/document.ts`). The app never reaches a station any other way.
//
// The gist is also how the app pairs: while the station is not paired, it publishes the fingerprint of a code it logs
// (`appairage`, and the fingerprints of its expired codes, `echus`); the chef types the code in the app, which writes
// `brigade-appairage.json` in the same gist — the app's file: this module only reads it, and only ever writes
// `brigade-station.json`. What the station keeps from one run to the next — its gist, its code, whether it is paired —
// is in `<station>/appairage.json`; a gist gone from GitHub starts it again with a new gist and a new code.
//
// Written when a fact changes, at most every `MIN_GAP_MS`, and at least every `HEARTBEAT_MS` (the reader calls a station
// offline after two missed heartbeats). The GitHub quota left is a fact, but it moves on every call: it rides along with
// a write and never causes one.
import { createHash, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname, release, type } from "node:os";
import { join } from "node:path";
import { ecrireSecret } from "./droits.ts";
import { ghCli, type Gh } from "./kitchen/github.ts";
import type { Status } from "./operator-status.ts";

export const FILE_STATION = "brigade-station.json";
export const FILE_PAIRING = "brigade-appairage.json";
export const FILE_LOCAL = "appairage.json";
export const MIN_GAP_MS = 180_000;
export const HEARTBEAT_MS = 540_000;
export const CODE_MS = 15 * 60_000;
const EXPIRED_KEPT = 5;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// What the station keeps of its pairing between two runs.
type Local = { gist: string | null; paired: boolean; code: string | null; expiresAt: string | null; expired: string[] };

export const fingerprintOf = (code: string): string => createHash("sha256").update(code).digest("hex");
const drawCode = (): string => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// The gist file's content for a status: the identity the app's reader requires, the pairing code's fingerprint, then
// `status`, the facts as `status.json` has them.
export function stationDocument(status: Status, who: { name: string; machine: string }, pairing: Pick<Local, "paired" | "code" | "expiresAt" | "expired"> = { paired: true, code: null, expiresAt: null, expired: [] }): string {
  const open = !pairing.paired && pairing.code !== null && pairing.expiresAt !== null;
  return `${JSON.stringify(
    {
      brigade: "station",
      format: 1,
      nom: who.name,
      machine: who.machine,
      version: status.version,
      projets: status.projects,
      signeDeVie: status.updatedAt,
      cadenceMs: HEARTBEAT_MS,
      arreteeLe: null,
      appairage: open ? { empreinte: fingerprintOf(pairing.code as string), expireLe: pairing.expiresAt } : null,
      echus: pairing.paired ? [] : pairing.expired,
      status,
    },
    null,
    2,
  )}\n`;
}

function readLocal(file: string): Local {
  try {
    const read = JSON.parse(readFileSync(file, "utf8")) as Partial<Local>;
    const text = (value: unknown): value is string => typeof value === "string" && value !== "";
    return { gist: text(read.gist) ? read.gist : null, paired: read.paired === true, code: text(read.code) ? read.code : null, expiresAt: text(read.expiresAt) ? read.expiresAt : null, expired: Array.isArray(read.expired) ? read.expired.filter((one): one is string => typeof one === "string") : [] };
  } catch {
    return { gist: null, paired: false, code: null, expiresAt: null, expired: [] };
  }
}

// Returns what the kitchen calls with each status it writes. Never throws; `say` hears a failure once, until a write succeeds.
export function gistPublisher(station: string, gh: Gh, options: { name: string; machine: string; now?: () => number; say?: (line: string) => void }): (status: Status) => void {
  const now = options.now ?? Date.now;
  const file = join(station, FILE_LOCAL);
  let local = readLocal(file);
  let wrote = "";
  let wroteAt = Number.NEGATIVE_INFINITY;
  let busy = false;
  let said = false;
  const save = () => ecrireSecret(file, `${JSON.stringify(local, null, 2)}\n`);
  // A code that is over gives way to a new one, until the app has paired the station.
  const renewCode = (instant: number) => {
    if (local.paired || (local.code !== null && local.expiresAt !== null && Date.parse(local.expiresAt) > instant)) return;
    const expired = local.code === null ? local.expired : [fingerprintOf(local.code), ...local.expired];
    local = { ...local, code: drawCode(), expiresAt: new Date(instant + CODE_MS).toISOString(), expired: expired.slice(0, EXPIRED_KEPT) };
    save();
  };
  // The app has paired the station when its file in the gist holds the fingerprint of a code this station drew.
  const readPairing = async (gist: string) => {
    const files = (JSON.parse(await gh(["api", `/gists/${encodeURIComponent(gist)}`])) as { files?: Record<string, { content?: unknown } | null> }).files ?? {};
    const raw = files[FILE_PAIRING]?.content;
    if (typeof raw !== "string") return;
    let written: { empreinte?: unknown };
    try {
      written = JSON.parse(raw) as typeof written;
    } catch {
      return;
    }
    const drawn = [...(local.code === null ? [] : [fingerprintOf(local.code)]), ...local.expired];
    if (typeof written.empreinte !== "string" || !drawn.includes(written.empreinte)) return;
    local = { ...local, paired: true, code: null, expiresAt: null, expired: [] };
    save();
    options.say?.("kitchen: the station is paired with the app — it shows no code any more");
  };
  // What tells a write is due: the facts without their hours or quota, and the state of the pairing code.
  const factsOf = (status: Status, instant: number) => JSON.stringify({ ...status, updatedAt: "", quota: null, code: local.code, paired: local.paired, over: local.expiresAt !== null && Date.parse(local.expiresAt) <= instant });
  return (status) => {
    const instant = now();
    const facts = factsOf(status, instant);
    const due = instant - wroteAt >= MIN_GAP_MS && (facts !== wrote || instant - wroteAt >= HEARTBEAT_MS);
    if (busy || !due) return;
    busy = true;
    void (async () => {
      try {
        if (local.gist !== null && !local.paired) await readPairing(local.gist);
        renewCode(instant);
        const content = stationDocument(status, options, local);
        if (local.gist === null) {
          const created = JSON.parse(await gh(["api", "-X", "POST", "/gists", "--input", "-"], JSON.stringify({ description: `brigade — station ${options.name}`, public: false, files: { [FILE_STATION]: { content } } }))) as { id: string };
          local = { ...local, gist: created.id };
          save();
        } else {
          await gh(["api", "-X", "PATCH", `/gists/${encodeURIComponent(local.gist)}`, "--input", "-"], JSON.stringify({ files: { [FILE_STATION]: { content } } }));
        }
        wrote = factsOf(status, instant);
        wroteAt = instant;
        said = false;
        if (!local.paired && local.code !== null && local.expiresAt !== null) options.say?.(`kitchen: station to pair — type this code in the app: ${local.code} (valid until ${local.expiresAt})`);
      } catch (error) {
        // A gist gone from GitHub starts the pairing again: a new gist, a new code.
        if (/\b404\b|not found/i.test((error as Error).message)) {
          local = { gist: null, paired: false, code: null, expiresAt: null, expired: [] };
          save();
        }
        // Retried on the next status, a minute later at most.
        wroteAt = instant - MIN_GAP_MS + 60_000;
        if (!said) options.say?.(`kitchen: the station's gist cannot be written — ${(error as Error).message}`);
        said = true;
      } finally {
        busy = false;
      }
    })();
  };
}

// The kitchen's publisher: its own `gh` (`BRIGADE_GH_BIN`), this machine's name.
export const gistPublisherOf = (station: string, env: NodeJS.ProcessEnv, say: (line: string) => void) => gistPublisher(station, ghCli(env.BRIGADE_GH_BIN || "gh", env), { name: hostname(), machine: `${type()} ${release()}`, say });
