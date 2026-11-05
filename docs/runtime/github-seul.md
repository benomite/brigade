# The GitHub-only station: the kitchen's only path

Every project's kitchen runs on GitHub as its only state ([spec](../superpowers/specs/2026-11-02-github-only-state.md),
epic #2053). The project's stations take, cook, review and merge its tickets reading and writing only GitHub:
issues, labels, claim comments, pull requests and the CI of the base. No station is the main one, and stopping one
stops nothing else. The code is `runtime/src/brigade-github.ts`, which chains `github-etat/` (a ticket's and the
base's state, the claim, the review and the merge) and `github-seul/` (the guardrails of a turn, the hold on a red
base, the stale-branch pruning).

## The turn

- **Who opens it.** A per-project runtime (`main.ts`) and each project's kitchen in the multi-project station
  (`station/cuisine.ts`, which is what the box runs) open it at opening, under the name of the station the project
  declares on this machine (`box/claude`). A runtime that cannot serve it says why and cooks nothing for the project:
  `status` then has a `GitHub-only state REFUSED` line with the reason (`GitHub-only state` alone when accepted),
  `facts` carries it as `githubSeul`, and the app puts the refusal at the top of the project
  (`runtime/src/github-seul-etat.ts`).
- **Every 2 minutes** (#2296), a turn takes, cooks, reviews and merges. Each turn reads its tickets, the open PRs with their CI, files and mergeability,
  and the base's CI in one GraphQL query (#2301), and falls back to REST for that turn when the query fails.
- **At most 5 deliveries in pass** (`PASS_MAX`, #2300): while the project has 5 or more tickets `in-pass`, no station
  takes a new ticket. A ticket sent back from the pass to a cook leaves it in the very turn it is sent back.
- **Places.** A station never holds more tickets than its places; a cook that fails keeps its place until the turn
  gives its ticket back on the issue, and at its first turn a restarted station gives back the tickets it held with no
  cook (#2179).
- **A cook that adds nothing.** A cook that resumes a ticket's branch and ends without moving its head delivered
  nothing: it counts as a cook without delivery (`ECHECS_MAX`), so a ticket cannot loop between the cook and a pass
  that already sent that head back (#2372) — unless its PR is open and conflicting with the base or red (#2454): the
  cook is then told in its brief to bring the branch up to date (or start again from the base), and if it still adds
  nothing the ticket is given back with a comment, uncounted, since that is work left, not a failed cook.
- **A red base** holds a delivery's merge only if that delivery runs the same check: a workflow that runs only on the
  base, like the Windows tests, never freezes the pass (#2279).
- **A project with no CI on its PRs** (espace since 2026-10-22, #2456) is judged by its own gates: when none of its
  workflows on the base (`.github/workflows/*.yml`, read by `runtime/src/declencheurs.ts`) runs on a PR that changes
  those files, an approved PR with no gates status on its head has `.claude/brigade/gates.sh` run on that head by a
  station, in a worktree of its branch, with the project's secrets, under a time cap (`BRIGADE_GATES_TIMEOUT_SECONDS`,
  30 min by default, `delaiDesGatesMs`), and the result is posted as the commit status `brigade/gates`
  (`github-etat/gates-de-la-tete.ts`). Green, the PR merges; red, what failed is written on the issue and the delivery
  goes back to a cook like a red CI. The `pending` status is the claim: a fresh one (under 90 min, `GATES_PERIMEES_MS`)
  is awaited, and one left by a station that died during the gates is taken over once it expires. A project with CI on
  its PRs keeps requiring it, and in doubt the CI is awaited.
- **Cost follows events, not time** (#2198): a turn where nothing changed costs no counted GitHub call (its reads are
  conditional); a merge GitHub refuses, or a branch update it asked for, is not retried until the PR or the base
  changes. A ticket served end to end costs about 27 calls, at most 30 (`runtime/test/cout-par-ticket/`).
- **Guardrails.** The chef's stop, the breaker, the Max quota and the arbiter between projects hold a turn's launches
  (`github-seul/garde-fous/`, #2213). An open breaker is said on GitHub by an issue labelled `brigade:breaker-open`
  (`breaker-issue.ts`); a `/resume` comment on it by someone with write access closes the breaker at the next tick
  (`breaker-resume-github.ts`).
- **Stale branches.** The `cook/<n>-github` branches whose issue is closed are deleted, locally and on the origin, at
  each tick (`github-seul/elagage/`).
- **The chef's TODO** is facts on GitHub only: an issue labelled `chef-todo` with its marked comment
  (`github-seul/carte-todo/`), a PR awaiting the chef. The app reads them from GitHub; no runtime writes a board.

## What is gone (#2061)

The main-station code is removed from the runtime. Nothing takes a ticket from the log any more:

- the station of the log (`station.ts` keeps only its configuration), its worktree cleanup, and the remote stations it
  served under leases (`distantes.ts`, `superviseur-distant.ts`, the `remote.asked` events);
- the claim relay through the stations' gists, and the Kitchen board: its writer, its gestures and mentions, its
  single-writer guard (`tableau/`, `board-single-writer.ts`). The board issue (#1683) is no longer written; it can be
  closed. The app no longer reads it either: its rail view, TODO, backlog and the second's queue read the project's
  issues, labels and PRs (`app/src/tableau/lecture.ts`), and the gestures it posted there are gone — the ones that
  have a fact on GitHub write it (`fire` or `waiting` removed, a comment on the ticket's issue,
  `app/src/gestes-github.ts`), the others say where to do it ([app](../app.md));
- the rail feeding from GitHub (`alimenter.ts` keeps only the repository settings and `prio:`), the lease API of the
  log's rail (`rail.ts` keeps only its words), and the old pass (`pass.ts`) with the PR deliveries that relied on it:
  the lessons notebook, the rename of a pause, the settings PR, the correction PR;
- the old-path loops and their `perimee` switch: the closer run, the product role's cadence, the manager's reactions to
  the old pass and station (reaction, triage, no capacity).

The log stays: it keeps the chef's decisions, the guardrails, the sessions and the measures, and its old rail and pass
stay readable as history (`status`, `facts`). Nothing feeds that rail any more and nothing takes a ticket from it: the
box commands that still write rail facts (`rail`, `waiting`, `pass`) only change that history.
