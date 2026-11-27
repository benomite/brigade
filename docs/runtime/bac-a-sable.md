# The agents' sandbox

On a Mac, every command an agent runs goes through the sandbox of Claude Code. Brigade writes its configuration
(`runtime/src/bac-a-sable/configuration.ts`) and hands it to `claude` with `--settings`. On Linux, every agent runs
inside the `bwrap` partition (`runtime/src/cloison.ts`), which hides the state, the clones and the secrets of every
project, and goes out only through its project's gate.

## The kitchen on a Mac

The kitchen (`runtime/src/kitchen/`, #4483) launches every agent — cook, pass, manager, supervisor — inside
the same sandbox when it runs on macOS (`runtime/src/bac-a-sable/kitchen-launch.ts`). The network list is the project's
`.claude/brigade/reseau` on its base branch, read before each turn. A cook writes only in its worktree (and the
project's caches); a read-only launch (pass, manager, supervisor) writes nowhere. When the detection fails
(`runtime/src/bac-a-sable/detection.ts`: no Seatbelt, or a `claude` too old), the kitchen launches no agent for
the project and logs why in one line, `no agent launched: on macOS every agent runs inside Claude Code's sandbox,
and it is not usable — <reason>`, again only when the reason changes; it tries again each turn.

## What an agent may do on the network, on a Mac

| An agent may | Detail |
|---|---|
| Reach the allowed hosts | Only the hosts of the project's network list, plus the ones Claude Code and GitHub need to work (`anthropic.com`, `claude.ai`, `claude.com`, `github.com`, `githubusercontent.com` and their subdomains). A host outside the list is refused in every permission mode (`strictAllowlist`). An empty project list adds none. |
| Open a local port, on loopback only | `allowLocalBinding` is `true`: a command may listen on a port of `localhost` (`127.0.0.1`, `::1`). Examples: Gradle, which talks to its daemon through a local port; a local test server started by a test suite. |

What stays closed:

- Opening a local port **does not** open a host: the list of outbound hosts is the same with or without it. The configuration adds no wildcard and no address to it.
- Unix sockets stay refused (`allowAllUnixSockets: false`).
- Loopback only is the sandbox's own rule (Seatbelt, as Claude Code applies it for `allowLocalBinding`), not a setting of Brigade: the configuration has no field that picks the address, and this was not verified on a Mac: Brigade's tests run on Linux and cannot probe the kernel. They assert that the configuration sets `allowLocalBinding` and adds no host.

## When the machine has no sandbox

The kitchen does not guess. On macOS, when the detection fails, and on any other system without `bwrap`
(`BRIGADE_SANDBOX_BIN` not set — Windows, a Linux desktop), the kitchen launches **no agent** for the project, and the
station's log says why in one line, again only when the reason changes. Serve the project from a station that has
its sandbox: the box, or a Mac with a recent `claude`.
