// The entry point of the `brigade` command (runtime/bin/brigade): operates the station of this machine, locally or
// through `ssh <host> brigade …`. It runs as the chef and reads only what the station publishes for operators.
//
//   BRIGADE_STATION_DIR         the station's state directory (default by platform, see command.ts)
//   BRIGADE_MISE_A_JOUR_DIR     the update's directory (default /var/lib/brigade-station)
import { statfsSync } from "node:fs";
import { spawnSync } from "../sans-invite.ts";
import { runCommand } from "./command.ts";
import type { Machine } from "./shared.ts";

const machine: Machine = {
  platform: process.platform === "darwin" ? "darwin" : "linux",
  env: process.env,
  now: () => new Date(),
  run(program, args, input) {
    const done = spawnSync(program, args, { encoding: "utf8", input, stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    return { code: done.status ?? 1, stdout: done.stdout ?? "", stderr: done.stderr ?? done.error?.message ?? "" };
  },
  freeBytes(path) {
    const stat = statfsSync(path);
    return stat.bavail * stat.bsize;
  },
};

const result = runCommand(machine, process.argv.slice(2));
if (result.out !== "") process.stdout.write(result.out);
if (result.err !== "") process.stderr.write(result.err);
process.exitCode = result.code;
