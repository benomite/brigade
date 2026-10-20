// The facts of the code rename pause (`pause/pause.ts`): a rename asks the
// chef to pause the kitchen, the chef says « yes » or « no », and the pause
// ends. None carries a ticket in its envelope — the pause holds the whole
// kitchen —, but the last two, which tell what became of a held delivery once
// the rename is merged (`pause/reprise.ts`). Each answer and the end name the
// request they close by its `seq`.
//
// `ticket`: the rename's own ticket, the one merge the pause lets through —
// null when the rename is not a ticket of the rail. `minutes`: how long the
// kitchen is expected to stay paused, as the card says it. `inFlight`: the
// tickets in flight when the pause was asked — taken (a cook at work) or in
// pass (a delivery being judged or waiting) —, those it will hold.
export type EnVol = { ticket: number; state: "taken" | "pass" };

// One move of the rename tool, as its `move` line says it (`scripts/rename-
// code/README.md`): a file or a folder, by its old path from the root, and
// its new name — the last segment only. A path under a moved folder moves
// with it.
export type Deplacement = [from: string, to: string];

// Why a rename played inside the pause (`pause/renommage.ts`) failed, in one
// word: `grant`, the `merge` grant is not active, nothing was played; `setup`,
// the worktree's setup failed; `tool`, the rename tool failed or renamed
// nothing; `delivery`, its branch or its PR did not leave; `gates`, `conflict`,
// `verdict`: the pass judged it red — red gates, a branch that no longer
// merges into the base, the reviewer or the CI; `unjudged`, the pass could not
// judge it; `held`, the pass stopped short of merging it; `closed`, its PR was
// closed without merge; `timeout`, the pause reached its limit; `interrupted`,
// the runtime stopped while the tool ran.
export const CAUSES_D_ECHEC = ["grant", "setup", "tool", "delivery", "gates", "conflict", "verdict", "unjudged", "held", "closed", "timeout", "interrupted"] as const;
export type CauseDEchec = (typeof CAUSES_D_ECHEC)[number];

export type FaitPause =
  // The card enters the chef's queue. A request is never written while
  // another is pending or in force.
  | { type: "pause.requested"; payload: { purpose: "code-rename"; ticket: number | null; minutes: number; inFlight: EnVol[] } }
  // The chef's « yes »: from now on, no other merge, no new cook.
  | { type: "pause.agreed"; payload: { request: number } }
  // The chef's « no » to a pending card: nothing ever changed.
  | { type: "pause.declined"; payload: { request: number } }
  // The pause is over: the rename ended — `why`, in plain words —, or the
  // chef withdrew the « yes ». The kitchen goes on by itself. `outcome`, when
  // the rename itself ends it: `merged`, or `failed` — then `cause` says why
  // in one word, and nothing was merged. Absent: the chef withdrew it, or the
  // pause was lifted by hand.
  | { type: "pause.released"; payload: { request: number; why: string; outcome?: "merged" | "failed"; cause?: CauseDEchec } }
  // The chef has read the card of a failed rename: it leaves the queue.
  | { type: "pause.dismissed"; payload: { request: number } }
  // The rename starts inside the agreed pause: `run`, its branch, born from
  // `base` — the head of the integration branch just fetched —, and the
  // instant past which it is abandoned (`deadline`).
  | { type: "rename.started"; payload: { request: number; run: string; branch: string; base: string; deadline: string } }
  // The renamed tree is committed (`sha`), pushed, and its PR handed to the
  // pass, which follows it under the PR's number: the one merge the pause
  // lets through, besides the rename's ticket. `moves`: what the tool moved,
  // read from its `move` lines — the mapping held deliveries are carried
  // through once it is merged. Absent from a fact written before it was read.
  | { type: "rename.delivered"; payload: { request: number; run: string; pr: string; number: number; sha: string; moves?: Deplacement[] } }
  // A delivery born before the merged rename of `request`, carried onto its
  // tree by the pass before being judged: its branch `branch` went from
  // `from` to `to`, a commit on top of it whose paths follow the mapping, and
  // that merges the base (`base`). `paths`: the files of the delivery that
  // moved, old and new. On the ticket.
  | { type: "rename.carried"; payload: { request: number; branch: string; from: string; to: string; base: string; paths: Array<[string, string]> } }
  // A delivery born before the merged rename that cannot be carried onto its
  // tree: `why`, in plain words, and `paths`, the files in conflict. The pass
  // escalates it to the chef, named in the queue. On the ticket.
  | { type: "rename.stranded"; payload: { request: number; branch: string; sha: string; why: string; paths: string[] } };
