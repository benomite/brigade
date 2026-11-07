# Post for r/ClaudeAI

Status: **superseded by [`docs/marketing/launch-plan.md`](../marketing/launch-plan.md), do not post this draft**; rules not verified, chef to read the page before posting** (see [`plan-lancement.md`](plan-lancement.md)). Nothing is posted from this repository.

## Title

I built an open-source app where Claude Code cooks work my GitHub tickets, and an independent pass reviews every PR before it merges

## Body

I'm a solo dev. I got tired of babysitting agent sessions, so I built Brigade around one idea: all the coordination lives in GitHub, never in a session's memory.

**How you use it:**

1. Download the app (Mac or Windows), sign in with GitHub and Claude. No server, no ssh, no config file.
2. Pick one of your repositories.
3. Open an issue with observable acceptance criteria and put the `fire` label on it.

**What happens next, in the project's words:**

- **The rail.** The ticket joins the rail, the queue the kitchen serves in order.
- **A cook takes it.** A real `claude` session in its own git worktree, one cook per ticket. It implements the ticket and opens a pull request.
- **The pass judges the PR.** Your repo's gates (tests, type check, CI) and an independent review. Only a green PR merges, and the ticket is then **served**.
- **Guardrails.** Caps on duration, tokens and simultaneous cooks, a `stop`, and a breaker after repeated failures.
- **What reaches you.** Only what **awaits** you: a product decision, a gesture only you can make. A **second** in the app's terminal helps you write and prioritize tickets.

If a cook dies mid-ticket, the committed work survives and the next cook resumes from it.

I use it daily to build Brigade itself: 98 of its last 100 merged PRs were cooked and merged this way.

It's young and opinionated, and runs on your Claude subscription (an API key does not fit). Does a ticket-in, reviewed-PR-out loop match how you'd trust agents with your repo? Where would you want a human gate I haven't put?

Repo (README, install guide, docs): https://github.com/benomite/brigade
