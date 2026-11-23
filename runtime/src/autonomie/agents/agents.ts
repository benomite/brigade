// One record per agent of a project (spec 2026-11-23-autonomy-trust-control, C1 and C2, #4036): the manager, the
// supervisor, the closer, the pass, then each cook — who it is, its state, its last gesture, its next run, its thread
// and its autonomy level. `facts` gives them in `equipe`; `autonomy` shows them and sets a level.
//
// Built from what is already read, never read again: what runs outside the tickets (agents-en-cours.ts), the cooks
// of the stations, each role's last action (roles-cuisine/roles.ts), and the levels (niveaux.ts). The next run, the
// counters and the gestures of a thread are not read yet: they start empty — no next run, zero, no gesture.
import type { AgentEnCours } from "../../agents-en-cours.ts";
import type { DerniereAction, RoleDeCuisine } from "../../roles-cuisine/roles.ts";
import type { Niveau, Niveaux } from "./niveaux.ts";

export type GesteDAgent = { at: string; line: string; reason: string; outcome: string };
export type FicheDAgent = {
  agent: string;
  // `idle`, `working on #N`, or `working` for a run on no ticket.
  state: string;
  lastGesture: { line: string; at: string } | null;
  nextRun: { text: string; at: string } | null;
  // The name its thread's lines start with: « Supervisor · 17:01 · … ».
  thread: string;
  autonomy: Niveau;
  // The gestures whose level differs from the agent's own: the manager's splitting of an epic.
  exceptions: Record<string, Niveau>;
  counters: { fixedBySelf: number; handedToChef: number };
  gestures: GesteDAgent[];
};

export const AGENTS = ["manager", "supervisor", "closer", "pass"] as const;
const FILS: Record<(typeof AGENTS)[number], string> = { manager: "Manager", supervisor: "Supervisor", closer: "Closer", pass: "Pass" };
// The roles of roles-cuisine/roles.ts whose last action is the agent's: the reviewer and the second judge are the
// pass. The supervisor writes none of them yet.
const ROLES_DE: Record<(typeof AGENTS)[number], readonly string[]> = { manager: ["manager"], supervisor: [], closer: ["closer"], pass: ["reviewer", "second judge"] };

export type SourcesDeLEquipe = {
  // What runs outside the tickets, as `facts` gives it in `agents`.
  agents: ReadonlyArray<Pick<AgentEnCours, "role" | "ticket">>;
  // The cooks running, as `facts` gives them in `cooks`.
  cooks: ReadonlyArray<{ ticket: number }>;
  // Each role's last action, as `facts` gives it in `rolesCuisine`.
  roles: readonly RoleDeCuisine[];
  niveaux: Niveaux;
};

const etatDe = (tickets: ReadonlyArray<number | null>): string => {
  if (tickets.length === 0) return "idle";
  const numeros = tickets.flatMap((ticket) => (ticket === null ? [] : [ticket]));
  return numeros.length === 0 ? "working" : `working on ${numeros.map((ticket) => `#${ticket}`).join(", ")}`;
};

const neutre = () => ({ nextRun: null, counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [] });

export function equipeDuProjet({ agents, cooks, roles, niveaux }: SourcesDeLEquipe): FicheDAgent[] {
  const fixes = AGENTS.map((agent): FicheDAgent => {
    const latest = roles
      .filter(({ role }) => ROLES_DE[agent].includes(role))
      .flatMap(({ latest }) => (latest === null ? [] : [latest]))
      .reduce<DerniereAction | null>((plusTard, une) => (plusTard === null || une.at > plusTard.at ? une : plusTard), null);
    return {
      agent,
      state: etatDe(agents.filter(({ role }) => role === agent).map(({ ticket }) => ticket)),
      lastGesture: latest === null ? null : { line: latest.what, at: latest.at },
      thread: FILS[agent],
      autonomy: niveaux[agent],
      exceptions: agent === "manager" ? { "split-epic": niveaux["manager split-epic"] } : {},
      ...neutre(),
    };
  });
  const cuisiniers = cooks.map(({ ticket }): FicheDAgent => ({
    agent: `cook #${ticket}`,
    state: etatDe([ticket]),
    lastGesture: null,
    thread: `Cook #${ticket}`,
    autonomy: niveaux.cook,
    exceptions: {},
    ...neutre(),
  }));
  return [...fixes, ...cuisiniers];
}
