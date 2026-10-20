# The `box/claude` station — spec and plan (#15)

**Date**: 2026-10-08
**Status**: approved on 2026-10-08 — (a) on the seven questions at the end of the document; completed the same day by the two harvest criteria added after the issue was written
**Issue**: #15 "A claude station takes a ticket and hands back a branch"
**Builds on**: `2026-10-08-runtime-stack.md` (§4 driving `claude`), `2026-10-08-runtime-rail.md`
(lend, return, 86), `2026-10-08-garde-fous.md` (guarded launch, `juger`), and
`2026-10-08-brigade-v2-design.md` (§Constraints, §Stations and cooks)

---

## What #15 delivers

The piece that was missing between the rail and the guardrails: something that **comes and takes**
a ticket. The runtime gains a station, `box/claude`, which on every wake-up checks whether it can
serve, takes the first queued ticket, builds a worktree for it, launches a cook under guardrails,
reads how it ends, and hands back to the rail what that ending means.

| Issue criterion | What carries it |
|---|---|
| The station announces itself, the chef sees it | Fact `station.announced` at startup; `stations` projection; command `npm run station` |
| No cook without calibration | The calibration (model + effort) is read from the ticket; missing or ambiguous, the ticket is refused (question 2), never launched with a default |
| The cook has no delivery gesture; a cook that committed then stopped is done | The station **harvests**: what is committed is pushed and goes to pass, however the process stopped (see "Harvest") |
| The log carries the calibration | `cook.launched` gains `model`, `effort`, `station`, `branch` |
| Clean worktree, pushed branch, main tree intact | `git worktree add` from `origin/<base>` in `<state>/worktrees/<run>`; never a checkout in the clone |
| Branch from `v2`, PR to `v2` | `BRIGADE_BASE_BRANCH`, no default; the PR is opened with `--base` |
| Official binary only, never the token | The adapter only launches `claude`; the runtime **refuses to start** if its environment carries `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`; no credentials file is opened |
| Three endings | `done`, `failed`, `86` — plus the expired connection, which is none of the three |
| 86: back to queued, nothing lost, return time | `ticket.86` with `until` (the rail renders it by itself, #14) and `station.86`: the station takes nothing until then |
| Cap of simultaneous cooks = 1 | The station only takes a ticket if no cook is running; the cap is written in `station.announced` |
| Re-read what the cook did | Raw stream `runs/<run>.jsonl` (already #16), and the report in the log (`cook.reported`) |
| The cook comments on its ticket | GitHub comment at the end of the run (question 4) |
| Expired connection detected and reported | `station.disconnected` (question 6), at startup (`claude auth status`) and in a cook's stream |
| A cook never merges | The cook's instruction, merge tools forbidden at launch (question 3); the hard guarantee remains branch protection (#17) |

## What was tested before writing

Measured on 2026-10-08 on the Mac (`claude` 2.1.285). **Quota consumed: a single real call**, a
one-word answer in `haiku` / `low` (107 output tokens). The rest cost nothing.

- **The calibration is two options of the binary**: `--model <alias>` and
  `--effort <low|medium|high|xhigh|max>`.
- **Normal stream**: `system/init`, `assistant` lines (one message spread over several lines),
  `rate_limit_event`, then `result` — `subtype: "success"`, `is_error: false`,
  `terminal_reason: "completed"`, `result: "<last message>"`, exit code 0.
- **`rate_limit_event`**: `rate_limit_info.status` (`allowed` observed), `rateLimitType`
  (`five_hour`), `resetsAt` in **seconds** since the epoch, and `unifiedWindows` (rate of the 5 h
  and 7 day windows).
- **Logged-out session** — provoked without quota, through an empty configuration directory
  (`CLAUDE_CONFIG_DIR`): a synthetic `assistant` line carrying
  `error: "authentication_failed"` and `is_api_error_message: true`, then a `result` with
  `is_error: true` and `terminal_reason: "api_error"`, **exit code 1**. Note that
  `subtype` is still `"success"` there — so it says nothing about success.
- **`claude auth status`** answers in JSON (`loggedIn`, `authMethod`), code 1 if logged out, with
  no call to the model at all.

**End-to-end trial**, after the code: a real cook (`haiku` / `low`) launched by the station on a
disposable local repository, with a fake `gh`. It committed in `bypassPermissions`, the station
pushed its branch and put it in pass — 14 turns, 25,000 tokens, one minute. Second and last real
call. It also showed that a cook loads the account's plugins and hooks (issue #41).

**Not tested, and said so**: the stream of a **really** exhausted quota. Provoking it means
burning the chef's quota; I did not. The detection relies on the shape observed for the
authentication failure, transposed: an `assistant` line carrying `error: "rate_limit"`, or a
`rate_limit_event` whose `status` is `rejected` — the values documented by the stream's type. The
fake `claude` replays this **reconstructed** shape, not a recorded one. The first real 86 will leave
its stream in `runs/`: that is the one to compare against, and the recipe says so.

Likewise, the **expired** connection was not provoked (we would have to wait for the expiry): the
recorded stream is that of a **logged-out** session, which takes the same error path.

## Modules

| File | Role |
|---|---|
| `src/evenements/station.ts` | The station's facts |
| `src/projections/stations.ts` | The station's state: announcement, connection, 86 |
| `src/calibrage.ts` | Read model and effort from an issue's labels |
| `src/claude.ts` | The engine adapter: the binary's arguments, the cook's instruction, reading the raw stream, verdict |
| `src/depot.ts` | The git gestures: the cook's worktree, commits to push, push. Injected into the station: most of its tests give it a fake, and `depot.test.ts` tests the real one on local repositories |
| `src/station.ts` | The loop: be able to serve, take, launch, conclude |
| `src/montrer-station.ts` | `npm run station`, read-only |

Touched: `evenements/garde-fous.ts` and its projection (`cook.launched` enriched),
`evenements/rail.ts`, `alimenter.ts` and the rail projection (the ticket's calibration; back to
queued on `cook.exited` and `cook.interrupted`), `github.ts` (comment, open a PR), `main.ts`,
the systemd unit, `docs/runtime.md`.

## Logged facts

| Fact | Ticket | Payload | Author |
|---|---|---|---|
| `station.announced` | — | `station`, `engine`, `provides`, `maxCooks` | `station:box/claude` |
| `ticket.86` (existing) | yes | `reason: "no-calibration"`: the refusal of an uncalibrated ticket | `station:box/claude` |
| `cook.launched` (enriched) | yes | + `station`, `model`, `effort`, `branch`, `worktree` | `runtime` |
| `cook.reported` | yes | `run`, `ending` (`done`, `failed`, `86`, `disconnected`), `reason`, `summary`, `branch`, `pr` | `station:box/claude` |
| `station.86` | — | `reason`, `until`, `window` (`five_hour`, `seven_day`) | `station:box/claude` |
| `station.disconnected` | — or yes | `reason`, `run` | `station:box/claude` |

`ticket.arrived` and `ticket.changed` gain `model` and `effort` (null when the ticket is not
calibrated). A fact written before #15 does not carry them: it reads as uncalibrated.

## The station's loop

At every wake-up of the runtime, and as soon as a cook ends:

1. **Can it serve?** No if a cook is running (cap 1), if the kitchen is stopped or the breaker
   open (#16), if the quota is exhausted and its return time has not passed, if the connection is
   held to be expired.
2. **Take**: `rail.prendre("box/claude")`. The lease is renewed as long as the cook lives.
3. **Calibration**: read from the ticket. Missing → refusal (question 2), and start again at 2.
4. **Worktree**: `git fetch origin <base>`, then
   `git worktree add -b cook/<ticket>-<run> <state>/worktrees/<run> origin/<base>`.
5. **Launch**, through the guarded launch of #16:
   `claude -p <instruction> --output-format stream-json --verbose --model <m> --effort <e>` (plus
   the permission options, question 3), in the worktree.
6. **Conclude**, according to the ending read in the raw stream and the exit code:

| Ending | Recognized by | Breaker | Rail |
|---|---|---|---|
| **done** | at least one commit on the branch, and the branch pushed — whether the cook concluded (code 0, `result` without error), exited with an error, or was stopped by a guardrail | success | PR opened, `ticket.passing` |
| **failed** | no commit (even if the cook says it finished), or a push that is impossible | failure | back to queued (question 5) |
| **86** | `error: "rate_limit"` or a rejected `rate_limit_event`, and the cook did not conclude | neutral | `ticket.86` until `resetsAt`, `station.86` |
| expired connection | `error: "authentication_failed"` | neutral | back to queued, `station.disconnected` |
| the chef's "stop" | already #16 | neutral | back to queued, nothing is harvested |

An exhausted quota **without** a return time in the stream: the station gives itself one, an hour
later, rather than stay 86 until someone lifts it by hand.

### Harvest

Two criteria added to the issue during development (field feedback "idle post-commit"):
the cook has no delivery gesture to perform, and a cook that committed then stopped is done.
So the station does not trust what the cook announces: **the worktree is the authority**.

- Commits, whatever the end of the process — exit with an error, stream without `result`, stop
  by inactivity or by a cap: pushed, and the ticket goes to pass. The reason stays readable
  (`cook.reported.reason` is `harvested:<why>`, and `guard.tripped` is in the log).
- For this, `juger` is now consulted also when a guardrail stopped the cook: if it says
  "ok", the ending is a success; otherwise it stays a guardrail stop, as before.
- **Two endings are not harvested.** The chef's "stop": they asked for everything to stop, not
  for a PR to be opened. And the exhausted quota: the issue's criterion wants the ticket to go back
  to queued at the time the quota returns.

It is the pass (#17) that judges whether the harvested work is complete: the station can only note
that it exists.

**What this ticket does not do** from the updated design spec (PR #28): there, the lease is renewed
on proof of work, and inactivity is measured on the worktree. Here the lease is renewed as long as
the cook lives, and inactivity stays that of #16, measured on the stream. That is issue #35.

**The join left by #14 and #16.** `cook.exited` — when the outcome is `failed`, `guard` or `stop`
— and `cook.interrupted` put the taken ticket back to queued **in the rail projection**, with no
extra fact: the reason is already in the ticket's log (`guard.tripped`, then `cook.exited`).

**The worktree stays** after the cook ends, whatever the ending: that is where the pass (#17) will
play the gates, and where the chef looks when a cook fails. The cleanup is not in this ticket.

**A crash between two writes**: each step writes its result before the next. A runtime
killed after `cook.exited` but before `ticket.passing` leaves a taken ticket, without a cook: its
lease expires, it goes back to queued — the rail of #14 already does this work.

## Configuration

| Variable | Default | Role |
|---|---|---|
| `BRIGADE_REPO_DIR` | none — refuses to start | A clone of the project's repository, reserved for the station. It only does `fetch` and `worktree add` there: its working tree is never modified |
| `BRIGADE_BASE_BRANCH` | none — refuses to start | The integration branch: where the worktree starts from, where the PR aims (`v2` for the pilot) |
| `BRIGADE_CLAUDE_BIN` | `claude` | The binary. Used by the tests; **never set on the box** |

## Boundaries with neighbouring tickets

- **#17 (pass)** starts from `ticket.passing` and the opened PR. It alone merges.
- **#18 (state CLI)** reads the same projections. `npm run station` is the minimum so that the
  criterion "the chef sees it" does not depend on it; it may absorb it.
- **Milestone 2**: the manager will set the calibration. **Milestone 4**: adjustable cap, arbitration.

## Plan

Each step: the test first, red, then the code.

1. Calibration: reading the labels; `ticket.arrived` / `ticket.changed` carry it; replay.
2. The station's facts and projection; rail put back to queued on `cook.exited` / `cook.interrupted`.
3. `claude` adapter: arguments, verdict on the recorded streams (done, failure, 86, logged out).
4. Git gestures: worktree from the base, main tree intact, push.
5. The station: loop, cap 1, refusal without calibration, the endings, lease renewed, restart.
6. GitHub: comment and PR through the fake `gh`.
7. `main.ts`, refusal to start, systemd unit, `npm run station`.
8. `docs/runtime.md`: the station, the recipe for the first cook.

## Questions settled — (a) on all seven, on 2026-10-08

By the chef: 1, 2, 3 and 6. By the Manager: 4 (it is a criterion of the issue), 5 and 7.

**1. Where does the chef set the calibration on the ticket?**
The issue says "set by hand on the ticket"; #19 (question 6) asks not to invent a ticket format
before milestone 2.
- **(a) Two labels, `model:<opus|sonnet|haiku>` and `effort:<low|medium|high|xhigh|max>`.** Same
  family as `prio:N`, which the rail already reads. They are closed, few values — what a label
  carries well, the argument kept for the domain label. Two `model:` labels on the same ticket:
  ambiguous, hence refused.
- (b) A marked line in the issue body: that is the format #19 asks not to improvise.
- (c) A chef command that writes the calibration into the log: invisible on GitHub.

**2. What becomes of a ticket without calibration?**
- **(a) It goes 86, reason `no-calibration`, with no return time**, with a comment on the
  issue saying what to set. The chef sees it in the rail; as soon as both labels are there, it
  comes back to queued by itself.
- (b) It stays queued and the station skips it: nothing tells the chef why it does not leave, and
  the ticket visually blocks the head of the rail.

**3. What permissions for a cook with nobody in front of it?**
`claude -p` cannot answer any permission request: without a setting, it can neither edit nor
run a command. The generated grants are in milestone 3.
- **(a) `--permission-mode bypassPermissions`, with a list of forbidden tools**:
  `gh pr merge`, `git push`, `git merge` towards the base. The cook edits, tests and commits freely
  in its worktree; the station pushes (question 4). Worth knowing: the list is a
  good-faith guardrail, not a fence — a determined cook gets around it. The fence is
  branch protection (#17) today and the container in milestone 7. The box has no prod access.
- (b) `acceptEdits` and a whitelist of commands: each project has its own (`npm`,
  `pytest`…), and a cook blocked on an unforeseen command fails silently.
- (c) Only the repository's settings (`.claude/settings.json`): shifts the problem onto each project.

**4. Who pushes the branch, opens the PR and comments on the ticket?**
- **(a) The station, in code.** The cook commits and ends with its report. The station checks
  that there are commits, pushes `cook/<ticket>-<run>`, opens the PR to the base, and posts as a
  comment the cook's last message under a header: ending, calibration, turns, tokens, duration,
  branch, PR. Guaranteed even if the cook forgets — and the comment also goes out when the cook
  **fails** (with the reason), not when it is 86 (normal state: it reads in the rail, a
  comment per quota window would be noise).
- (b) The cook does it itself, on instruction: a freer report, but nothing guarantees that it
  exists, and the cook must then have the right to push.

**5. Is a ticket whose cook fails taken up again right away?**
- **(a) Yes.** It goes back to queued (that is the join asked for by the qualification), the station
  takes it up with a fresh cook, and the breaker of #16 bounds the series: three failures in a row,
  nothing leaves before "resume". Maximum cost of an infeasible ticket: three cooks.
- (b) It goes 86 until the chef returns it: only one cook lost, but a kitchen that
  stops at the first failure, including a transient one.

**6. Expired Max connection: how does the chef learn of it, and how does the station restart?**
- **(a) Reported in three places, resumed by "resume".** `station.disconnected` in the log,
  the state in `npm run station`, and a comment on the ticket that suffered it — the only
  channel visible outside the box in milestone 1. The ticket goes back to queued, nothing is counted
  against the breaker, the station takes nothing more. After their `claude /login`, the chef says "resume"
  (the command of #16). At startup, the station also runs `claude auth status`: logged out,
  it says so immediately instead of waiting for the first cook.
- (b) Automatic resume as soon as `claude auth status` answers logged in: this command does not
  always see an expired session, so the station would relaunch a cook every minute for nothing.

**7. Does the calibration accept other models than the three aliases?**
- **(a) No: `opus`, `sonnet`, `haiku`, the three the spec names.** A value outside the list is
  an uncalibrated ticket (question 2). An unknown alias passed to the binary would give a failed
  cook, counted against the breaker.
- (b) Any value is passed as is to `--model`.
