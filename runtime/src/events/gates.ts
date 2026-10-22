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
// gates said. `tree` and `config`: the fingerprint of what they judged — the
// exact code tree, and a digest of the gates configuration
// (`empreinte-des-gates.ts`); absent on runs written before it existed, which
// nothing then reuses. A run reused instead of replayed writes no `gates.ran`.
export type CoureurDesGates = "cook" | "pass";

export type FaitGates = {
  type: "gates.ran";
  payload: { runner: CoureurDesGates; durationMs: number; cpuMs: number | null; outcome: "green" | "red" | "timeout"; tree?: string; config?: string };
};

// The ticket the kitchen opens on its own when a project's gates go over their
// budget (`budget-des-gates.ts`). Its creation is announced before the call to
// GitHub (`gates.budget-ticket-opening`, no ticket): if the answer is lost, or
// the runtime killed in between, the issue is found again by its mark instead
// of being opened twice. `gates.budget-ticket-opened` carries the ticket in its
// envelope, the run that went over — its wall-clock and CPU, in seconds, CPU
// null when it was not said —, the budget it was read against, the exceeded
// dimensions, and `reconciled` when the issue was found again rather than
// created. `gates.budget-ticket-closed`: the next run over budget found that
// ticket closed on GitHub, or gone — another one may then be opened.
export type DimensionDuBudget = "duration" | "cpu";
// `run`: which kind of run went over — the gates of a ticket (the selected tests), or the full run on the base, each
// with its own budget. Absent on facts written before the two were told apart: they were the ticket's.
export type GenreDuBudget = "ticket" | "base";

export type FaitBudgetDesGates =
  | { type: "gates.budget-ticket-opening"; payload: { exceeded: DimensionDuBudget[]; run?: GenreDuBudget } }
  | {
      type: "gates.budget-ticket-opened";
      payload: {
        durationSeconds: number;
        cpuSeconds: number | null;
        budget: { durationSeconds: number; cpuSeconds: number };
        exceeded: DimensionDuBudget[];
        reconciled: boolean;
        run?: GenreDuBudget;
      };
    }
  | { type: "gates.budget-ticket-closed"; payload: { state: "closed" | "gone" } };
