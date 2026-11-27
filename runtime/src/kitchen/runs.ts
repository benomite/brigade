// The agents the kitchen runs, as files: each run is a directory under the
// project's state, launched through the relay (`relais.ts`) so it outlives
// the kitchen. A restarted kitchen lists the same directories and finds the
// same runs: nothing about them lives in memory.
import { spawn } from "../sans-invite.ts";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireAtomique, type ConsigneDuRelais, type FinDuRelais } from "../relais.ts";

export type Kind = "cook" | "pass" | "manager" | "supervisor";
export type RunMeta = { kind: Kind; issue: number | null; pr: number | null; started: number; worktree: string | null; given?: number[] };
export type Run = RunMeta & { name: string; dir: string };
export type Finished = Run & { end: FinDuRelais; result: string };

const RELAY = join(import.meta.dirname, "..", "relais.ts");
export const runName = (kind: Kind, issue: number | null) => (issue === null ? kind : `${kind}-${issue}`);

// A JSON file, or null when it is missing or cut.
export function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

const files = (dir: string) => ({ meta: join(dir, "meta.json"), relay: join(dir, "relay.json"), stream: join(dir, "stream.jsonl"), pid: join(dir, "agent.pid"), end: join(dir, "end.json") });

function alive(dir: string, name: string): boolean {
  try {
    const { pid } = JSON.parse(readFileSync(files(dir).relay, "utf8")) as { pid: number };
    process.kill(pid, 0);
    try {
      // A recycled pid must still be this relay.
      return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").includes(name);
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

// The text the agent ended on: the `result` of its stream.
export function resultOf(stream: string): string {
  let result = "";
  try {
    for (const line of readFileSync(stream, "utf8").split("\n")) {
      if (!line.startsWith("{")) continue;
      try {
        const event = JSON.parse(line) as { type?: string; result?: string };
        if (event.type === "result" && typeof event.result === "string") result = event.result;
      } catch {
        // A partial line: the agent was cut while writing it.
      }
    }
  } catch {
    // No stream: the agent never started.
  }
  return result;
}

export function listRuns(root: string): { running: Run[]; finished: Finished[] } {
  const running: Run[] = [];
  const finished: Finished[] = [];
  if (!existsSync(root)) return { running, finished };
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    const meta = readJson<RunMeta>(files(dir).meta);
    if (meta === null) {
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    const run = { ...meta, name, dir };
    const end = readJson<FinDuRelais>(files(dir).end);
    if (end !== null) finished.push({ ...run, end, result: resultOf(files(dir).stream) });
    else if (alive(dir, name)) running.push(run);
    // Neither alive nor ended: its relay died with the machine. It ended with nothing to say.
    else finished.push({ ...run, end: { code: null, signal: null, erreur: "its relay is gone", masques: 0 }, result: "" });
  }
  return { running, finished };
}

// Done with a finished run: its directory moves to `done/`, so the next turn
// does not see it again and its stream can still be read. The last 100 stay.
export function forget(run: Run) {
  const done = join(run.dir, "..", "..", "done");
  mkdirSync(done, { recursive: true });
  renameSync(run.dir, join(done, `${run.started}-${run.name}`));
  const kept = readdirSync(done).sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - 100))) rmSync(join(done, old), { recursive: true, force: true });
}

export type Launch = { command: string; args: string[]; input: string; cwd: string; env: NodeJS.ProcessEnv; secrets: Record<string, string> };

export function startRun(root: string, meta: Omit<RunMeta, "started">, launch: Launch): Run {
  const name = runName(meta.kind, meta.issue);
  const dir = join(root, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const full: RunMeta = { ...meta, started: Date.now() };
  writeFileSync(files(dir).meta, JSON.stringify(full));
  const relay = spawn(process.execPath, [RELAY, name], { detached: true, stdio: ["pipe", "ignore", "ignore"], env: process.env });
  relay.stdin?.on("error", () => {});
  const { stream: flux, pid, end: fin } = files(dir);
  const order: ConsigneDuRelais = { commande: launch.command, args: launch.args, entree: launch.input, cwd: launch.cwd, env: launch.env, flux, pid, fin, secrets: launch.secrets, graceMs: 10_000 };
  relay.stdin?.end(`${JSON.stringify(order)}\n`);
  ecrireAtomique(files(dir).relay, JSON.stringify({ pid: relay.pid, run: name }));
  relay.unref();
  return { ...full, name, dir };
}
