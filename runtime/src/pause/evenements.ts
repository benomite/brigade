// The facts of the code rename pause (`pause/pause.ts`): a rename asks the
// chef to pause the kitchen, the chef says « yes » or « no », and the pause
// ends. None carries a ticket in its envelope: the pause holds the whole
// kitchen. Each answer and the end name the request they close by its `seq`.
//
// `ticket`: the rename's own ticket, the one merge the pause lets through —
// null when the rename is not a ticket of the rail. `minutes`: how long the
// kitchen is expected to stay paused, as the card says it. `inFlight`: the
// tickets in flight when the pause was asked — taken (a cook at work) or in
// pass (a delivery being judged or waiting) —, those it will hold.
export type EnVol = { ticket: number; state: "taken" | "pass" };

export type FaitPause =
  // The card enters the chef's queue. A request is never written while
  // another is pending or in force.
  | { type: "pause.requested"; payload: { purpose: "code-rename"; ticket: number | null; minutes: number; inFlight: EnVol[] } }
  // The chef's « yes »: from now on, no other merge, no new cook.
  | { type: "pause.agreed"; payload: { request: number } }
  // The chef's « no » to a pending card: nothing ever changed.
  | { type: "pause.declined"; payload: { request: number } }
  // The pause is over: the rename ended — `why`, in plain words —, or the
  // chef withdrew the « yes ». The kitchen goes on by itself.
  | { type: "pause.released"; payload: { request: number; why: string } };
