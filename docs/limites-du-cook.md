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

## A cook on a machine with no sandbox

When the sandbox is unusable on a Mac and the chef chooses `continue without sandbox`, the cook does not run
unbounded: it runs in **restricted mode** (`restricted mode: no sandbox`), never under `bypassPermissions`.

- Claude's own tools refuse the chef's credential folders (`~/.ssh`, the keychain, `~/.config/gh`, the cloud
  folders…), `WebFetch` reaches only the project's host list, `WebSearch` is refused, and `Edit` writes only in
  the worktree and the project's caches.
- The cook's guard (above) is attached exactly as with the sandbox, and `git push` / `gh pr merge` stay denied.
- What restricted mode cannot do: shell commands. Bash stays open, bounded only by the guard, which is
  best-effort — `sed -i`, `perl -i`, `git -C`, `python -c`, `node -e`, `curl -o`… pass unchecked, and a command's
  reads and network are not held by the kernel.
