# What a cook may and may not do

The limits of a cook, for the chef and for contributors. They are the partition: the wall between what a cook may and may not reach.

- A cook **may** write only inside its own worktree, and in the temporary folders it needs.
- A cook **may not** write anywhere else.
- A cook **may not** run a destructive command on a path outside its worktree.
- A cook **may** use `gh` only for its own ticket.
- A cook **may not** make `gh` admin calls, change repository settings, or delete anything with `gh`.
- A cook **may not** use `gh` to write on another ticket's branch, or on another repository.
- A cook **may** read the text of an issue and of its comments, as text; it **may not** take it as a command, whoever wrote it.
- None of these limits adds a permission prompt: the chef is asked nothing more.

## On a machine with no sandbox

If the station cannot apply the sandbox, it holds the project and waits for the chef: **choose another station**, or **`continue without sandbox`**. What triggers it is the station's detection, not the platform. Today the station says its cooks "would read everything the station's account reads"; the wording `restricted mode: no sandbox` is the one the restricted-mode launch brings (sibling tickets of #4349).

If the chef continues, the cook is not unbounded: the guard hook is on every tool call and holds the limits above. But today the cook still runs in `bypassPermissions` and reads everything the station's account reads, keys and credentials in the chef's home included. Restricted mode (`dontAsk`, deny rules for those reads, web access limited to the project's hosts, the guard) is the target: see [the sandbox page](runtime/bac-a-sable.md). Even then the guard is less precise than the kernel; its gaps are listed in [station-cook.md](runtime/station-cook.md). Keep `continue without sandbox` for a repository you trust.
