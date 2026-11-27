// What the station says of itself on GitHub: the facts of `status.json` (operator-status.ts), written into the station's
// pairing gist — a secret gist of the chef's account — as `brigade-station.json`, the file the app's Stations view reads
// (`app/src/stations/document.ts`). The app never reaches a station any other way. The gist's id is kept in
// `<station>/gist-id`; a station that has none creates its gist on its first write. The pairing file of the same gist is
// the app's: this module only ever writes `brigade-station.json`.
//
// Written when a fact changes, at most every `MIN_GAP_MS`, and at least every `HEARTBEAT_MS` (the reader calls a station
// offline after two missed heartbeats). The GitHub quota left is a fact, but it moves on every call: it rides along with
// a write and never causes one.
import { hostname, release, type } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ghCli, type Gh } from "./kitchen/github.ts";
import type { Status } from "./operator-status.ts";

export const FILE_STATION = "brigade-station.json";
export const MIN_GAP_MS = 180_000;
export const HEARTBEAT_MS = 540_000;

// The gist file's content for a status: the identity the app's reader requires, then `status`, the facts as `status.json` has them.
export function stationDocument(status: Status, who: { name: string; machine: string }): string {
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
      appairage: null,
      echus: [],
      status,
    },
    null,
    2,
  )}\n`;
}

// Returns what the kitchen calls with each status it writes. Never throws; `say` hears a failure once, until a write succeeds.
export function gistPublisher(station: string, gh: Gh, options: { name: string; machine: string; now?: () => number; say?: (line: string) => void }): (status: Status) => void {
  const now = options.now ?? Date.now;
  const idFile = join(station, "gist-id");
  let wrote = "";
  let wroteAt = Number.NEGATIVE_INFINITY;
  let busy = false;
  let said = false;
  return (status) => {
    const facts = JSON.stringify({ ...status, updatedAt: "", quota: null });
    const due = now() - wroteAt >= MIN_GAP_MS && (facts !== wrote || now() - wroteAt >= HEARTBEAT_MS);
    if (busy || !due) return;
    busy = true;
    void (async () => {
      try {
        const content = stationDocument(status, options);
        const id = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "";
        if (id === "") {
          const created = JSON.parse(await gh(["api", "-X", "POST", "/gists", "--input", "-"], JSON.stringify({ description: `brigade — station ${options.name}`, public: false, files: { [FILE_STATION]: { content } } }))) as { id: string };
          writeFileSync(idFile, `${created.id}\n`);
        } else {
          await gh(["api", "-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], JSON.stringify({ files: { [FILE_STATION]: { content } } }));
        }
        wrote = facts;
        wroteAt = now();
        said = false;
      } catch (error) {
        // Retried on the next status, a minute later at most.
        wroteAt = now() - MIN_GAP_MS + 60_000;
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
