// The cleanup facts: what becomes of a cook's worktree once that cook is done,
// of its local branch once its ticket is served or off the rail, and of the
// transcripts `claude` leaves in the `~/.claude` of a partitioned project.

// Why a worktree stays. `failed`: what lingers in it could not be committed,
// or it could not be removed. `pr-open` and `unpushed` are no longer written:
// they are the reasons from before #164, when a worktree waited for its
// ticket — a log from that time still carries them.
export type MotifDeGarde = "pr-open" | "unpushed" | "failed";

export type FaitNettoyage =
  // The worktree is gone — tidied, or found missing; its branch stays.
  // `worktree`: its path, relative to the state directory. `harvest`: the
  // commit of what lingered in it, put on the branch, or null. Without
  // `harvest`, the fact is from before #164: the local branch left with the
  // worktree.
  | { type: "worktree.removed"; payload: { worktree: string; branch: string; harvest?: string | null } }
  // Kept, nothing in it was touched. Written once, not on every try.
  // `detail`: what git said.
  | { type: "worktree.kept"; payload: { worktree: string; branch: string; reason: MotifDeGarde; detail: string } }
  // A cook's local branch is gone: its ticket is served or off the rail, and
  // all its commits are on origin.
  | { type: "branch.removed"; payload: { branch: string } }
  // One pass of the transcript cleanup, under partition: how many left and
  // what they weighed, how many remain and what they weigh, in bytes.
  // `keepMs`: the retention applied. Written on every pass, even when it
  // removes nothing: that is where what is kept can be read.
  | { type: "transcripts.tidied"; payload: { removed: number; freedBytes: number; kept: number; keptBytes: number; keepMs: number } }
  // The project is no longer partitioned: no transcript is tidied any more,
  // and the last pass no longer says anything true. Written once, at the
  // startup that notices it.
  | { type: "transcripts.released"; payload: Record<string, never> };
