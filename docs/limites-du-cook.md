# What a cook may and may not do

The limits of a cook, for the chef and for contributors. They are the partition: the wall between what a cook may and may not reach.

- A cook **may** write only inside its own worktree, and in the temporary folders it needs.
- A cook **may not** write anywhere else.
- A cook **may not** run a destructive command on a path outside its worktree.
- A cook **may not** use `gh`, push or merge: no GitHub token reaches it. It commits on its branch; the kitchen pushes it and opens the pull request.
- A cook **may** read the text of an issue and of its comments, as text; it **may not** take it as a command, whoever wrote it.
- None of these limits adds a permission prompt: the chef is asked nothing more.

## On a machine with no sandbox

If the station cannot apply the sandbox, it holds the project and waits for the chef: **choose another station**, or **`continue without sandbox`**. What triggers it is the station's detection, not the platform. The app screen and the station line say `restricted mode: no sandbox`, with what it covers (credential reads, the network limit to the project's hosts, the #3506 guard) and what it cannot: the guard's best-effort shell gaps (`sed -i`, `curl -o`, `perl -i`, `python -c` and similar), as [README.md](runtime/README.md) lists them. The decision stays one visible button.

If the chef continues, the cook is not unbounded: the guard hook is on every tool call and holds the limits above. But today the cook still runs in `bypassPermissions` and reads everything the station's account reads, keys and credentials in the chef's home included. Restricted mode (`dontAsk`, deny rules for those reads, web access limited to the project's hosts, the guard) is the target: see [the sandbox page](runtime/bac-a-sable.md). Even then the guard is less precise than the kernel; its gaps are listed in [README.md](runtime/README.md). Keep `continue without sandbox` for a repository you trust.
