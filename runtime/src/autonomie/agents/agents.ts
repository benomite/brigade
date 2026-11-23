// One record per agent of a project (spec 2026-11-23-autonomy-trust-control, C1 and C2, #4036): the manager, the
// supervisor, the closer, the pass, then each cook — who it is, its state, its last gesture, its next run, its thread
// and its autonomy level. `facts` gives them in `equipe`.
//
// Built from what is already read, never read again: what runs outside the tickets (agents-en-cours.ts), the cooks
// of the stations, each role's last action (roles-cuisine/roles.ts), the levels (niveaux.ts) and each agent's gesture
// log (gestes.ts), which gives its counters, its gestures and, when it is later than its roles' last action, its last
// gesture — and each agent's next run, from the schedules the runtime noted (horaires.ts) and a clock, both handed in
// (prochain-passage.ts, #4038).
import type { AgentEnCours } from "../../agents-en-cours.ts";
import type { DerniereAction, RoleDeCuisine } from "../../roles-cuisine/roles.ts";
import type { EnregistrementDeGestes, Geste } from "./gestes.ts";
import type { Niveau, Niveaux } from "./niveaux.ts";
import { HoraireIllisible, prochainPassage, type Horaire, type ProchainPassage } from "./prochain-passage.ts";

type FicheDAgent = {
  agent: string;
  // `idle`, `working on #N`, or `working` for a run on no ticket.
  state: string;
  lastGesture: { line: string; at: string } | null;
  // Null when the reader gave no schedules.
  nextRun: ProchainPassage | null;
  // The name its thread's lines start with: « Supervisor · 17:01 · … ».
  thread: string;
  autonomy: Niveau;
  // The gestures whose level differs from the agent's own: the manager's splitting of an epic.
  exceptions: Record<string, Niveau>;
  counters: { fixedBySelf: number; handedToChef: number };
  gestures: Geste[];
};

const AGENTS = ["manager", "supervisor", "closer", "pass"] as const;
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
  // Each agent's gesture log, by its name (`supervisor`, `cook #12`).
  gestes: (agent: string) => Pick<EnregistrementDeGestes, "lastGesture" | "counters" | "gestures">;
  // Each agent's schedule as the runtime noted it (`horaireDe`), read at `maintenant`.
  horaires?: { maintenant: Date; de: (agent: string) => Horaire | undefined };
};

const etatDe = (tickets: ReadonlyArray<number | null>): string => {
  if (tickets.length === 0) return "idle";
  const numeros = tickets.flatMap((ticket) => (ticket === null ? [] : [ticket]));
  return numeros.length === 0 ? "working" : `working on ${numeros.map((ticket) => `#${ticket}`).join(", ")}`;
};

export function equipeDuProjet({ agents, cooks, roles, niveaux, gestes, horaires }: SourcesDeLEquipe): FicheDAgent[] {
  // A schedule never noted, or one that cannot be read, is said as such: never as « no schedule ».
  const prochain = (agent: string): ProchainPassage | null => {
    if (horaires === undefined) return null;
    try {
      const horaire = horaires.de(agent);
      return horaire === undefined ? { text: `${agent}: next run not known yet`, at: null } : prochainPassage(agent, horaires.maintenant, horaire);
    } catch (erreur) {
      if (!(erreur instanceof HoraireIllisible)) throw erreur;
      return { text: `${agent}: next run cannot be read — ${erreur.message}`, at: null };
    }
  };
  // What the agent's log gives its record; its last gesture is the later of the log's last entry and `actions`.
  const duJournal = (agent: string, actions: readonly DerniereAction[]) => {
    const { lastGesture: geste, counters, gestures } = gestes(agent);
    const candidats = geste === undefined ? actions : [...actions, { what: geste.line, at: geste.at }];
    const latest = candidats.reduce<Pick<DerniereAction, "what" | "at"> | null>((plusTard, une) => (plusTard === null || une.at > plusTard.at ? une : plusTard), null);
    return { lastGesture: latest === null ? null : { line: latest.what, at: latest.at }, nextRun: prochain(agent), counters, gestures };
  };
  const fixes = AGENTS.map((agent): FicheDAgent => {
    const actions = roles.filter(({ role }) => ROLES_DE[agent].includes(role)).flatMap(({ latest }) => (latest === null ? [] : [latest]));
    const { lastGesture, ...journal } = duJournal(agent, actions);
    return {
      agent,
      state: etatDe(agents.filter(({ role }) => role === agent).map(({ ticket }) => ticket)),
      lastGesture,
      thread: FILS[agent],
      autonomy: niveaux[agent],
      exceptions: agent === "manager" ? { "split-epic": niveaux["manager split-epic"] } : {},
      ...journal,
    };
  });
  const cuisiniers = cooks.map(({ ticket }): FicheDAgent => {
    const { lastGesture, ...journal } = duJournal(`cook #${ticket}`, []);
    return { agent: `cook #${ticket}`, state: etatDe([ticket]), lastGesture, thread: `Cook #${ticket}`, autonomy: niveaux.cook, exceptions: {}, ...journal };
  });
  return [...fixes, ...cuisiniers];
}
