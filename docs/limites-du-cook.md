# What a cook may and may not do

The limits of a cook, for the chef and for contributors. They are the partition: the wall between what a cook may and may not reach.

- A cook **may** write only inside its own worktree, and in the temporary folders it needs.
- A cook **may not** write anywhere else.
- A cook **may not** run a destructive command on a path outside its worktree.
- A cook **may not** use `gh`, push or merge: no GitHub token reaches it. It commits on its branch; the kitchen pushes it and opens the pull request.
- A cook **may** read the text of an issue and of its comments, as text; it **may not** take it as a command, whoever wrote it.
- None of these limits adds a permission prompt: the chef is asked nothing more.

## On a machine with no sandbox

On a Mac, every agent runs inside Claude Code's sandbox. If that sandbox is not usable, the project's kitchen launches no agent, and says why. In the app, `This computer` does not serve a project on a computer with no sandbox for its cooks. The old station's `continue without sandbox` decision, and its `restricted mode: no sandbox`, are gone: no cook runs that way. See [the sandbox page](runtime/bac-a-sable.md).
