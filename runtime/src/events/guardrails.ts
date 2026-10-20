// The guardrail facts: a cook's life seen by whoever watches it, and what the
// chef commands to the kitchen.

import type { Activite } from "../activite.ts";

// What a cook cannot exceed, whatever its ticket.
export type Plafonds = { turns: number; durationMs: number; tokens: number; idleMs: number };

// Why a guardrail stopped a cook. `stop`: the chef's command. `lease`: the
// lease on its ticket lapsed, for lack of progress in its worktree — its
// station says so, not the supervisor. `removals`: the closing pass removed
// more lines than its cap — the pass itself says so.
export type MotifArret = "turns" | "duration" | "tokens" | "idle" | "lease" | "removals" | "stop";

// How a cook ended, from the breaker's point of view: `failed` and `guard` are
// failures, `ok` resets the counter to zero, `stop`, `neutral` (the 86, which
// the station recognises) and `refused` (the model refused to answer) count
// neither for nor against.
export type Issue = "ok" | "failed" | "guard" | "stop" | "neutral" | "refused";

export const RELEVE = "cook.progressed";

// What a station says about the cook it launches. The calibration is there:
// it is how the chef reads, in the log, what each cook costs him.
// `relaunch`: the cook of a relaunch decided by the manager, after the pass's
// returns — its delivery does not reset the breaker to zero, the pass's
// verdict is what counts (`relaunch.judged`).
// `unarbitrated`: the cook started while the arbiter between projects was
// unreachable.
// `remote`: the cook of a remote station — it does not run on this machine,
// there is neither a worktree nor a raw stream: its station reports its
// measure.
// `head`: the tip of its branch when it entered it — a runtime that resumes
// this cook reads against it what it delivered.
// `sandbox`: the cook of a remote station, launched on its workstation in
// Claude Code's sandbox — an ordinary ticket (`bac-a-sable/ordinaires.ts`).
// `resumes`: the cook of a return that resumes the session of the cook whose
// delivery the pass refused (`reprise-de-session.ts`) — its run, and the
// session resumed. Absent: it started from scratch, like a first cook.
// `continues`: the cook that takes over the preserved work of another — that
// of a remote station that vanished mid-cook (`travail-conserve.ts`): the run
// of that cook. Its branch is its own.
// `lessons`: the ids of the project's provisional lessons the cook of a ticket
// received in its prompt, most recent first (`apprentissage/injection.ts`) —
// empty, it received none. Absent: a cook that serves no ticket (a manager
// judgement, the closing pass), or one launched before lessons were injected.
export type ContexteCook = {
  station: string;
  model: string;
  effort: string;
  branch: string;
  worktree: string;
  relaunch: boolean;
  unarbitrated: boolean;
  remote: boolean;
  head: string;
  sandbox?: boolean;
  resumes?: { run: string; session: string };
  continues?: string;
  lessons?: string[];
};

export type FaitGardeFous =
  // The settings in force, written when they change: this is where the chef
  // reads the caps.
  | { type: "guard.configured"; payload: { limits: Plafonds; breakerThreshold: number } }
  // The intent: written before the subprocess exists. `stream` is the path of
  // the raw stream, relative to the state directory. The rest comes from the
  // launching station: its name, the cook's calibration, its branch, its
  // worktree.
  | { type: "cook.launched"; payload: { run: string; limits: Plafonds; stream: string } & Partial<ContexteCook> }
  // The reading of a running cook, written at every tick: what it has consumed
  // so far, and what it is doing right now according to its stream — the kind
  // of action and what it aims at, never its content. `activity` absent: whoever
  // watches it does not read its stream (a remote station), or a reading from
  // before this field; null, the cook has not said anything readable yet.
  | { type: "cook.progressed"; payload: { run: string; turns: number; tokens: number; activity?: Activite | null } }
  // The reason for a stop, written before the signal: if the runtime dies
  // between the two, the reason is already in the log.
  | { type: "guard.tripped"; payload: { run: string; reason: MotifArret; limit: number | null; observed: number | null } }
  // The end of the process, whatever the cause.
  | {
      type: "cook.exited";
      payload: {
        run: string;
        outcome: Issue;
        code: number | null;
        signal: string | null;
        turns: number;
        tokens: number;
        durationMs: number;
        error?: string;
        // Why brigade stopped this cook, when it did: `stop` (the chef);
        // `move` (the project's kitchen moved to another station: its ticket
        // goes back to the rail, to be taken again there — `kitchen.moved`);
        // `update` (an update) is only read in logs from before the station.
        // Absent: its end is not of brigade's doing, and if it is a failure, it
        // counts for the breaker.
        cause?: "stop" | "update" | "move";
        // How many times what has the shape of Claude credentials was masked
        // in its raw stream and its error output. Absent: never.
        credentialsMasked?: number;
      };
    }
  // Written at startup for a launch with no end: the cook died with the
  // runtime.
  | { type: "cook.interrupted"; payload: { run: string } }
  // Written at startup for a launch with no end whose cook is still alive — a
  // relay carries it — or finished without anyone reading it: the runtime that
  // starts takes it over, and it is the one that will write its end. `pid`:
  // that of its relay.
  | { type: "cook.resumed"; payload: { run: string; pid: number | null } }
  // What the pass said about the delivery of a manager relaunch: red, it is one
  // more failure for the breaker; green, it restarts from zero.
  | { type: "relaunch.judged"; payload: { run: string; verdict: "green" | "red" } }
  | { type: "breaker.opened"; payload: { failures: number; threshold: number } }
  // The chef's commands: "stop" and "resume".
  | { type: "kitchen.stopped"; payload: Record<string, never> }
  | { type: "kitchen.resumed"; payload: Record<string, never> };
