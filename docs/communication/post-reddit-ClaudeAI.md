# Post for r/ClaudeAI

Status: **rules not verified, chef to read the page before posting** (see [`plan-lancement.md`](plan-lancement.md)). Nothing is posted from this repository.

## Title

I built a "kitchen" that serves my GitHub tickets with Claude Code cooks while I'm away — and a pass that reviews each delivery before it merges

## Body

I'm a solo dev and I got tired of babysitting agent sessions, so I built Brigade (open source) around one idea: all coordination lives in GitHub, never in a session's memory.

How it works, with the words the project uses:

- **Tickets and the rail.** I write tickets with observable acceptance criteria and put the `fire` label on the ones to serve. They go on the **rail**.
- **The kitchen.** On a **box** (any always-on machine), the runtime runs a **station**. It takes a ticket from the rail and launches a **cook**: a real `claude` session in its own git worktree, one cook per ticket.
- **The pass.** When a cook hands back its **delivery**, the **pass** judges it: the repo's **gates** (tests, type check) plus a reviewer. Only a green ticket merges, and then it is **served**.
- **Guardrails.** Caps on turns, tokens, duration and simultaneous cooks, a `stop` for the whole kitchen, and a breaker that stops it after repeated failures.
- **Awaiting.** The only things that reach me are what sits under **awaiting**: a decision, an answer, a merge to approve. A Mac app (**All projects** overview) shows it, and the same facts are one command away in a terminal.

Cooks that fail leave their reason in the **log** (an append-only journal), so I can read what happened without replaying anything.

It is young and opinionated. What I'd most like to hear from people who run Claude Code on real projects: does a ticket-in, delivery-out loop with a separate pass match how you'd trust agents with your repo, and where would you want a human gate that I haven't put?

Repo (README and docs inside): https://github.com/benomite/brigade
