// The projects of the new kitchen: `<BRIGADE_STATION_DIR>/kitchen/projects`,
// one line each (`<name> <owner/repo> <base> ...`, see `kitchen/projects.ts`).
// The station's old runtime serves none of them. On a Mac, the station runs
// `src/kitchen/main.ts` for them itself, as the box's `brigade-kitchen` unit
// does (docs/runtime/mac-new-kitchen.md).
import { spawn } from "../sans-invite.ts";
import { fileURLToPath } from "node:url";
import { projectsOfTheKitchen } from "../kitchen/projects.ts";

// The kitchen's entry point, in the same runtime as the station.
const KITCHEN_ENTRY = fileURLToPath(new URL("../kitchen/main.ts", import.meta.url));

type KitchenLaunch = { command: string; args: string[]; env: Record<string, string | undefined> };
export type KitchenProcess = { onExit(listener: (code: number | null, signal: string | null) => void): void; kill(): void };

export type KitchenOptions = {
  root: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  say: (line: string) => void;
  // Overridden by the tests: what starts the kitchen's process.
  launch?: (launch: KitchenLaunch) => KitchenProcess;
  // Between two readings of `kitchen/projects`; between an exit and the next start.
  checkMs?: number;
  restartMs?: number;
};

export type HeldKitchen = {
  // Reads `kitchen/projects` again and starts the kitchen if it should run and does not.
  check(): void;
  stop(): void;
};

const launchProcess = ({ command, args, env }: KitchenLaunch): KitchenProcess => {
  const child = spawn(command, args, { env, stdio: "inherit" });
  return {
    onExit: (listener) => void child.once("exit", listener),
    kill: () => void child.kill("SIGTERM"),
  };
};

// On darwin, keeps one kitchen process running while `kitchen/projects`
// lists a project: started when the first one is listed, started again when
// it exits. Elsewhere it does nothing: the box has its own unit.
export function holdKitchen(options: KitchenOptions): HeldKitchen {
  const { root, env, platform, say } = options;
  const launch = options.launch ?? launchProcess;
  const restartMs = options.restartMs ?? 10_000;
  let running: KitchenProcess | null = null;
  let exitedAt = Number.NEGATIVE_INFINITY;
  let stopped = false;

  const check = () => {
    if (stopped || platform !== "darwin" || running !== null) return;
    if (Date.now() - exitedAt < restartMs) return;
    const projects = projectsOfTheKitchen(root).map(({ name }) => name);
    if (projects.length === 0) return;
    const started = launch({ command: process.execPath, args: [KITCHEN_ENTRY], env: { ...env, BRIGADE_STATION_DIR: root } });
    running = started;
    say(`brigade : station — the new kitchen serves ${projects.join(", ")} (${KITCHEN_ENTRY})`);
    started.onExit((code, signal) => {
      if (running === started) running = null;
      exitedAt = Date.now();
      if (!stopped) say(`brigade : station — the new kitchen exited (${signal ?? `code ${code}`}): it starts again in ${Math.round(restartMs / 1000)} s`);
    });
  };

  check();
  const timer = setInterval(check, options.checkMs ?? 2000);
  timer.unref();
  return {
    check,
    stop() {
      stopped = true;
      clearInterval(timer);
      running?.kill();
      running = null;
    },
  };
}
