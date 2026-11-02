# GitHub as the only state of a kitchen

*Product spec, 2026-11-02, the second with the chef. Status: **decided by the chef, 2026-11-02** — see "Decisions".*

## Why

Simplification is the project's first objective. Today a project's kitchen has two sources of truth:
GitHub (issues, labels, branches, pull requests) and the **log of the main station** (`log.db`), which
holds what GitHub does not: who holds which ticket, until when, the attempts, the base state, the
breaker, the waiting reasons, the consumption. That second source costs:

- **a main station**: the rail, the manager and the pass run only there. If its machine stops, the
  kitchen stops, whatever the number of stations (`docs/runtime/station-distante.md`);
- **a mailbox**: the other stations ask through their gist and are answered on the Kitchen board,
  which is both a view and a coordination channel;
- **a large runtime**: about 73,000 lines in `runtime/src`, about 230 event types.

The chef's question (2026-11-02): *why can't everything be information and labels on the issues?*

## The proposal: a ticket lives entirely in its issue

| Step | Today (main station's log) | Proposed (GitHub only) |
|---|---|---|
| Fired, prioritized | labels `fire`, `prio:` | unchanged |
| Taken by a station | written in the log, one claim at a time | the station posts a **claim comment**; when two claim at once, the earliest comment wins (GitHub orders comments), the other lets go; label `taken` |
| Still held | lease in the log | the station refreshes its claim comment; a station silent past the lease loses the ticket, any station may take it back |
| Delivered | the main station opens the PR | the cooking station opens the PR; label `in-pass` |
| Judged | the main station's pass and reviewer | **any station** reviews and posts its verdict as a comment |
| Merged | the main station's pass, one at a time on a green base | GitHub's rule "branch up to date before merging" plus auto-merge: GitHub itself refuses a merge on a base that moved |
| Base red / green | the log | the status of the latest commit of `main` (CI already exists) |
| WAITING | label `waiting` + comment | unchanged |
| Attempts, stop reasons, tokens | the log | one closing comment per cook |

**What disappears**: the main station, the mailbox role of the Kitchen board, the log as arbiter, the
claim relay. Every station is equal; any one can stop without stopping the kitchen.

**What stays local**: the measures a station keeps for itself, and only for display.

## GitHub API calls

Limits for a personal account: **5,000 calls per hour**, shared by every token of the account (the
stations, the app, the chef); a secondary limit on writes (about 80 per minute, 500 per hour). A
**conditional read answered "not modified" (304, with an ETag) does not count**; the runtime already
uses ETags (`runtime/src/github.ts`).

| Item | Calls |
|---|---|
| Each station rereads the fired issues every 30 s | 120 / hour / station, almost all free 304s |
| One ticket, from claim to merge | about 20 writes |
| 50 tickets a day | about 1,000 writes a day, 40–80 / hour at peaks |

Ten stations stay at a few hundred paid calls per hour. For comparison, on 2026-11-01 the box alone
used about 1,200 calls in one hour, 432 of them reading pull requests: the cost today is how the
runtime reads, not the model. **Two rules**: every reread is conditional; a station writes only when
something changes. If a project ever outgrows the account's quota, a GitHub App gives a quota that
grows with the repository, with nothing else to change.

**To measure before deciding**: the real number of calls per ticket on the box, today.

## GitHub Projects

A GitHub Project (v2) is a board over issues, with custom fields (status, priority…) and board or
table views, readable on a phone.

- **As a view, it may help**: the rail, TODO and WAITING could be a Project view the chef opens
  anywhere, including Android, with no app to maintain for it.
- **As an arbiter, it does not**: a field update is no more atomic than a label, and its API is
  GraphQL only. It does not replace the claim comment.
- **One rule if used**: a state lives in one place only — a Project field **or** a label, never both.

## Decisions (chef, 2026-11-02)

1. **We go for it.**
2. **The app's rail view stays, as a view of GitHub and an entry point for gestures**: answering a TODO
   card, asking the second. It reads only GitHub and writes only to GitHub (labels, comments). No
   GitHub Project view next to it: one view per project. The Kitchen board issue keeps no
   coordination role.
3. **Migration one project at a time.** For a project: let its rail drain (no ticket taken or in
   pass), switch it to the GitHub-only model, and its stations take tickets from the issues from then
   on. Nothing is copied over: the old log stays readable as history. Once every project has moved,
   the main-station code (claim relay, mailbox, log as arbiter) is removed. brigade moves first.

## Out of scope

The cooks' worktrees, the gates, the sandbox, the capabilities of stations: unchanged.
