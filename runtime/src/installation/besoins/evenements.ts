// The facts of what the station lacks for a project (`besoins.ts`): one choice
// per missing need, which the chef settles on the project's page. None carries
// a ticket in its envelope: a need holds the project, not one of its tickets.
//
// `id`: the choice's stable key, `need:<need>` — the same as the blocker that
// waits for it (`installation/blocages/`). `need`: the need, as the catalogue
// names it (`postgres`, `docker`, `browser`…). `message`: what is missing, in
// one sentence. `cause`: what in the repository says the project needs it, in
// one sentence. `options`: the three ways out, each with what follows from it.
export type OptionDeChoix = { id: string; label: string; consequence: string };

export type ChoixEcrit = { id: string; need: string; message: string; cause: string; options: OptionDeChoix[] };

export type FaitBesoin =
  // The station lacks a need of the project: the choice is raised, or its
  // content changes — it replaces the one with the same `id`, and keeps the
  // option the chef selected. Never written when nothing changes.
  | { type: "need.choice-raised"; payload: ChoixEcrit }
  // The chef selects an option: the choice is no longer pending. Written again
  // only when the chef changes it.
  | { type: "need.choice-selected"; payload: { id: string; option: string } }
  // The station no longer lacks the need — it has it now, or the project no
  // longer asks for it: the choice leaves the list, its selection with it.
  | { type: "need.choice-dropped"; payload: { id: string } }
  // What the last worktree setup of `station` failed on, among the needs of
  // the catalogue the station does not really provide (#1533): their choices
  // hold as long as it says so. Empty: it no longer does — the setup passed,
  // or failed on something else. Written only when it changes for that station.
  | { type: "need.setup-lacks"; payload: { station: string; needs: string[] } };
