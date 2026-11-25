// The settings of each agent, as the Agents tab shows them (#4222, epic #4117): model, effort, autonomy level, pause,
// and the agent's own limits. Each one is either editable from the app — its value kept by the store (index.ts), over
// the environment variable that held it until now, over its default — or not editable from the app, and then it says
// where it lives (`livesIn`).
//
// An editable setting reaches the runtime one of two ways: through the variable it replaces (`env`), which the
// runtime's decisions overlay with the app's value at each read (decisions.ts, `suivreDecisions`); or through the
// autonomy levels (`niveau`), which the gate of the gestures rereads at each gesture (autonomie/agents/porte.ts).
import { EFFORTS, MODELES } from "../calibrage.ts";
import { SEUIL_DUREE_GATES_PAR_DEFAUT } from "../derive.ts";
import type { Reglable } from "../autonomie/agents/niveaux.ts";

export const AGENTS = ["second", "manager", "cook", "design-cook", "pass", "reviewer", "closer", "supervisor"] as const;
export type Agent = (typeof AGENTS)[number];

export const AUTONOMY_LEVELS = ["observe", "propose", "act"] as const;

export type Kind = "model" | "effort" | "autonomy" | "switch" | "integer" | "number";

// A setting is editable from the app unless it says where it lives (`livesIn`).
export type Definition = { key: string; label: string; kind: Kind; min?: number; livesIn?: string; env?: string; default?: string | number | null; niveau?: Reglable };

// Why a value is refused, or null when it is valid.
export function refusal(definition: Definition, value: unknown): string | null {
  const among = (allowed: readonly string[]) => (typeof value === "string" && allowed.includes(value) ? null : `${definition.key} must be one of ${allowed.join(", ")}, not ${JSON.stringify(value)}`);
  switch (definition.kind) {
    case "model":
      return among(MODELES);
    case "effort":
      return among(EFFORTS);
    case "autonomy":
      return among(AUTONOMY_LEVELS);
    case "switch":
      return typeof value === "boolean" ? null : `${definition.key} must be true or false, not ${JSON.stringify(value)}`;
    case "integer": {
      const min = definition.min ?? 1;
      return typeof value === "number" && Number.isSafeInteger(value) && value >= min ? null : `${definition.key} must be a whole number of ${min} or more, not ${JSON.stringify(value)}`;
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? null : `${definition.key} must be a number greater than zero, not ${JSON.stringify(value)}`;
  }
}

// The same words wherever a setting lives outside the app.
const PAUSE = "the project switch, one for the whole project: `brigade <project> switch off` (or the switch in the app) — nothing new is taken, judged, split or merged; there is no pause for one agent";
const SECOND = "the chef's own Claude Code session, on the chef's computer: the second runs there, not in the runtime";
const COOK_CALIBRATION = (what: string) => `the ${what} label of each ticket: the manager calibrates every ticket, and the chef can replace the label on the ticket`;
const PASS_CALIBRATION = (what: string) => `the reviewer's ${what}: the pass runs no model of its own, its reviews run on the reviewer's settings`;
const SUPERVISOR_CALIBRATION = (what: string) => `the manager's ${what}: the supervisor runs no model of its own, it wakes the manager`;

const calibration = (role: "MANAGER" | "REVIEWER", effortLabel: string, modelLabel: string): Definition[] => [
  // The runtime has no default calibration of its own — it refuses to start without one; these are what the tab shows
  // when neither the app nor the box sets them: the runtime's default ceiling of calibration (reagir.ts).
  { key: "model", label: modelLabel, kind: "model", env: `BRIGADE_${role}_MODEL`, default: "opus" },
  { key: "effort", label: effortLabel, kind: "effort", env: `BRIGADE_${role}_EFFORT`, default: "high" },
];
const pause: Definition = { key: "pause", label: "Pause", kind: "switch", livesIn: PAUSE };
const autonomy = (niveau: Reglable): Definition => ({ key: "autonomy", label: "Autonomy level", kind: "autonomy", niveau });
const fixed = (key: "model" | "effort", livesIn: string): Definition => ({ key, label: key === "model" ? "Model" : "Effort", kind: key, livesIn });

export const DEFINITIONS: Readonly<Record<Agent, readonly Definition[]>> = {
  second: [fixed("model", SECOND), fixed("effort", SECOND), { key: "autonomy", label: "Autonomy level", kind: "autonomy", livesIn: SECOND }, { ...pause, livesIn: SECOND }],
  manager: [
    ...calibration("MANAGER", "Effort of its judgments", "Model of its judgments"),
    autonomy("manager"),
    { key: "splitEpicAutonomy", label: "Autonomy level when splitting an epic", kind: "autonomy", niveau: "manager split-epic" },
    pause,
  ],
  cook: [
    fixed("model", COOK_CALIBRATION("model")),
    fixed("effort", COOK_CALIBRATION("effort")),
    autonomy("cook"),
    pause,
    { key: "places", label: "Places (cooks at once)", kind: "integer", min: 0, livesIn: "each station's configuration, on its own machine: `brigade <project> station cooks <N>` — a machine setting, never the project's" },
  ],
  "design-cook": [
    fixed("model", COOK_CALIBRATION("model")),
    fixed("effort", COOK_CALIBRATION("effort")),
    { key: "autonomy", label: "Autonomy level", kind: "autonomy", livesIn: "the cooks' autonomy level (agent cook): every cook shares one level" },
    pause,
  ],
  pass: [fixed("model", PASS_CALIBRATION("model")), fixed("effort", PASS_CALIBRATION("effort")), autonomy("pass"), pause],
  reviewer: [
    ...calibration("REVIEWER", "Effort of its reviews", "Model of its reviews"),
    { key: "autonomy", label: "Autonomy level", kind: "autonomy", livesIn: "the pass's autonomy level (agent pass): the reviewer reviews for the pass" },
    pause,
  ],
  closer: [
    fixed("model", "the closer's calibration: `closer.calibration` in the project's .claude/brigade/projet.json, else `brigade <project> station closer-modele <model>`"),
    fixed("effort", "the closer's calibration: `closer.calibration` in the project's .claude/brigade/projet.json, else `brigade <project> station closer-effort <effort>`"),
    autonomy("closer"),
    pause,
    // The drift thresholds the closer's pass checks (closer-github-passe), read at each pass (derive.ts, `lireSeuils`).
    { key: "driftTicketTokens", label: "Drift: tokens of the most expensive ticket", kind: "integer", env: "BRIGADE_DRIFT_TICKET_TOKENS", default: null },
    { key: "driftLostTokens", label: "Drift: lost tokens", kind: "integer", env: "BRIGADE_DRIFT_LOST_TOKENS", default: null },
    { key: "driftGatesSeconds", label: "Drift: duration of the gates, in seconds", kind: "number", env: "BRIGADE_DRIFT_GATES_SECONDS", default: SEUIL_DUREE_GATES_PAR_DEFAUT },
  ],
  supervisor: [fixed("model", SUPERVISOR_CALIBRATION("model")), fixed("effort", SUPERVISOR_CALIBRATION("effort")), autonomy("supervisor"), pause],
};

export const isAgent = (id: string): id is Agent => (AGENTS as readonly string[]).includes(id);
