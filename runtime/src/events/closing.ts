// The facts of the closing that writes: the pass the chef commands, what
// refuses it, what it holds while it tidies, and how it ends. The closing that
// observes writes none: it touches nothing.
import type { Calibrage } from "../calibrage.ts";

// The settings of a pass. `calibration` null: the project does not set the
// closer, no pass starts. `cooksBelow`: the pass starts when fewer cooks than
// that are in flight. `tokens`, `removedLines`: its caps — what it may
// consume, and the lines it may remove. `from`: where each one comes from, as
// the runtime read it (`closing/settings.ts`) — absent from a fact written
// before #1684, or from settings not read through the chef's decisions.
export type ReglagesDeFermeture = { calibration: Calibrage | null; cooksBelow: number; tokens: number; removedLines: number; from?: ProvenancesDeFermeture };

// Where a setting of the closer comes from: the project's repository
// (`.claude/brigade/projet.json`), a decision held on the box (`station`), or
// the runtime's default. The calibration has no default: set by neither, it
// comes from nowhere (null).
export type ProvenanceDeFermeture = "repository" | "station" | "default";
export type ProvenancesDeFermeture = { calibration: Exclude<ProvenanceDeFermeture, "default"> | null; cooksBelow: ProvenanceDeFermeture; tokens: ProvenanceDeFermeture; removedLines: ProvenanceDeFermeture };

// Why a requested pass did not start. `unconfigured`: the closer is not set.
// `busy`: a pass is already tidying. `stopped`, `breaker`: the chef's "stop",
// the breaker. `deploying`: a go-live is requested, no cook starts. `cooks`:
// its run condition — too many cooks in flight (`observed`) for its threshold
// (`limit`), or a rail that is not empty. `zoneless`: a cook in flight
// declares no zone, so the pass cannot know what it holds. `deploying`,
// `cooks` and `zoneless` do not refuse a request: they make it wait. `depot`:
// the base cannot be read. `nothing`: nothing the observation spots is outside
// what the cooks hold. `restarted`: the runtime restarted before taking it —
// a pass does not start from a request of another life, it is requested again.
export type MotifDeRefus = "unconfigured" | "busy" | "stopped" | "breaker" | "deploying" | "cooks" | "zoneless" | "depot" | "nothing" | "restarted";

// What holds a request back without refusing it: it waits for that to clear.
export type MotifDAttente = Extract<MotifDeRefus, "deploying" | "cooks" | "zoneless">;
export const MOTIFS_D_ATTENTE: readonly MotifDAttente[] = ["deploying", "cooks", "zoneless"];

// Beyond this, a waiting request is said to have no way out: twice the default
// duration cap of a cook — two whole cooks followed each other without letting
// the pass through, the rail will not empty on its own.
export const SANS_ISSUE_MS = 2 * 60 * 60 * 1000;

// How a pass ended. `delivered`: what it removed is in a PR. `nothing`: it
// removed nothing. `tokens`, `removals`, `idle`, `duration`, `turns`: a
// guardrail stopped it. `stop`: the chef. `breaker`: the breaker opened while
// it was tidying. `zone`: it wrote outside what it held, or in what a cook
// holds — nothing is delivered. `failed`: its cook failed, or its delivery
// could not go out. `interrupted`: the runtime died while it was tidying.
export type FinDePasse = "delivered" | "nothing" | "tokens" | "removals" | "idle" | "duration" | "turns" | "stop" | "breaker" | "zone" | "failed" | "interrupted";

// A candidate from the observation that the pass did not remove: which, and
// why. `before`: set aside before it started — a cook held it, or the pass
// already had enough; otherwise the closer left it, for lack of certainty.
// `reason` null: it did not say why.
export type Laisse = { id: string; what: string; reason: string | null; before: boolean };

// A candidate the pass removed: which, and what the observation said about it
// — where it was, and why it was to be removed.
export type Retrait = { id: string; what: string };

// What the last `merges` merges of the base added and removed, in a window of
// `window` merges, at the moment the pass started.
export type Pente = { window: number; merges: number; added: number; removed: number };

export type FaitFermeture =
  // The settings in force, written when they change: this is where the chef's
  // command reads them.
  | { type: "closing.configured"; payload: ReglagesDeFermeture }
  // The chef's gesture: only it starts a pass that writes. No other fact
  // launches it — neither a crossed threshold nor a clock. It waits until its
  // run condition is met, and then starts, once.
  | { type: "closing.requested"; payload: Record<string, never> }
  // The chef gives up the waiting request: nothing started.
  | { type: "closing.cancelled"; payload: Record<string, never> }
  // The request has been waiting for `SANS_ISSUE_MS`: the runtime says so,
  // once, with what holds it back at that moment. It is still waiting.
  | { type: "closing.stalled"; payload: { requestedAt: string; reason: MotifDAttente; observed: number | null; limit: number | null; detail: string | null } }
  // The requested pass does not start — refused by the chef's command, or by
  // the runtime if the kitchen changed in the meantime. `detail`: what
  // specifies the reason — the tickets involved, how many the rail carries,
  // what git said.
  | { type: "closing.refused"; payload: { reason: MotifDeRefus; observed: number | null; limit: number | null; detail: string | null } }
  // The pass starts. `base`: the commit of the integration branch it starts
  // from. `zone`: the files it holds while it tidies — no cook starts on them,
  // and it writes nowhere else. `held`: the paths that cooks held, and that it
  // forbids itself. `candidates`: what the observation proposes to it.
  | { type: "closing.started"; payload: { run: string; base: string; zone: string[]; held: string[]; candidates: number; limits: { tokens: number; removedLines: number } } }
  // The end. `observed`, `limit`: the measure and the cap of the guardrail
  // that stopped it. `files`: what it wrote — or, on `zone`, what it should
  // not have written. `kept`: what it did not remove, with its reason.
  // `removed`: what it removed of what was proposed to it. `addedLines`: the
  // lines it added, set against `removedLines`. `slope`: the slope of the base
  // it started from — enough to say, over the same merges, what the pass
  // changes there. A pass finished before the tally existed carries none of
  // the three.
  | {
      type: "closing.ended";
      payload: {
        run: string;
        outcome: FinDePasse;
        observed?: number | null;
        limit?: number | null;
        branch?: string;
        pr?: string;
        sha?: string;
        removedLines?: number;
        addedLines?: number;
        files?: string[];
        removed?: Retrait[];
        kept?: Laisse[];
        slope?: Pente[];
        detail?: string;
      };
    };
