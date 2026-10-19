// A station's doors: one per project of its configuration, and one for the
// station itself. They run in their own unit (`brigade-station-porte.service`),
// outside the filter of the station's unit — they are the way out —, and
// launch nothing. The station itself only reaches the loopback: what a project
// launches goes out through that project's door, and finds only that project's
// allowlist there.
//
// Each door listens on a loopback port that nobody chooses: it takes back the
// one it had, or takes a free one. Those ports are written in a file
// (`BRIGADE_STATION_PORTES`), which the station rereads to give each project
// its own. The switchover writes into it, before the first start, the ports of
// the doors of the previous installation: a cook in flight at the switchover
// finds its door again at the port it knows.
import { chownSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { AUTRES_HOTES, compterLesRefus, ouvrirPorte, type OptionsPorte, type Porte } from "../porte.ts";
import { listeDuJournal, refusAuJournal } from "../porte-journal.ts";
import { REGLES_DE_BASE } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { CONFIGURATION, STATES, readConfigurationFile } from "./configuration.ts";

export const DOORS_VARIABLE = "BRIGADE_STATION_PORTES";
// Where the package puts it, under the station's directory: it is where the
// switchover writes the ports it takes back.
export const DOORS_FILE = "portes.json";
// The unit that holds the doors: it is the one the station names when a door
// is missing.
export const DOORS_UNIT = "brigade-station-porte.service";

// The port of each open door. `station`: the station's own.
export type Doors = { station: number | null; projects: Record<string, number> };

const NONE: Doors = { station: null, projects: {} };

const isPort = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 65535;

// Reads `BRIGADE_STATION_PORTES`: the file of the doors' ports. Without it, the
// station holds no door — each project has the one its line names, or none.
export function doorsConfig(env: Record<string, string | undefined>): string | null {
  const file = env[DOORS_VARIABLE];
  if (file === undefined || file === "") return null;
  if (!isAbsolute(file)) throw new ConfigInvalide(`${DOORS_VARIABLE} vaut « ${file} » — attendu un chemin absolu`);
  return file;
}

// The written ports. Missing or unreadable, none: a door that has not said its
// port is not open.
export function readDoors(file: string): Doors {
  let read: unknown;
  try {
    read = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return NONE;
  }
  if (typeof read !== "object" || read === null) return NONE;
  const { station, projets } = read as { station?: unknown; projets?: unknown };
  const ports: Record<string, number> = {};
  if (typeof projets === "object" && projets !== null) for (const [name, port] of Object.entries(projets)) if (isPort(port)) ports[name] = port;
  return { station: isPort(station) ? station : null, projects: ports };
}

export function writeDoors(file: string, doors: Doors, owner?: { uid: number; gid: number }): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify({ station: doors.station, projets: doors.projects })}\n`, { mode: 0o644 });
  // The switchover writes it as root; the doors will rewrite it as the account.
  if (owner) chownSync(temporary, owner.uid, owner.gid);
  renameSync(temporary, file);
}

export type DoorsOptions = {
  // The station's directory (`BRIGADE_STATION_DIR`): its configuration, and
  // each project's state, where its door reads its list and writes its refusals.
  root: string;
  // The ports file (`BRIGADE_STATION_PORTES`).
  file: string;
  say: (line: string) => void;
  // Between two rereads of the configuration.
  rereadMs?: number;
  open?: (options: OptionsPorte) => Promise<Porte>;
};

export type HeldDoors = {
  // Rereads the configuration, opens the door of an added project, closes
  // that of a removed project.
  reread(): Promise<void>;
  ports(): Doors;
  // Closes every door.
  stop(): Promise<void>;
};

const REREAD_MS = 2000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const onBehalfOf = (project: string, line: string) => `brigade [${project}] : ${line.replace(/^brigade : /, "")}`;

// Opens the station's doors and holds them: its own, then that of each project
// of its configuration. Returns when the first reread is done, its ports
// written.
export async function holdDoors(options: DoorsOptions): Promise<HeldDoors> {
  const { root, file, say } = options;
  const open = options.open ?? ouvrirPorte;
  // The previous ports — those of last time, or those the switchover took back
  // from the previous installation: each door takes back its own.
  const before = readDoors(file);
  const opened = new Map<string, Porte>();
  let station: Porte | null = null;
  let stopped = false;
  // The failures already said: a door that does not open is not repeated at
  // every reread.
  const said = new Map<string, string>();

  const openOn = async (name: string, wanted: number | null, rules: OptionsPorte["regles"], onRefusal: OptionsPorte["surRefus"], tell: (line: string) => void): Promise<Porte> => {
    if (wanted !== null) {
      try {
        return await open({ port: wanted, projet: name, regles: rules, surRefus: onRefusal });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EADDRINUSE" && code !== "EACCES") throw error;
        tell(`le port ${wanted} de sa porte est pris (${code}) : elle en prend un autre`);
      }
    }
    return open({ port: 0, projet: name, regles: rules, surRefus: onRefusal });
  };

  const ports = (): Doors => ({
    station: station?.port ?? null,
    projects: Object.fromEntries([...opened].sort(([a], [b]) => a.localeCompare(b)).map(([name, door]) => [name, door.port])),
  });

  const oneRound = async () => {
    if (stopped) return;
    let changed = false;
    if (station === null) {
      const onRefusal = compterLesRefus((refusal) =>
        say(`brigade : sortie de la station refusée — ${refusal.host === AUTRES_HOTES ? "d'autres hôtes encore" : `${refusal.host}:${refusal.port}`}${refusal.count > 1 ? ` (${refusal.count} tentatives)` : ""}`),
      );
      station = await openOn("la station", before.station, () => REGLES_DE_BASE, onRefusal, say);
      changed = true;
      say(`brigade : porte de la station ouverte — 127.0.0.1:${station.port} (Anthropic et GitHub seulement)`);
    }
    const { projects } = readConfigurationFile(join(root, CONFIGURATION));
    const wanted = new Set(projects.map((project) => project.name));
    for (const [name, door] of [...opened]) {
      if (wanted.has(name)) continue;
      opened.delete(name);
      await door.fermer();
      changed = true;
      say(onBehalfOf(name, "retiré de la configuration : sa porte est fermée"));
    }
    for (const name of [...said.keys()]) if (!wanted.has(name)) said.delete(name);
    for (const { name } of projects) {
      if (opened.has(name) || stopped) continue;
      const tell = (line: string) => say(onBehalfOf(name, line));
      const state = join(root, STATES, name);
      try {
        const door = await openOn(name, before.projects[name] ?? null, listeDuJournal(state, { avertir: tell }), refusAuJournal(state, name, { dire: tell }), tell);
        opened.set(name, door);
        said.delete(name);
        changed = true;
        tell(`porte ouverte — 127.0.0.1:${door.port}, liste blanche lue dans ${state}`);
      } catch (error) {
        const why = messageOf(error);
        if (said.get(name) !== why) tell(`sa porte ne s'ouvre pas, ses cooks ne partiront pas — ${why}`);
        said.set(name, why);
      }
    }
    if (changed && !stopped) writeDoors(file, ports());
  };

  // One round at a time: two overlapping rereads would open two doors for the
  // same project.
  let queue: Promise<void> = Promise.resolve();
  const reread = () => {
    queue = queue.then(oneRound).catch((error) => say(`brigade : portes de la station — relecture en échec : ${messageOf(error)}`));
    return queue;
  };

  await queue.then(oneRound);
  const watch = setInterval(() => void reread(), options.rereadMs ?? REREAD_MS);

  return {
    reread,
    ports,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(watch);
      await queue;
      const all = [...opened.values(), ...(station ? [station] : [])];
      opened.clear();
      station = null;
      await Promise.all(all.map((door) => door.fermer()));
    },
  };
}

// The station's door, awaited: it reaches nothing without it. Returns its
// port as soon as the file carries it.
export async function awaitStationDoor(file: string, options: { say: (line: string) => void; stepMs?: number; patienceMs?: number }): Promise<number> {
  const step = options.stepMs ?? 200;
  const start = Date.now();
  let said = false;
  for (;;) {
    const { station } = readDoors(file);
    if (station !== null) return station;
    if (!said && Date.now() - start >= (options.patienceMs ?? 3000)) {
      options.say(`brigade : la station attend sa porte — ${DOORS_UNIT} n'a pas encore écrit son port dans ${file} (journalctl -u ${DOORS_UNIT})`);
      said = true;
    }
    await new Promise((resolve) => setTimeout(resolve, step));
  }
}
