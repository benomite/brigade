// What the box's installation command logs: every call, accepted or refused.
// It runs as root, outside any project: its log belongs to the box
// (`installateur.ts`), not to a project. The envelope carries who (`author`,
// the calling account), when (`at`) and which project (`project`).

// What the caller typed, bounded: neither a file's contents nor an endless
// line enter the log in full.
export type AppelDInstallateur = {
  // The subcommand typed, or null if there was none.
  action: string | null;
  // The arguments, as received — each one cut, and their number too.
  args: string[];
};

export type FaitInstallateur =
  // An accepted call, written before the first action on the box: what follows
  // says what it became. With no follow-up, the action was cut short.
  | { type: "installer.started"; payload: AppelDInstallateur & { result: "started" } }
  // An uninstall plan, returned: nothing was written on the box.
  | { type: "installer.planned"; payload: AppelDInstallateur & { result: "planned" } }
  // It succeeded.
  | {
      type: "installer.used";
      payload: AppelDInstallateur &
        (
          | // `ports`: the one it assigned to the project's door, and the one of
            // the box's arbiter, read — null if the box has none.
            { result: "installed"; ports: { porte: number; arbitre: number | null } }
          | // `ports`: those the project declared, which the box may reassign.
            // `journal`: the project's state, kept or deleted with it.
            { result: "uninstalled"; ports: number[]; journal: "kept" | "removed" }
        );
    }
  // It did not succeed. An installation — `undone`: everything it had put in
  // place was removed. An uninstall — `removed`: what it removed before
  // stopping, `left`: what remains of the project on the box.
  | { type: "installer.failed"; payload: AppelDInstallateur & { result: "failed"; reason: string } & ({ undone: boolean } | { removed: string[]; left: string[] }) }
  // A refused call: nothing was written on the box. `reason`: the reason.
  | { type: "installer.refused"; payload: AppelDInstallateur & { result: "refused"; reason: string } };
