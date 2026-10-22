// The facts of a project's blockers (`blocages.ts`): what stops the project
// from being installed or served, as the chef reads it on the project's page.
// None carries a ticket in its envelope: a blocker holds the project, not one
// of its tickets.
//
// `id`: the blocker's stable key, chosen by whoever raises it (`clone`,
// `need:postgres`…) — the same blocker raised twice is one blocker. `message`:
// what is blocked, in one sentence. `cause`: why, in one sentence. `action`:
// the gesture the app can perform to lift it, by its identifier. `link`: the
// exact page where the chef lifts it when the gesture is outside the app.
// `detail`: what a command said, as it said it — never the message.
export type BlocageEcrit = { id: string; message: string; cause: string; action?: string; link?: string; detail?: string };

export type FaitBlocage =
  // A blocker is raised, or its content changes: it replaces the one with the
  // same `id`, in place. Never written when nothing changes.
  | { type: "blocker.raised"; payload: BlocageEcrit }
  // The blocker is lifted: it leaves the list. Never written for a blocker
  // that is not raised.
  | { type: "blocker.resolved"; payload: { id: string } };
