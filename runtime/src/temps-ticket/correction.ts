// One correction ticket when the median total of the last measured tickets goes over the
// project's max (#2345, epic #2336). Called after each recorded merge.
//
// Self-contained: it reads `.claude/brigade/temps-tickets.json` and `.claude/brigade/projet.json`
// itself, and creates the ticket through a GitHub client the caller wires to the rail.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const CORRECTION_LABEL = "correction";
export const DEFAULT_MAX_MINUTES = 15;
export const WINDOW = 10;

export const PHASES = ["cuisson", "attentePasse", "revue", "ci", "merge"] as const;
export type Phase = (typeof PHASES)[number];

export type TimeRecord = {
  ticket: number;
  claimedAt: string;
  mergedAt: string;
  cuisson: number;
  cuissonTests: number;
  attentePasse: number;
  revue: number;
  ci: number;
  merge: number;
};

export type RailIssue = { number: number; title: string; body: string; state: "open" | "closed" };

// What this module needs of the rail. The caller wires it to the real one.
export type RailClient = {
  listIssues(query: { label: string }): Promise<RailIssue[]>;
  createIssue(issue: { title: string; body: string; labels: string[] }): Promise<{ number: number }>;
};

// What `nommerLePlusLent` (lenteur/nommer.ts, #2350) returns; null when nothing was measured.
export type PlusLent = { partie: string; phrase: string; chiffres: { mediane: number; impact: number; mesures: number } };
export type Nommer = (projet: string) => PlusLent | null;

// The real naming lives in lenteur/nommer.ts, loaded on demand; if it is not there, nothing is named.
async function nommerParDefaut(projet: string): Promise<PlusLent | null> {
  try {
    const chemin = "../lenteur/nommer.ts"; // a variable: the type check does not need the module to exist
    const module = (await import(chemin)) as { nommerLePlusLent: Nommer };
    return module.nommerLePlusLent(projet);
  } catch {
    return null;
  }
}

export type Decision =
  | { action: "none"; reason: "no-records" | "under-max" | "already-open"; number?: number }
  | { action: "opened"; number: number; phase: Phase };

const MARKER = "<!-- brigade:temps-ticket-correction -->";

const PHASE_NAMES: Record<Phase, string> = {
  cuisson: "cooking",
  attentePasse: "waiting for the pass",
  revue: "review",
  ci: "CI",
  merge: "merge",
};

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Total of one ticket: claim to merge when both dates read, else the sum of its phases.
function totalSeconds(record: TimeRecord): number {
  const span = (Date.parse(record.mergedAt) - Date.parse(record.claimedAt)) / 1000;
  if (Number.isFinite(span) && span >= 0) return span;
  return PHASES.reduce((sum, phase) => sum + record[phase], 0);
}

export type Measure = { medianTotal: number; phaseMedians: Record<Phase, number>; slowest: Phase; count: number };

export function measure(records: TimeRecord[]): Measure | null {
  const last = [...records].sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt)).slice(-WINDOW);
  if (last.length === 0) return null;
  const phaseMedians = Object.fromEntries(PHASES.map((phase) => [phase, median(last.map((r) => r[phase]))])) as Record<Phase, number>;
  // Ties go to the earlier phase in the order of a ticket's life.
  const slowest = PHASES.reduce((best, phase) => (phaseMedians[phase] > phaseMedians[best] ? phase : best), PHASES[0]);
  return { medianTotal: median(last.map(totalSeconds)), phaseMedians, slowest, count: last.length };
}

const minutes = (seconds: number) => `${Math.round((seconds / 60) * 10) / 10} min`;

function slowestPartLines(plusLent: PlusLent | null): string[] {
  if (plusLent === null) return ["Slowest part: no duration was recorded yet."];
  return [`Slowest part: ${plusLent.phrase} (${plusLent.chiffres.mesures} runs)`];
}

export function correctionTicket(m: Measure, maxMinutes: number, plusLent: PlusLent | null = null): { title: string; body: string } {
  const name = PHASE_NAMES[m.slowest];
  const title = `Tickets are too slow: ${name} is the slowest phase (median ${minutes(m.phaseMedians[m.slowest])})`;
  const body = [
    MARKER,
    `The median total of the last ${m.count} measured tickets is ${minutes(m.medianTotal)}, over the project's max of ${maxMinutes} min.`,
    "",
    `The slowest phase is **${name}**, with a median of ${minutes(m.phaseMedians[m.slowest])}.`,
    "",
    "Median per phase:",
    ...PHASES.map((phase) => `- ${PHASE_NAMES[phase]}: ${minutes(m.phaseMedians[phase])}`),
    "",
    ...slowestPartLines(plusLent),
    "",
    `Max: ${maxMinutes} min (\`tempsMaxTicketMin\` in \`.claude/brigade/projet.json\`).`,
    "",
    `Correct the cause in ${name} so the median goes back under the max.`,
  ].join("\n");
  return { title, body };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export async function readRecords(repoDir: string): Promise<TimeRecord[]> {
  const data = await readJson(join(repoDir, ".claude/brigade/temps-tickets.json"));
  const list = Array.isArray(data) ? data : [];
  return list.filter(
    (r): r is TimeRecord => typeof r === "object" && r !== null && PHASES.every((p) => Number.isFinite((r as TimeRecord)[p])) && typeof (r as TimeRecord).mergedAt === "string",
  );
}

export async function readMaxMinutes(repoDir: string): Promise<number> {
  const data = (await readJson(join(repoDir, ".claude/brigade/projet.json"))) as { tempsMaxTicketMin?: unknown } | undefined;
  const max = data?.tempsMaxTicketMin;
  return typeof max === "number" && Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_MINUTES;
}

// Check after each recorded merge. At most one correction ticket is open at a time.
export async function checkMedian(repoDir: string, rail: RailClient, nommer: Nommer | ((projet: string) => Promise<PlusLent | null>) = nommerParDefaut): Promise<Decision> {
  const m = measure(await readRecords(repoDir));
  if (m === null) return { action: "none", reason: "no-records" };
  const maxMinutes = await readMaxMinutes(repoDir);
  if (m.medianTotal <= maxMinutes * 60) return { action: "none", reason: "under-max" };
  const issues = await rail.listIssues({ label: CORRECTION_LABEL });
  const open = issues.filter((i) => i.state === "open" && i.body.includes(MARKER)).sort((a, b) => a.number - b.number)[0];
  if (open !== undefined) return { action: "none", reason: "already-open", number: open.number };
  const { title, body } = correctionTicket(m, maxMinutes, await nommer(repoDir));
  const created = await rail.createIssue({ title, body, labels: [CORRECTION_LABEL] });
  return { action: "opened", number: created.number, phase: m.slowest };
}
