// The sandbox probe, run on the workstation of a remote station — the chef's
// Mac — by its app, before it announces itself or claims:
//   node runtime/src/sandbox/probe.ts <worktrees> [<cache>…]
// `worktrees`: the directory where the workstation puts this project's cooks'
// worktrees; `cache`: a project cache where a cook also writes. Absolute paths.
//
// It returns, on one line, the JSON object the station passes to the box as is
// (`pull <station> claim --sandbox <json>`): available, with the `claude`
// version and the workstation's places; unavailable, with the reason. Exit code
// 0 in both cases — an absent sandbox is a finding, not a failure; 2, the probe
// is badly called. The probed `claude` is the one the station launches
// (`BRIGADE_CLAUDE_BIN`, otherwise `claude`).
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { detect, machineProbes, type Probes } from "./detection.ts";
import { forBox } from "./ordinary.ts";

const USAGE = "usage : node runtime/src/sandbox/probe.ts <worktrees> [<cache>…] — des chemins absolus";

// `probes`, `home`: what a test sets of the machine.
export function main({ args, env, dire, redire }: Appel, probes?: Probes, home: string = homedir()): void {
  const [worktrees, ...caches] = args;
  if (worktrees === undefined || ![worktrees, ...caches].every((path) => isAbsolute(path))) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(2);
  }
  const detection = detect(probes ?? machineProbes(env.BRIGADE_CLAUDE_BIN || "claude"));
  dire(JSON.stringify(forBox(detection, { home, worktrees, caches })));
}

if (import.meta.main) await enProcess((appel) => main(appel));
