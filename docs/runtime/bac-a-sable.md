## The cook's sandbox

On the chef's Mac, every command a cook runs goes through the sandbox of Claude Code. Brigade writes its
configuration (`runtime/src/bac-a-sable/configuration.ts`) and hands it to `claude` with `--settings`.

### What a cook may do on the network

| A cook may | Detail |
|---|---|
| Reach the allowed hosts | Only the hosts of the project's network list, plus the ones Claude Code and GitHub need to work (`anthropic.com`, `claude.ai`, `claude.com`, `github.com`, `githubusercontent.com` and their subdomains). A host outside the list is refused in every permission mode (`strictAllowlist`). An empty project list adds none. |
| Open a local port, on loopback only | `allowLocalBinding` is `true`: a command may listen on a port of `localhost` (`127.0.0.1`, `::1`). Examples: Gradle, which talks to its daemon through a local port; a local test server started by a test suite. |

What stays closed:

- Opening a local port **does not** open a host: the list of outbound hosts is the same with or without it. The configuration adds no wildcard and no address to it.
- Unix sockets stay refused (`allowAllUnixSockets: false`).
- Loopback only is the sandbox's own rule (Seatbelt, as Claude Code applies it for `allowLocalBinding`), not a setting of Brigade: the configuration has no field that picks the address, and this was not verified on a Mac: Brigade's tests run on Linux and cannot probe the kernel. They assert that the configuration sets `allowLocalBinding` and adds no host.
