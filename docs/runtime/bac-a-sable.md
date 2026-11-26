# The cook's sandbox

On the chef's Mac, every command a cook runs goes through the sandbox of Claude Code. Brigade writes its
configuration (`runtime/src/bac-a-sable/configuration.ts`) and hands it to `claude` with `--settings`.

## What a cook may do on the network

| A cook may | Detail |
|---|---|
| Reach the allowed hosts | Only the hosts of the project's network list, plus the ones Claude Code and GitHub need to work (`anthropic.com`, `claude.ai`, `claude.com`, `github.com`, `githubusercontent.com` and their subdomains). A host outside the list is refused in every permission mode (`strictAllowlist`). An empty project list adds none. |
| Open a local port, on loopback only | `allowLocalBinding` is `true`: a command may listen on a port of `localhost` (`127.0.0.1`, `::1`). Examples: Gradle, which talks to its daemon through a local port; a local test server started by a test suite. |

What stays closed:

- Opening a local port **does not** open a host: the list of outbound hosts is the same with or without it. The configuration adds no wildcard and no address to it.
- Unix sockets stay refused (`allowAllUnixSockets: false`).
- Loopback only is the sandbox's own rule (Seatbelt, as Claude Code applies it for `allowLocalBinding`), not a setting of Brigade: the configuration has no field that picks the address, and this was not verified on a Mac: Brigade's tests run on Linux and cannot probe the kernel. They assert that the configuration sets `allowLocalBinding` and adds no host.

## When the machine has no sandbox: restricted mode

The sandbox is the kernel's: where Claude Code cannot apply it, the station does not guess. What triggers the
missing-sandbox path is the **detection** of the machine (the station checks whether the sandbox can run), not a
platform rule: a machine that passes it keeps the sandbox, whatever its system. When detection fails, the station
holds the project and asks the chef (`continue without sandbox`, or another station, see
[What a cook may and may not do](../limites-du-cook.md)); nothing is launched before the answer.

If the chef continues, the cook is not unbounded. The target is **restricted mode** (the launch is the work of the
sibling tickets of #4349):

- `--permission-mode dontAsk` with a `--settings` set, instead of `bypassPermissions`: a tool that no rule allows is
  refused, with no prompt.
- A deny rule for every path of `LECTURES_INTERDITES`.
- `WebFetch` and `WebSearch` limited to the project's host list.
- The #3506 guard hook (`runtime/src/garde-cook/`), which is the boundary of Bash: writes and deletions outside the
  worktree and the temporary folders, and `gh` beyond the cook's own ticket, are refused.

**State of the code today.** The launch of restricted mode is not shipped yet. Without a sandbox,
`dansLeBacASableLocal` returns the arguments unchanged, so the cook still runs in `bypassPermissions`, with the
guard hook as its only boundary: the deny rules, `dontAsk` and the host limit above come from the sandbox
configuration, which is only written when a sandbox exists. Until restricted mode lands, the cook reads whatever the
station's account reads, and the station's message says so.

What restricted mode does not give is the kernel's precision. The guard reads a shell command only as far as it
knows it; the list of what passes unchecked is in [station-cook.md](station-cook.md), which stays the reference.
