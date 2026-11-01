# Post for r/ClaudeAI

Status: **rules not verified, chef to read the page before posting** (see [`plan-lancement.md`](plan-lancement.md)). Nothing is posted from this repository.

## Title

I built an open-source app where Claude Code cooks work my GitHub tickets, and an independent pass reviews every PR before it merges

## Body

I'm a solo dev. I got tired of babysitting agent sessions, so I built Brigade around one idea: all the coordination lives in GitHub, never in a session's memory.

**How you use it:**

1. Download the app (Mac or Windows), sign in with GitHub and with your Claude account. No server, no ssh, no config file.
2. Pick one of your repositories.
3. Open an issue with observable acceptance criteria and put the `fire` label on it.

**What happens next, using the project's own words:**

- **The rail.** The ticket joins the rail, the queue the kitchen serves in order.
- **A cook takes it.** A cook is a real `claude` session working in its own git worktree, one cook per ticket. It implements the ticket and opens a pull request.
- **The pass judges the PR.** It runs your repo's gates (tests, type check, CI) and an independent review. Only a green PR merges, and then the ticket is **served**.
- **Guardrails.** Caps on duration, tokens and simultaneous cooks, a `stop` for the whole kitchen, and a breaker that stops it after repeated failures.
- **What reaches you.** You only see what **awaits** you: a product decision, a gesture only you can make. Everything else, the kitchen handles. A **second** in the app's terminal helps you write and prioritize tickets.

If a cook dies mid-ticket, the committed work survives and the next cook picks it up from there. A second computer can join the kitchen through GitHub alone.

I use it daily to build Brigade itself: 98 of its last 100 merged PRs were cooked and merged this way.

It's young and opinionated, and it runs on your Claude subscription (an API key does not fit). Here is what I'd most like to hear from people running Claude Code on real projects: does a ticket-in, reviewed-PR-out loop match how you'd trust agents with your repo? And where would you want a human gate that I haven't put?

Repo (README, install guide, docs): https://github.com/benomite/brigade
