// What the Agents tab reads (#4220), for `npm run agents` (agents-cli.ts): the runs of the log (`cook_runs`) — which
// agent each is of, the ticket it works on, how it ended —, the pass at work as `facts` gives it (agents-en-cours.ts),
// the closing passes that ended, the gesture log and the noted schedules of the state directory.
import { createAgentSettings } from "../agent-settings/index.ts";
import { agentDuRun as lireLeRunHorsTicket, type AgentEnCours } from "../agents-en-cours.ts";
import { LectureImpossible } from "../appel.ts";
import { horaireDe } from "../autonomie/agents/horaires.ts";
import { environnementDecide, lireLesDecisions } from "../decisions.ts";
import { lireLesFaits } from "../faits.ts";
import { ouvrirJournal } from "../journal.ts";
import { reglagesPourMontrer } from "../reglages-projet/en-vigueur.ts";
import type { Sources } from "./api.ts";
import { REGISTRE } from "./registre.ts";

// A run of the log: `ending` is null while it goes on.
type RunDuJournal = { run: string; ticket: number | null; station: string | null; ending: string | null };

// The endings of a run that failed (events/guardrails.ts, `Issue`): it died, a guardrail stopped it, or it stalled.
// A launch the station refused, or one the chef stopped, is no failure of the agent.
const ECHECS = new Set(["failed", "guard", "stalled"]);
// The last closing passes read; the figure keeps those of the last 7 days.
const PASSES_LUES = 100;

// The agent a run is of: the manager, the closer and the reviewer launch under their own station (manager.ts,
// closing/run.ts, reviewer.ts); under the manager's, the prefix of the run says who asked (manager.ts, `demander`):
// the triage (`trie`), the supervisor (`supervise`, and `controle` for its breaker check, manager/supervision.ts), the
// manager for every other. Every other run is a cook's.
const SOUS_SON_NOM = ["closer", "reviewer"];
const DU_SUPERVISEUR = /^(supervise|controle)-/;
const agentDuRun = ({ run, station }: RunDuJournal): string => {
  if (station === "manager") return run.startsWith("trie-") ? "triage" : DU_SUPERVISEUR.test(run) ? "supervisor" : "manager";
  return SOUS_SON_NOM.includes(station ?? "") ? (station as string) : "cook";
};

// The agents whose last run failed, the runs the oldest first: a run launched after it — a retry — clears it.
function enEchec(runs: readonly RunDuJournal[]): string[] {
  const dernieres = new Map<string, string | null>();
  for (const run of runs) dernieres.set(agentDuRun(run), run.ending);
  return [...dernieres].flatMap(([id, ending]) => (ECHECS.has(ending ?? "") ? [id] : []));
}

// The runs going on, by agent: the pass as `facts` gives it, then the runs of the log that have not ended — a run
// under the manager's station on the ticket its name says (agents-en-cours.ts), every other on the ticket of the log.
function enCours(agents: ReadonlyArray<Pick<AgentEnCours, "role" | "ticket">>, runs: readonly RunDuJournal[]): Array<{ id: string; ticket: number | null }> {
  const pass = agents.flatMap(({ role, ticket }) => (role === "pass" ? [{ id: role, ticket }] : []));
  const duJournal = runs.filter(({ ending }) => ending === null).map((run) => {
    const ticket = run.station === "manager" ? lireLeRunHorsTicket({ run: run.run, station: run.station, launchedAt: "" }).ticket : run.ticket;
    return { id: agentDuRun(run), ticket };
  });
  return [...pass, ...duJournal];
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
  let runs, passesDuCloser;
  try {
    runs = journal.base.lire<RunDuJournal>("SELECT run, ticket, station, ending FROM cook_runs ORDER BY launched_seq");
    // A pass ended before the tally existed carries no `removedLines`: it removed nothing that was counted.
    passesDuCloser = journal.duType("closing.ended", PASSES_LUES).map(({ at, payload }) => ({ at, removedLines: payload.removedLines ?? 0 }));
  } finally {
    journal.fermer();
  }
  const { agents } = lireLesFaits(env, maintenant) as { agents: AgentEnCours[] };
  return { maintenant, repertoireDesGestes: repertoire, enCours: enCours(agents, runs), enEchec: enEchec(runs), passesDuCloser, horaires: (id) => horaireDe(repertoire, id) };
}

// Each agent's settings as `GET /api/agents/:id/settings` serves them (#4222), read as the `agent-settings` command
// reads them (agent-settings/commande.ts): its body, untouched — a settings file that cannot be read is the route's
// `{reason}` —, and no entry for an agent the route holds no settings for (404).
export async function reglagesDuProjet(env: Record<string, string | undefined>): Promise<Record<string, unknown>> {
  const stateDir = env.BRIGADE_STATE_DIR ?? "";
  const settings = createAgentSettings({ stateDir, env: environnementDecide(env, lireLesDecisions(stateDir).posees, reglagesPourMontrer(env)) });
  const lus = await Promise.all(REGISTRE.map(async ({ id }) => [id, await settings.handle({ method: "GET", path: `/api/agents/${id}/settings` })] as const));
  return Object.fromEntries(lus.flatMap(([id, { status, body }]) => (status === 404 ? [] : [[id, body]])));
}
