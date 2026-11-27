// What the kitchen tells its agents, and what it takes back from them. The
// behaviour lives in `agents/kitchen/<role>.md`; this file only assembles the
// input and applies the few gestures an agent may ask for.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LABELS, type Issue } from "./decide.ts";
import { ACCEPTED, type Gestures } from "./github.ts";
import type { Run } from "./runs.ts";

export type Prompts = { dir: string };
// Next to the runtime in a station's package, at the repository's root in a clone.
const DEFAULT_DIR = [join(import.meta.dirname, "..", "..", "agents", "kitchen"), join(import.meta.dirname, "..", "..", "..", "agents", "kitchen")].find((dir) => existsSync(dir)) ?? "";

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{\{(\w+)\}\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

export function prompts(options: Prompts = { dir: DEFAULT_DIR }) {
  // Read at each launch: a prompt changed on the base branch acts at the next agent.
  const role = (name: string, values: Record<string, string | number> = {}) => fill(readFileSync(join(options.dir, `${name}.md`), "utf8"), values);
  return {
    cook: (input: { issue: number; base: string; worktree: string; ticket: string }) => [role("cook", input), "# Ton ticket", input.ticket].join("\n\n"),
    pass: (input: { issue: number; base: string; pr: number; ticket: string }) => [role("pass", input), `# Le ticket de la PR #${input.pr}`, input.ticket].join("\n\n"),
    manager: (input: { tickets: string[] }) => [role("manager"), "# Les prochains tickets", ...input.tickets].join("\n\n"),
    supervisor: (input: { issues: Issue[]; running: Run[]; now: number }) =>
      [
        role("supervisor"), "# Les tickets ouverts",
        input.issues.map((issue) => `#${issue.number} [${issue.labels.join(", ")}] ${issue.title}`).join("\n"), "# Les agents qui tournent",
        input.running.map((run) => `${run.name} depuis ${Math.round((input.now - run.started) / 60_000)} min, dernière activité il y a ${lastActivity(run, input.now)} min`).join("\n") || "aucun",
      ].join("\n\n"),
  };
}

// Minutes since the agent last wrote to its stream: a long run that still writes is working, not stuck.
const lastActivity = (run: Run, now: number): number => {
  const stream = join(run.dir, "stream.jsonl");
  return Math.round((now - (existsSync(stream) ? statSync(stream).mtimeMs : run.started)) / 60_000);
};

export type Verdict = { merge: true } | { merge: false; reason: string };

export function parseVerdict(result: string): Verdict | null {
  const last = result.trim().split("\n").filter((line) => line.trim().startsWith("VERDICT:")).at(-1)?.trim();
  if (last === undefined) return null;
  if (/^VERDICT:\s*merge\b/i.test(last)) return { merge: true };
  const refused = /^VERDICT:\s*refuse\b\s*[—:-]?\s*(.*)$/i.exec(last);
  if (refused === null) return null;
  // The reason is the whole answer when the verdict line alone says little.
  const reason = (refused[1] ?? "").trim();
  return { merge: false, reason: reason.length >= 20 ? reason : result.trim().slice(-1500) };
}

export type AgentAction =
  | { calibrate: number; model: string; effort: string }
  | { split: number; tickets: Array<{ title: string; body: string }> }
  | { park: number; reason: string }
  | { unpark: number }
  | { labels: number; add?: string[]; remove?: string[] }
  | { comment: number; body: string }
  | { close: number; reason: string }
  | { open: { title: string; body: string } };

export function parseAgentActions(result: string): AgentAction[] {
  const last = [...result.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1)?.[1];
  if (last === undefined) return [];
  try {
    const parsed = JSON.parse(last) as { actions?: unknown };
    return Array.isArray(parsed.actions) ? (parsed.actions as AgentAction[]) : [];
  } catch {
    return [];
  }
}

const MODELS = new Set(["sonnet", "opus", "haiku"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh"]);
// Labels an agent never sets or removes: the try count and trust stay the kitchen's.
const LOCKED = (label: string) => /^try:/.test(label) || label === ACCEPTED || label === LABELS.taken || label === LABELS.inPass;

// Applies what an agent asked for, and says which tickets it acted on.
export async function applyAgentActions(actions: AgentAction[], context: { act: Gestures; issues: Map<number, Issue>; log: (line: string) => void; who: string }): Promise<Set<number>> {
  const acted = new Set<number>();
  const { act, issues, log, who } = context;
  // An agent acts only on open, trusted tickets.
  const known = (n: unknown): n is number => typeof n === "number" && issues.get(n)?.trusted === true;
  // Bounds on what one answer may create: a confused agent cannot flood the backlog.
  let opened = 0;
  for (const action of actions.slice(0, 20)) {
    try {
      if ("calibrate" in action && known(action.calibrate) && MODELS.has(action.model) && EFFORTS.has(action.effort)) {
        const old = issues.get(action.calibrate)?.labels.filter((label) => label.startsWith("model:") || label.startsWith("effort:")) ?? [];
        await act.labels(action.calibrate, [LABELS.ready, `model:${action.model}`, `effort:${action.effort}`], old);
        acted.add(action.calibrate);
        log(`${who}: #${action.calibrate} calibrated ${action.model}/${action.effort}`);
      } else if ("split" in action && known(action.split) && Array.isArray(action.tickets) && action.tickets.length > 0 && action.tickets.length <= 10) {
        const children: number[] = [];
        for (const ticket of action.tickets) children.push(await act.open(ticket.title, `${ticket.body}\n\nEpic: #${action.split}`));
        await act.labels(action.split, [LABELS.epic], [LABELS.ready]);
        await act.comment(action.split, `Split by the manager into ${children.map((n) => `#${n}`).join(", ")}.`);
        acted.add(action.split);
        log(`${who}: #${action.split} split into ${children.join(", ")}`);
      } else if ("park" in action && known(action.park) && typeof action.reason === "string") {
        await act.labels(action.park, [LABELS.parkedChef]);
        await act.comment(action.park, `Parked for the chef by the ${who}: ${action.reason}`);
        acted.add(action.park);
        log(`${who}: #${action.park} parked for the chef`);
      } else if ("unpark" in action && known(action.unpark)) {
        await act.labels(action.unpark, [], [LABELS.parkedChef, LABELS.parked]);
        log(`${who}: #${action.unpark} unparked`);
      } else if ("labels" in action && known(action.labels)) {
        const add = (action.add ?? []).filter((label) => !LOCKED(label));
        const remove = (action.remove ?? []).filter((label) => !LOCKED(label));
        await act.labels(action.labels, add, remove);
        log(`${who}: #${action.labels} labels +${add.join(",")} -${remove.join(",")}`);
      } else if ("close" in action && known(action.close) && typeof action.reason === "string") {
        await act.close(action.close, `Closed by the kitchen's ${who}: ${action.reason}`);
        acted.add(action.close);
        log(`${who}: #${action.close} closed`);
      } else if ("comment" in action && known(action.comment) && typeof action.body === "string") {
        await act.comment(action.comment, action.body);
      } else if ("open" in action && typeof action.open?.title === "string" && opened < 2) {
        opened += 1;
        const n = await act.open(action.open.title, `${action.open.body}\n\nOpened by the kitchen's ${who}.`);
        log(`${who}: opened #${n}`);
      } else {
        log(`${who}: gesture ignored — ${JSON.stringify(action).slice(0, 200)}`);
      }
    } catch (error) {
      log(`${who}: gesture failed — ${(error as Error).message}`);
    }
  }
  return acted;
}
