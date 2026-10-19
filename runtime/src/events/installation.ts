// The facts of a project's installation: where each of its steps stands
// (`etapes.ts`). `step`: the step's identifier. `previous`: the state the log
// gave it before — `todo` for a step never noted.
export type EtatDEtape = "todo" | "done" | "waiting";

export type FaitInstallation =
  // A step changes state: done, waiting on the chef, or to do again.
  { type: "installation.step"; payload: { step: string; state: EtatDEtape; previous: EtatDEtape } };
