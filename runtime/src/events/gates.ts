// What a gate run cost: one fact per run of the project's gates script, written
// by whoever ran it (`cout-des-gates.ts`). The envelope carries the project,
// the ticket — null for the gates of the base itself — and the time of the
// record.
//
// `runner`: who ran them — `pass` when it judges a delivery or checks the base,
// `cook` when a cook's gates are run by the runtime. `durationMs`: wall-clock
// time of the gates script, the worktree setup not included. `cpuMs`: user +
// system CPU of the script and of every process it waited for, workers
// included; null when the script did not end by itself (cut at its cap, or the
// runtime stopping), its CPU then being lost with it. `outcome`: what the
// gates said.
export type CoureurDesGates = "cook" | "pass";

export type FaitGates = {
  type: "gates.ran";
  payload: { runner: CoureurDesGates; durationMs: number; cpuMs: number | null; outcome: "green" | "red" | "timeout" };
};
