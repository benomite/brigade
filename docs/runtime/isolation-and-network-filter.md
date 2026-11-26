# Isolation and the network filter

**The rule: every cook runs isolated to its project and behind the network filter, on every station.**
A station that cannot set up the isolation or the filter launches no cook for that project. No setting
turns this off.

## What the rule means

- **Isolation (the [partition](cloison-et-arbitre.md)).** A cook cannot read another project's clone,
  worktrees, state or secrets. This holds on Linux, Mac and Windows.
- **The network filter (the [door](cloison-et-arbitre.md)).** A cook reaches only the hosts of its
  project's allowed list. A host outside that list is refused, and the refusal is logged in the
  project's log.
- **No station without both.** A station that cannot set up the isolation or the network filter
  launches no cook for that project. No setting changes this.

## Why: the lethal trifecta

An agent that has private data, reads untrusted content and has a way to send data out can leak the
private data through a prompt injection: a hidden instruction in the untrusted content makes the agent
send the data away. Detecting injected instructions does not protect, because detection misses some of
them. The only sound defence is to never combine the three. The rule above is how Brigade keeps a cook
from holding all three at once. See Simon Willison's article on the
[lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/).

## Where the rule is implemented

- [The partition](cloison-et-arbitre.md): files and processes, and the network allowlist.
- [The cook's sandbox](bac-a-sable.md): what a cook may do on the network.
