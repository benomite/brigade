# Isolation and the network filter

**The rule: every agent runs isolated to its project and behind the network filter, on every station.**
A station that cannot set up the isolation or the filter launches no agent for that project. No setting
turns this off.

## What the rule means

- **Isolation.** An agent cannot read another project's clone, worktrees, state or secrets: `bwrap` on
  Linux, Claude Code's sandbox on macOS.
- **The network filter.** An agent reaches only the hosts of its project's allowed list
  (`.claude/brigade/reseau`): through its project's gate on Linux, through the sandbox's allowlist on macOS.
  A host outside that list is refused.
- **No station without both.** A station that cannot set up the isolation or the network filter — Windows,
  a Linux desktop without `bwrap`, a Mac whose sandbox is not usable — launches no agent for that project.
  No setting changes this.

## Why: the lethal trifecta

An agent that has private data, reads untrusted content and has a way to send data out can leak the
private data through a prompt injection: a hidden instruction in the untrusted content makes the agent
send the data away. Detecting injected instructions does not protect, because detection misses some of
them. The only sound defence is to never combine the three. The rule above is how Brigade keeps an agent
from holding all three at once. See Simon Willison's article on the
[lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/).

## Where the rule is implemented

- [The agents' sandbox](bac-a-sable.md): `bwrap` on Linux, Claude Code's sandbox on macOS, and what an agent may do
  on the network.
- The kitchen's launch: `runtime/src/bac-a-sable/kitchen-launch.ts` and `kitchen-sandbox.ts`; the gates:
  `runtime/src/station/portes.ts`.
