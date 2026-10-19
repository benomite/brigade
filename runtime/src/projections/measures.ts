// What the log knows about the weight of the project, merged delivery by
// merged delivery: the measures its gates declared, and what its cooks used
// up. To this are added the chief's thresholds and the crossings already
// flagged. Nothing is recorded separately: everything comes from the events of
// the pass and of the guardrails.
import type { Base } from "../base.ts";
import type { Fait } from "../evenements.ts";
import type { Seuils } from "../events/drift.ts";
import type { Depassement, Gates } from "../events/pass.ts";
import { definirProjection } from "../projection.ts";

type Ecoutes = Extract<
  Fait,
  { type: "pass.judged" | "pass.replayed" | "merge.done" | "cook.launched" | "cook.exited" | "drift.configured" | "drift.crossed" | "drift.cleared" }
>;

// A ticket cook. `calibration`: `<model>/<effort>`, or null for a cook
// launched without a known calibration. `turns`, `durationMs`: null while it
// runs, or if it died with the runtime. `tokens`: what this cook used up,
// likewise null. `delivered`: it delivered — its `cook.exited` says `ok`, the
// ending its station gives to the cook whose work it sends to the pass. False
// for any other ending, while it runs, or if it died with the runtime.
// `resumed`: the cook of a send-back that resumed the previous cook's session
// instead of starting from scratch (`resumes` at its launch) — absent otherwise.
export type CookMesure = { calibration: string | null; turns: number | null; durationMs: number | null; tokens: number | null; delivered: boolean; resumed?: true };

// A merged delivery. `retroTokens`: what the retro of its ticket used up — the
// run launched under the `retro` station — summed, null if none of them knows
// its tokens; absent if the ticket had no retro. It is counted in the ticket's
// token total, and kept apart from `cooks`: a retro is not a delivery attempt.
// `measures`: what its latest gates declared.
// `state`: those of these measures that tell the state of the project after
// its merge — all of them, except when its gates were run before those of a
// delivery merged earlier: a delivery judged, put on hold, then merged by hand
// behind another knows nothing of what the other added, and concludes
// nothing. `gatesS`: the duration of all its gates, send-backs and re-judgments
// included, or null if none declared it. `overCeiling`: the duration ceiling
// its latest gates crossed, without the pass judging it — absent if they did
// not cross it.
export type Delivery = {
  ticket: number | null;
  at: string;
  measures: Record<string, number>;
  state: Record<string, number>;
  gatesS: number | null;
  cooks: CookMesure[];
  retroTokens?: number | null;
  overCeiling?: Depassement;
};

// The stations under which the pass and the manager launch their cooks:
// neither a review nor a judgment cooks a ticket.
const HORS_TICKET = ["reviewer", "manager"];
// The station under which the retro of a ticket runs: its cost is the ticket's,
// but it is not one of the ticket's cooks.
const RETRO = "retro";

// Each gates run of a ticket, whether or not it declared measures: the last
// one says whether the delivery crosses its duration ceiling.
const noterGates = (base: Base, seq: number, ticket: number | null, gates: Gates | undefined) => {
  if (ticket === null) return;
  const { measures, overCeiling } = gates ?? {};
  const dire = (valeur: unknown) => (valeur === undefined ? null : JSON.stringify(valeur));
  base.executer("INSERT INTO measured_gates (seq, ticket, measures, over_ceiling) VALUES (?, ?, ?, ?)", seq, ticket, dire(measures), dire(overCeiling));
};

export const measures = definirProjection<Ecoutes>({
  nom: "mesures",
  tables: ["measured_gates", "measured_cooks", "measured_retros", "measured_merges", "drift_limits", "drift_flags"],
  schema: `
    CREATE TABLE IF NOT EXISTS measured_gates (
      seq      INTEGER PRIMARY KEY,
      ticket   INTEGER NOT NULL,
      measures TEXT,
      over_ceiling TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS measured_cooks (
      run          TEXT PRIMARY KEY,
      ticket       INTEGER NOT NULL,
      launched_seq INTEGER NOT NULL,
      calibration  TEXT,
      turns        INTEGER,
      duration_ms  INTEGER,
      tokens       INTEGER,
      delivered    INTEGER NOT NULL DEFAULT 0,
      resumed      INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS measured_retros (
      run          TEXT PRIMARY KEY,
      ticket       INTEGER NOT NULL,
      launched_seq INTEGER NOT NULL,
      tokens       INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS measured_merges (
      seq    INTEGER PRIMARY KEY,
      ticket INTEGER,
      at     TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS drift_limits (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      limits TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS drift_flags (
      measure TEXT PRIMARY KEY
    ) STRICT;
  `,
  sur: {
    "pass.judged": (base, evenement) => noterGates(base, evenement.seq, evenement.ticket, evenement.payload.gates),
    "pass.replayed": (base, evenement) => noterGates(base, evenement.seq, evenement.ticket, evenement.payload.gates),
    "merge.done": (base, evenement) => {
      base.executer("INSERT INTO measured_merges (seq, ticket, at) VALUES (?, ?, ?)", evenement.seq, evenement.ticket, evenement.at);
    },
    "cook.launched": (base, evenement) => {
      const { run, station, model, effort, resumes } = evenement.payload;
      if (evenement.ticket === null || (station !== undefined && HORS_TICKET.includes(station))) return;
      if (station === RETRO) {
        base.executer("INSERT INTO measured_retros (run, ticket, launched_seq) VALUES (?, ?, ?)", run, evenement.ticket, evenement.seq);
        return;
      }
      base.executer(
        "INSERT INTO measured_cooks (run, ticket, launched_seq, calibration, resumed) VALUES (?, ?, ?, ?, ?)",
        run,
        evenement.ticket,
        evenement.seq,
        model === undefined || effort === undefined ? null : `${model}/${effort}`,
        typeof resumes === "object" && resumes !== null ? 1 : 0,
      );
    },
    "cook.exited": (base, evenement) => {
      const { run, outcome, turns, durationMs, tokens } = evenement.payload;
      const entier = (valeur: unknown) => (Number.isSafeInteger(valeur) ? (valeur as number) : null);
      base.executer(
        "UPDATE measured_cooks SET turns = ?, duration_ms = ?, tokens = ?, delivered = ? WHERE run = ?",
        entier(turns),
        entier(durationMs),
        entier(tokens),
        outcome === "ok" ? 1 : 0,
        run,
      );
      base.executer("UPDATE measured_retros SET tokens = ? WHERE run = ?", entier(tokens), run);
    },
    "drift.configured": (base, evenement) => {
      base.executer("INSERT OR REPLACE INTO drift_limits (id, limits) VALUES (1, ?)", JSON.stringify(evenement.payload.limits));
    },
    "drift.crossed": (base, evenement) => {
      base.executer("INSERT OR IGNORE INTO drift_flags (measure) VALUES (?)", evenement.payload.measure);
    },
    "drift.cleared": (base, evenement) => {
      base.executer("DELETE FROM drift_flags WHERE measure = ?", evenement.payload.measure);
    },
  },
});

// The merged deliveries, in merge order. Each gets the gates and cooks of its
// ticket since the previous merge of that same ticket: a ticket served twice
// makes two deliveries.
export function mergedDeliveries(base: Base): Delivery[] {
  const gates = base.lire<{ seq: number; ticket: number; measures: string | null; franchi: string | null }>(
    "SELECT seq, ticket, measures, over_ceiling AS franchi FROM measured_gates ORDER BY seq",
  );
  const cooks = base.lire<{ ticket: number; seq: number; calibration: string | null; turns: number | null; durationMs: number | null; tokens: number | null; delivered: number; resumed: number }>(
    "SELECT ticket, launched_seq AS seq, calibration, turns, duration_ms AS durationMs, tokens, delivered, resumed FROM measured_cooks ORDER BY launched_seq",
  );
  const retros = base.lire<{ ticket: number; seq: number; tokens: number | null }>("SELECT ticket, launched_seq AS seq, tokens FROM measured_retros ORDER BY launched_seq");
  const precedents = new Map<number, number>();
  // Per measure, the most recent gates run that declared it among the
  // deliveries already merged.
  const connues = new Map<string, number>();
  return base.lire<{ seq: number; ticket: number | null; at: string }>("SELECT seq, ticket, at FROM measured_merges ORDER BY seq").map((merge) => {
    const since = merge.ticket === null ? 0 : (precedents.get(merge.ticket) ?? 0);
    if (merge.ticket !== null) precedents.set(merge.ticket, merge.seq);
    const siennes = <L extends { ticket: number; seq: number }>(lignes: L[]) =>
      lignes.filter((ligne) => ligne.ticket === merge.ticket && ligne.seq > since && ligne.seq < merge.seq);
    const jouees = siennes(gates);
    const siennesRetros = siennes(retros);
    const retroTokens = siennesRetros.flatMap((retro) => retro.tokens ?? []);
    const franchi = jouees.at(-1)?.franchi ?? null;
    const passages = jouees.filter((ligne) => ligne.measures !== null);
    const declarees = passages.map((ligne) => JSON.parse(ligne.measures ?? "{}") as Record<string, number>);
    const durees = declarees.flatMap((declare) => (declare.gates_s === undefined ? [] : [declare.gates_s]));
    const measures = declarees.at(-1) ?? {};
    const dernieres = passages.at(-1)?.seq ?? 0;
    const state = Object.fromEntries(Object.entries(measures).filter(([nom]) => dernieres > (connues.get(nom) ?? 0)));
    for (const nom of Object.keys(state)) connues.set(nom, dernieres);
    return {
      ticket: merge.ticket,
      at: merge.at,
      measures,
      state,
      gatesS: durees.length === 0 ? null : durees.reduce((somme, duree) => somme + duree, 0),
      cooks: siennes(cooks).map(({ calibration, turns, durationMs, tokens, delivered, resumed }) => ({
        calibration,
        turns,
        durationMs,
        tokens,
        delivered: delivered === 1,
        ...(resumed === 1 ? { resumed: true as const } : {}),
      })),
      ...(siennesRetros.length === 0 ? {} : { retroTokens: retroTokens.length === 0 ? null : retroTokens.reduce((somme, tokens) => somme + tokens, 0) }),
      ...(franchi === null ? {} : { overCeiling: JSON.parse(franchi) as Depassement }),
    };
  });
}

// The declared thresholds, or null as long as no runtime has started with them.
export function seuilsEnVigueur(base: Base): Seuils | null {
  const ligne = base.lire<{ limits: string }>("SELECT limits FROM drift_limits WHERE id = 1")[0];
  return ligne ? JSON.parse(ligne.limits) : null;
}

// The measures whose crossing was flagged, and which have not come back.
export function signalements(base: Base): string[] {
  return base.lire<{ measure: string }>("SELECT measure FROM drift_flags ORDER BY measure").map(({ measure }) => measure);
}
