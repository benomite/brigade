// The next run of each agent (spec 2026-11-23-autonomy-trust-control, C1, #4038): the text its badge shows — « closer:
// next pass in 3 h », « supervisor: wakes if nothing is merged by 18:40 » — and its time, built from the agent's real
// schedule and a clock, both handed in. Pure: no file, no timer, no process.
//
// The schedules are those the runtime already keeps: the supervisor wakes when nothing was merged 30 min after a ticket
// became cookable or after the last merge (`echeanceSansMerge`, superviseur/declencheur.ts); the closer opens a pass
// at most a day after the last one, once its merges are in (`prochainePasse`, closer-github-passe/closer-github-passe.ts).
// The runtime notes them in the state directory (horaires.ts), where `facts` reads them back. The manager, the pass and
// the cooks keep no schedule: they run when a ticket calls them.

// When the agent runs next; null when nothing is scheduled.
export type Horaire = { at: Date } | null;
export type ProchainPassage = { text: string; at: string | null };

// A noted schedule that cannot be read: the record says so, never « no schedule ».
export class HoraireIllisible extends Error {}

// What an agent with no schedule does instead, by kind.
const SANS_HORAIRE: Record<string, string> = {
  manager: "runs when a ticket or the supervisor calls it",
  supervisor: "no wake scheduled",
  closer: "no pass scheduled",
  pass: "reviews each delivery as it comes",
  cook: "works until it delivers",
};

const HEURE_MS = 3_600_000;
const deux = (n: number) => String(n).padStart(2, "0");
// The station's clock time, as the chef reads it.
const heure = (instant: Date) => `${deux(instant.getHours())}:${deux(instant.getMinutes())}`;
const duree = (ms: number) => (ms < HEURE_MS ? `${Math.max(1, Math.ceil(ms / 60_000))} min` : `${Math.round(ms / HEURE_MS)} h`);

export function prochainPassage(agent: string, maintenant: Date, horaire: { at: Date }): { text: string; at: string };
export function prochainPassage(agent: string, maintenant: Date, horaire: Horaire): ProchainPassage;
export function prochainPassage(agent: string, maintenant: Date, horaire: Horaire): ProchainPassage {
  const genre = agent.startsWith("cook") ? "cook" : agent;
  if (horaire === null) return { text: `${agent}: ${SANS_HORAIRE[genre] ?? "no run scheduled"}`, at: null };
  const at = horaire.at.toISOString();
  if (genre === "supervisor") return { text: `${agent}: wakes if nothing is merged by ${heure(horaire.at)}`, at };
  const reste = horaire.at.getTime() - maintenant.getTime();
  // The closer's day is over: what it waits for now is its merges.
  if (reste <= 0) return { text: genre === "closer" ? `${agent}: next pass once its merges are in` : `${agent}: next run due now`, at };
  return { text: `${agent}: next ${genre === "closer" ? "pass" : "run"} in ${duree(reste)}`, at };
}
