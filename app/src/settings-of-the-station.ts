// Les dossiers et la porte réseau de la station de cet ordinateur, tels que le chef les change sur sa page (#2644,
// épique 2497) : un fichier de cette machine, à côté du fichier de l'app, jamais dans un dépôt. Il ne garde que ce que le
// chef a changé — un dossier, les hôtes qu'il ouvre en plus du socle et de ce que le dépôt déclare ; le reste se lit
// là où la station le calcule. Le fichier est relu à chaque lecture : ce qui est écrit se montre au rechargement.
// Il garde aussi le moteur de ses cooks et son secours (#3746, épique 3518) — `engine` et `fallbackEngine`, aux valeurs
// `claude-subscription`, `claude-api-key` et `codex` ; absents, l'abonnement et aucun. La clé d'API de Claude n'y est pas :
// elle a son propre fichier à côté, lisible du seul compte (0600 ; sous Windows, qui rend toujours 0o666, son ACL réduite
// au compte : runtime/src/droits.ts, #3680), et la lecture dit seulement si elle est gardée — la clé ne repart jamais vers
// la vue.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix, win32 } from "node:path";
import { ecrireSecret } from "../../runtime/src/droits.ts";

const ENGINES = ["claude-subscription", "claude-api-key", "codex"] as const;
type Engine = (typeof ENGINES)[number];
export type Settings = { clones: string; worktrees: string; bac: "on" | "off"; hotes: { hote: string; origine: string; ajoute: boolean }[]; engine?: string; fallbackEngine: string | null; apiKey: boolean };
export type Change = { clones?: string; worktrees?: string; hotes?: string[]; engine?: string; fallbackEngine?: string | null; apiKey?: string };
export type Refusal = { refus: string; detail?: string };
type Guards = { clones?: string; worktrees?: string; hotes?: string[]; engine?: string; fallbackEngine?: string | null };

// Le fichier de la clé d'API : à côté de celui des réglages.
const fileOfTheKey = (file: string) => join(dirname(file), "station-cle-api");
const isOneEngine = (value: unknown): value is Engine => ENGINES.includes(value as Engine);
// Une clé d'API : un seul mot, de caractères visibles.
const KEY = /^[\x21-\x7e]{8,512}$/;

export const BASE = [
  { hote: "anthropic.com", origine: "Anthropic — the model, through the Max connection" },
  { hote: "claude.ai", origine: "Anthropic — the model, through the Max connection" },
  { hote: "github.com", origine: "GitHub — the repository, the issues, the archives" },
  { hote: "githubusercontent.com", origine: "GitHub — the repository, the issues, the archives" },
];
export const OPEN_PAR_THE_CHEF = "opened by you on this computer";
const HOST = /^(\*\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?)(:[1-9][0-9]{0,4})?$/;

const absolute = (path: string) => posix.isAbsolute(path) || win32.isAbsolute(path);

// Un fichier absent n'a rien gardé ; un fichier illisible (JSON corrompu) se dit, pour que l'écriture ne l'écrase pas.
function readGuards(file: string): Guards {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const readOne = JSON.parse(raw);
  if (typeof readOne !== "object" || readOne === null || Array.isArray(readOne)) throw new Error("the file does not hold an object");
  return readOne;
}

export function readSettingsOfTheStation(file: string, computed: { clone: string; worktrees: string }, withoutBac = false): Settings | Refusal {
  let guards: Guards;
  try {
    guards = readGuards(file);
  } catch (error) {
    return { refus: "the saved folders and hosts could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
  const added = Array.isArray(guards.hotes) ? guards.hotes.filter((h): h is string => typeof h === "string") : [];
  return {
    clones: guards.clones ?? computed.clone,
    worktrees: guards.worktrees ?? computed.worktrees,
    bac: withoutBac ? "off" : "on",
    hotes: [...BASE.map((h) => ({ ...h, ajoute: false })), ...added.filter((h) => !BASE.some((s) => s.hote === h)).map((host) => ({ hote: host, origine: OPEN_PAR_THE_CHEF, ajoute: true }))],
    // Le moteur tel qu'il est gardé — un moteur inconnu se montre tel quel, la vue le dit ; absent, rien n'est choisi.
    ...(typeof guards.engine === "string" ? { engine: guards.engine } : {}),
    fallbackEngine: typeof guards.fallbackEngine === "string" ? guards.fallbackEngine : null,
    apiKey: existsSync(fileOfTheKey(file)),
  };
}

export function writeSettingsOfTheStation(file: string, change: Change): { fait: string } | Refusal {
  let guards: Guards;
  try {
    guards = readGuards(file);
  } catch (error) {
    return { refus: "nothing was changed: the saved file could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
  for (const key of ["clones", "worktrees"] as const) {
    const value = change[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !absolute(value)) return { refus: `the ${key} folder must be an absolute path`, detail: `“${String(value)}” is not one` };
    guards[key] = value;
  }
  if (change.hotes !== undefined) {
    const own: string[] = [];
    for (const raw of change.hotes) {
      const host = String(raw).trim().toLowerCase();
      if (!HOST.test(host)) return { refus: "not a host", detail: `“${host}”: expected a name (registry.npmjs.org), \`*.\` in front for its subdomains, \`:port\` behind for a port other than 443 and 80` };
      if (!own.includes(host)) own.push(host);
    }
    guards.hotes = own;
  }
  // Le moteur et son secours : l'un des trois ; le secours, aucun ou un autre que le moteur.
  if (change.engine !== undefined) {
    if (!isOneEngine(change.engine)) return { refus: "nothing was changed: not an engine", detail: `“${String(change.engine)}”: expected ${ENGINES.join(", ")}` };
    guards.engine = change.engine;
  }
  if (change.fallbackEngine !== undefined) {
    if (change.fallbackEngine !== null && !isOneEngine(change.fallbackEngine)) return { refus: "nothing was changed: not an engine", detail: `“${String(change.fallbackEngine)}”: expected none, or ${ENGINES.join(", ")}` };
    guards.fallbackEngine = change.fallbackEngine;
  }
  if (guards.fallbackEngine != null && guards.fallbackEngine === (guards.engine ?? "claude-subscription")) return { refus: "nothing was changed: the fallback engine must be another engine" };
  if (change.apiKey !== undefined && (typeof change.apiKey !== "string" || !KEY.test(change.apiKey))) return { refus: "nothing was changed: not an API key", detail: "a key is one word of visible characters, with no space" };
  try {
    if (change.apiKey !== undefined) {
      const key = fileOfTheKey(file);
      mkdirSync(dirname(key), { recursive: true });
      ecrireSecret(`${key}.tmp`, change.apiKey);
      chmodSync(`${key}.tmp`, 0o600);
      renameSync(`${key}.tmp`, key);
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(guards, null, 2));
    renameSync(`${file}.tmp`, file);
  } catch (error) {
    return { refus: "nothing was changed", detail: error instanceof Error ? error.message : String(error) };
  }
  return { fait: "saved on this computer" };
}
