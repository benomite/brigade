// The write side of the Agents tab (#4222, epic #4117): each agent's settings, changed from the app, with who changed
// what and when.
//
//   GET /api/agents/:id/settings          {fields: [{key, label, kind, value, source, editable, livesIn?, changedAt, changedBy}]}
//   PUT /api/agents/:id/settings {key, value}   the updated field; 400 with {reason} for a value refused, nothing stored
//
// A value is taken in this order: the one set from the app, then the environment variable, then the default. `env`
// is the environment as the runtime reads it — in the runtime, the chef's decisions and the project's repository
// over the box's variables (decisions.ts, `environnementDecide`). The app's values are kept in one file of the state
// directory, `agent-settings.json`, with their author and instant; an autonomy level is kept where the gate of the
// gestures reads it (autonomie/agents/niveaux.ts), its author and instant here. Every read rereads both files: a
// change holds at the runtime's next read, with no restart.
//
// A missing file is a project where nothing was set from the app. A file that cannot be read — not JSON, or an entry
// without its value, instant and author, or with a value its setting refuses — is refused, by the read and by the
// write: nothing is guessed in its place, and what was set is never overwritten.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { magasinDeNiveaux, type Niveau } from "../autonomie/agents/niveaux.ts";
import { ecrireAtomique } from "../relais.ts";
import { DEFINITIONS, isAgent, refusal, type Agent, type Definition, type Kind } from "./fields.ts";

export type Source = "app" | "env" | "default";
export type Value = string | number | boolean | null;

type Field = {
  key: string;
  label: string;
  kind: Kind;
  value: Value;
  source: Source;
  editable: boolean;
  // Only on a setting that is not editable from the app: where it lives.
  livesIn?: string;
  changedAt: string | null;
  changedBy: string | null;
};

export type Request = { method: string; path: string; body?: unknown; author?: string };
export type Response = { status: number; body: unknown };

export type AgentSettings = {
  handle(request: Request): Promise<Response>;
  // What the runtime reads: the setting's value, app first, then the environment, then the default.
  read(agent: string, key: string): Value;
  // The variables the app's values replace, for the runtime's decisions to overlay.
  overrides(): Record<string, string>;
};

export type Options = {
  stateDir: string;
  env: Record<string, string | undefined>;
  // The project whose autonomy levels are read. By default, `BRIGADE_PROJECT`.
  project?: string;
  now?: () => Date;
};

export class AgentSettingsUnreadable extends Error {}

// A setting the runtime is given either as it was read at its start, or as a reader it calls at each use.
export const current = <T extends object>(setting: T | (() => T)): T => (typeof setting === "function" ? setting() : setting);

type Entry = { value: Value; changedAt: string; changedBy: string };
type Stored = Partial<Record<Agent, Record<string, Entry>>>;

const FILE = "agent-settings.json";
const PATH = /^\/api\/agents\/([^/]+)\/settings$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const reason = (status: number, text: string): Response => ({ status, body: { reason: text } });

export function createAgentSettings({ stateDir, env, project = env.BRIGADE_PROJECT ?? "", now = () => new Date() }: Options): AgentSettings {
  const file = join(stateDir, FILE);
  const levels = magasinDeNiveaux(stateDir);

  function stored(): Stored {
    if (!existsSync(file)) return {};
    let read: unknown;
    try {
      read = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new AgentSettingsUnreadable(`${file} cannot be read: ${(error as Error).message}`);
    }
    if (!isObject(read)) throw new AgentSettingsUnreadable(`${file} is not a JSON object`);
    for (const [agent, entries] of Object.entries(read)) {
      if (!isObject(entries)) throw new AgentSettingsUnreadable(`${file}: the settings of ${agent} are not an object`);
      for (const [key, entry] of Object.entries(entries)) {
        const definition = isAgent(agent) ? DEFINITIONS[agent].find((d) => d.key === key) : undefined;
        const valid = isObject(entry) && typeof entry.changedAt === "string" && typeof entry.changedBy === "string" && (definition === undefined || refusal(definition, entry.value) === null);
        if (!valid) throw new AgentSettingsUnreadable(`${file}: ${agent}/${key} holds ${JSON.stringify(entry)}, which is no setting set from the app`);
      }
    }
    return read as Stored;
  }

  // The environment's value, in the setting's kind.
  function fromEnv(variable: string | undefined, kind: Kind): Value | undefined {
    const raw = variable === undefined ? undefined : env[variable];
    if (raw === undefined || raw === "") return undefined;
    return kind === "integer" || kind === "number" ? Number(raw) : raw;
  }

  function field(agent: Agent, definition: Definition, all: Stored): Field {
    const { key, label, kind } = definition;
    if (definition.livesIn) return { key, label, kind, value: null, source: "default", editable: false, livesIn: definition.livesIn, changedAt: null, changedBy: null };
    const entry = all[agent]?.[key];
    const audit = { changedAt: entry?.changedAt ?? null, changedBy: entry?.changedBy ?? null };
    if (definition.niveau) {
      return { key, label, kind, value: levels.lire(project)[definition.niveau], source: entry === undefined ? "default" : "app", editable: true, ...audit };
    }
    if (entry) return { key, label, kind, value: entry.value, source: "app", editable: true, ...audit };
    const environment = fromEnv(definition.env, kind);
    if (environment === undefined) return { key, label, kind, value: definition.default ?? null, source: "default", editable: true, ...audit };
    return { key, label, kind, value: environment, source: "env", editable: true, ...audit };
  }

  const fields = (agent: Agent) => {
    const all = stored();
    return DEFINITIONS[agent].map((definition) => field(agent, definition, all));
  };

  function put(agent: Agent, body: unknown, author: string | undefined): Response {
    if (!(isObject(body) && typeof body.key === "string" && "value" in body)) return reason(400, "the request body must be {key, value}");
    const definition = DEFINITIONS[agent].find((d) => d.key === body.key);
    if (definition === undefined) return reason(400, `${agent} has no setting ${JSON.stringify(body.key)}: ${DEFINITIONS[agent].map((d) => d.key).join(", ")}`);
    const refused = refusal(definition, body.value);
    if (refused) return reason(400, refused);
    if (definition.livesIn) return reason(400, `${agent}'s ${definition.key} is not editable from the app: it lives in ${definition.livesIn}`);
    if (typeof author !== "string" || author.trim() === "") return reason(400, "the request names no author: a change records who made it");
    const all = stored();
    const value = body.value as Value;
    if (definition.niveau) levels.poser(project, definition.niveau, value as Niveau);
    all[agent] = { ...all[agent], [definition.key]: { value, changedAt: now().toISOString(), changedBy: author } };
    ecrireAtomique(file, `${JSON.stringify(all, null, 2)}\n`);
    return { status: 200, body: field(agent, definition, all) };
  }

  return {
    async handle({ method, path, body, author }) {
      const [, id] = PATH.exec(path) ?? [];
      if (id === undefined) return reason(404, `no such route: ${method} ${path}`);
      const agent = decodeURIComponent(id);
      if (!isAgent(agent)) return reason(404, `no agent ${JSON.stringify(agent)}: ${Object.keys(DEFINITIONS).join(", ")}`);
      try {
        if (method === "GET") return { status: 200, body: { fields: fields(agent) } };
        if (method === "PUT") return put(agent, body, author);
      } catch (error) {
        return reason(500, `the settings of ${agent} cannot be read, nothing is written: ${(error as Error).message}`);
      }
      return reason(405, `${method} is not served on ${path}: GET or PUT`);
    },
    read(agent, key) {
      const definition = isAgent(agent) ? DEFINITIONS[agent].find((d) => d.key === key) : undefined;
      if (!isAgent(agent) || definition === undefined) throw new Error(`no setting ${agent}/${key}`);
      return field(agent, definition, stored()).value;
    },
    overrides() {
      const all = stored();
      const variables: Record<string, string> = {};
      for (const agent of Object.keys(DEFINITIONS) as Agent[]) {
        for (const definition of DEFINITIONS[agent]) {
          const entry = all[agent]?.[definition.key];
          if (definition.env && entry) variables[definition.env] = String(entry.value);
        }
      }
      return variables;
    },
  };
}
