// A stalled run (#3599): the inactivity guard stopped it, but its silence says
// nothing about the work. It never started — not a turn, not a token — or it
// hung on a command that never returned (`cat` waiting for input on
// 2026-11-15). That is a stall, not a failure: it does not count for the
// breaker, and the kitchen relaunches the run by itself (`garde-fous.ts`).
//
// Only when stalls keep coming after `RELANCES_SUR_CALAGE` relaunches of the
// same run does the breaker open, to escalate to the chef: its `breaker.opened`
// says what keeps stalling — the kind of run and its last activity —, and the
// breaker's GitHub issue repeats it (`breaker-issue.ts`). A breaker opened that
// way closes by itself as soon as a later run completes normally.
import { direActiviteEn, type Activite } from "../activite.ts";
import type { Base } from "../base.ts";
import type { Fin } from "../superviseur.ts";

// How many times the kitchen relaunches a stalled run, by itself, before it
// escalates to the chef. Two: three stalls of the same work in a row — the
// threshold the breaker counts real failures with — is no longer a passing
// hang. Production reads it through `lireReglages` (`plafonds.ts`).
export const RELANCES_SUR_CALAGE = 2;

// What keeps stalling, as `breaker.opened` carries it. `kind`: the kind of run
// — `manager`, `cook`, or the prefix of its run name (`review`, `second-judge`).
// `activity`: its last activity, null when it never said anything. `retries`:
// the relaunches it had before the escalation.
export type Calage = {
  run: string;
  kind: string;
  turns: number;
  tokens: number;
  // `doing` is read back from the journal as written: a `Geste` when the station wrote it.
  activity: { doing: string; target: string | null } | null;
  retries: number;
};

// A stall: stopped for inactivity, having done nothing at all, or with a
// command still running — one that never returned. Any other inactivity (the
// model thinking, writing) stays a guard stop, as before.
export function estUnCalage(fin: Pick<Fin, "arret" | "turns" | "tokens">, activite: Pick<Activite, "doing"> | null): boolean {
  if (fin.arret?.reason !== "idle") return false;
  return (fin.turns === 0 && fin.tokens === 0) || activite?.doing === "running";
}

// The kind of a run, from the station that launched it and its name: the
// manager's and the pass's say so; a ticket's cook is named after its ticket
// (`44-github-…`); the others after what they do (`review-pr-12-github-…`).
export function natureDuRun(run: string, station: string | null): string {
  if (station === "manager" || station === "reviewer") return station;
  if (/^\d/.test(run)) return "cook";
  return run.match(/^(.*?)-\d/)?.[1] || run;
}

// What keeps stalling, in a sentence for the chef.
export function direLeCalage(calage: Calage): string {
  const quoi =
    calage.turns === 0 && calage.tokens === 0
      ? "never started (0 turns, 0 tokens)"
      : calage.activity === null
        ? `went silent after ${calage.turns} turns`
        : `hung on \`${direActiviteEn(calage.activity as Pick<Activite, "doing" | "target">)}\`, a command that never returned`;
  return `a ${calage.kind} run (\`${calage.run}\`) ${quoi}, still after ${calage.retries} relaunch${calage.retries === 1 ? "" : "es"}`;
}

// The stall the breaker escalated on, while it is open: null when it is closed
// or when real failures opened it.
export function calageDuDisjoncteur(base: Base): Calage | null {
  const [ligne] = base.lire<{ stalled: string | null; ouvert: string | null }>(
    `SELECT json_extract(payload, '$.stalled') AS stalled, (SELECT breaker_opened_at FROM guard_state WHERE id = 1) AS ouvert
     FROM events WHERE type = 'breaker.opened' ORDER BY seq DESC LIMIT 1`,
  );
  if (!ligne || ligne.ouvert === null || ligne.stalled === null) return null;
  // Written by `garde-fous.ts` alone; unreadable, the breaker is read as one
  // that real failures opened — it waits for the chef, it does not close alone.
  try {
    return JSON.parse(ligne.stalled) as Calage;
  } catch {
    return null;
  }
}
