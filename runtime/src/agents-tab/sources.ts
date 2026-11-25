// What the Agents tab reads (#4220), for `npm run agents` (agents-cli.ts): the runs of the log (`cook_runs`) — which
// agent each is of, the ticket it works on, how it ended —, what runs outside the tickets as `facts` gives it (the pass,
// the manager, the triage and the closer, agents-en-cours.ts), the gesture log and the noted schedules of the state
// directory.
import type { AgentEnCours } from "../agents-en-cours.ts";
import { LectureImpossible } from "../appel.ts";
import { horaireDe } from "../autonomie/agents/horaires.ts";
import { lireLesFaits } from "../faits.ts";
import { ouvrirJournal } from "../journal.ts";
import type { Sources } from "./api.ts";

// A run of the log: `ending` is null while it goes on.
type RunDuJournal = { run: string; ticket: number | null; station: string | null; ending: string | null };

// The endings of a run that failed (events/guardrails.ts, `Issue`): it died, a guardrail stopped it, or it stalled.
// A launch the station refused, or one the chef stopped, is no failure of the agent.
const ECHECS = new Set(["failed", "guard", "stalled"]);
// What `facts` already says with the ticket it works on, read from the run's name (agents-en-cours.ts).
const HORS_TICKET = new Set(["manager", "triage", "closer"]);

// The agent a run is of: the manager, the closer and the reviewer launch under their own station (manager.ts,
// closing/run.ts, reviewer.ts), the triage with the manager's under the prefix `trie` (agents-en-cours.ts); every other
// run is a cook's.
const SOUS_SON_NOM = ["closer", "reviewer"];
const agentDuRun = ({ run, station }: RunDuJournal): string =>
  station === "manager" ? (run.startsWith("trie-") ? "triage" : "manager") : SOUS_SON_NOM.includes(station ?? "") ? (station as string) : "cook";

// The agents whose last run failed, the runs the oldest first: a run launched after it — a retry — clears it.
function enEchec(runs: readonly RunDuJournal[]): string[] {
  const dernieres = new Map<string, string | null>();
  for (const run of runs) dernieres.set(agentDuRun(run), run.ending);
  return [...dernieres].flatMap(([id, ending]) => (ECHECS.has(ending ?? "") ? [id] : []));
}

// The runs going on, by agent: `agents` as `facts` gives them, then the cooks' and the reviewer's runs of the log.
function enCours(agents: ReadonlyArray<Pick<AgentEnCours, "role" | "ticket">>, runs: readonly RunDuJournal[]): Array<{ id: string; ticket: number | null }> {
  const duJournal = runs.flatMap((run) => (run.ending === null && !HORS_TICKET.has(agentDuRun(run)) ? [{ id: agentDuRun(run), ticket: run.ticket }] : []));
  return [...agents.map(({ role, ticket }) => ({ id: role, ticket })), ...duJournal];
}

export function sourcesDuProjet(env: Record<string, string | undefined>, maintenant: Date): Sources {
  const repertoire = env.BRIGADE_STATE_DIR ?? "";
  // Read only: a state directory with no log is said, never given one.
  let journal;
  try {
    journal = ouvrirJournal(repertoire, { lectureSeule: true });
  } catch (erreur) {
    throw new LectureImpossible(1, (erreur as Error).message);
  }
  let runs;
  try {
    runs = journal.base.lire<RunDuJournal>("SELECT run, ticket, station, ending FROM cook_runs ORDER BY launched_seq");
  } finally {
    journal.fermer();
  }
  const { agents } = lireLesFaits(env, maintenant) as { agents: AgentEnCours[] };
  return { maintenant, repertoireDesGestes: repertoire, enCours: enCours(agents, runs), enEchec: enEchec(runs), horaires: (id) => horaireDe(repertoire, id) };
}
