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

## Without the sandbox: restricted mode

The sandbox is macOS-only and can be unusable on a given Mac (no `sandbox-exec`, a `claude` that is too old, a
configuration that does not hold). Detection stays what says so. If the chef then chooses `continue without
sandbox` (`accepterSansBacASable`), the kitchen opens and each cook launches in **restricted mode**
(`runtime/src/bac-a-sable/restreint.ts`) instead of `bypassPermissions`. The station line and the onboarding
step say `restricted mode: no sandbox`.

Its `--settings` come from the same `configurer` as the sandbox's, minus the kernel layer (no `sandbox` key,
nothing asks for `sandbox-exec`): `dontAsk`; `deny` rules for every path of `LECTURES_INTERDITES`; `WebFetch`
allowed only for the project's hosts, `WebSearch` denied; `Edit` allowed only in the worktree and the project's
caches; `Bash` allowed, since a cook that cannot run its commands builds nothing. The cook's guard hook
(#3506) is attached as on every launch, and the `--disallowedTools` for `git push` / `gh pr merge` are kept.

What it does not cover: Bash. Only the guard bounds it, best-effort — `sed -i`, `perl -i`, `git -C`,
`python -c`, `node -e`, `curl -o`… pass unchecked (`docs/runtime/station-cook.md`), and a shell command's reads
and network are not held by the kernel. Only the cooks are in restricted mode; the sandboxed path is unchanged.
