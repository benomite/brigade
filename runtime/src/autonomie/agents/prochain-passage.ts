// The next run of each agent (spec 2026-11-23-autonomy-trust-control, C1, #4038): the text its badge shows — « closer:
// next pass in 3 h », « supervisor: wakes if nothing is merged by 18:40 » — and its time, built from the agent's real
// schedule and a clock, both handed in.
//
// The schedules are those the runtime already keeps: the supervisor wakes when nothing was merged 30 min after a ticket
// became cookable or after the last merge (`echeanceSansMerge`, superviseur/declencheur.ts); the closer opens a pass
// at most a day after the last one, once `MERGES_PER_PASS` merges are in (`prochainePasse`,
// closer-github-passe/closer-github-passe.ts). The runtime notes each one in the state directory as it reads it, one
// file per agent, and `facts` reads them back: it runs in another process. The manager, the pass and the cooks keep no
// schedule: they run when a ticket calls them.
//
// A missing file is a schedule not noted yet: the runtime has not read it. A file that cannot be read is refused,
// never read as « no schedule »: the record says so.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MERGES_PER_PASS } from "../../closer-github-passe/closer-github-passe.ts";
import { ecrireAtomique } from "../../relais.ts";

// When the agent runs next; null when nothing is scheduled.
export type Horaire = { at: Date } | null;
export type ProchainPassage = { text: string; at: string | null };

// The agents that keep a schedule.
const A_HORAIRE = ["supervisor", "closer"] as const;
export type AgentAHoraire = (typeof A_HORAIRE)[number];

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
  if (reste <= 0) return { text: genre === "closer" ? `${agent}: next pass once ${MERGES_PER_PASS} merges are in` : `${agent}: next run due now`, at };
  return { text: `${agent}: next ${genre === "closer" ? "pass" : "run"} in ${duree(reste)}`, at };
}

export class HoraireIllisible extends Error {}

const fichierDe = (repertoire: string, agent: AgentAHoraire) => join(repertoire, `autonomy-next-run-${agent}.json`);

// Notes the agent's schedule as the runtime just read it.
export function noterHoraire(repertoire: string, agent: AgentAHoraire, at: Date | null): void {
  ecrireAtomique(fichierDe(repertoire, agent), `${JSON.stringify({ at: at === null ? null : at.toISOString() })}\n`);
}

// The agent's schedule as the runtime last noted it: null for an agent that keeps none, `undefined` when it was never
// noted.
export function horaireDe(repertoire: string, agent: string): Horaire | undefined {
  if (!(A_HORAIRE as readonly string[]).includes(agent)) return null;
  const fichier = fichierDe(repertoire, agent as AgentAHoraire);
  if (!existsSync(fichier)) return undefined;
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new HoraireIllisible(`${fichier} cannot be read: ${(erreur as Error).message}`);
  }
  const at = typeof lu === "object" && lu !== null ? (lu as { at?: unknown }).at : undefined;
  if (at === null) return null;
  if (typeof at === "string" && !Number.isNaN(Date.parse(at))) return { at: new Date(at) };
  throw new HoraireIllisible(`${fichier} holds no {at}: an instant or null`);
}
