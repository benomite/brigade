# The manager decides what goes on the rail, and calibrates it — spec and plan (#69)

**Date**: 2026-10-08
**Status**: decided — the seven product decisions below are the chef's, relayed by the
Manager on 2026-10-08; the choices in the "What the dev decided" section can be contested in review
**Issue**: #69 "The manager decides what goes on the rail, and calibrates it" (epic #75, milestone 2)
**Builds on**: `2026-10-08-brigade-v2-design.md` (§The manager, §Principles 2, §Calibration is
decided per ticket), `2026-10-08-runtime-rail.md` (polling under ETag), `2026-10-08-garde-fous.md`
(caps, breaker, "stop"), `2026-10-08-fiche-du-ticket.md` (which is authoritative on an issue),
`2026-10-08-pass-et-grant-merge.md` (a chef command, a fact in the log — precedent imitated).

---

## What the chef decided

| # | Decision |
|---|---|
| 1 | The manager is **off** until the chef turns it on: a command, a fact in the log, revocable — like the `merge` grant. Once on, it judges the whole open backlog. An issue that carries `blocked-on-human` is never judged. |
| 2 | The code sets aside without an LLM: the roadmap (`BRIGADE_ROADMAP_ISSUE`, optional), and the labels `epic`, `question`, `decision`, `blocked-on-human` — recognized if they are there, never required. No reading of titles. The rest goes to the LLM, which may also conclude "epic / question / decision". |
| 3 | A refusal leaves a comment (the reason, what would make the ticket executable) and a fact in the log. No label. The issue is rejudged when it changes. |
| 4 | `fire` set by the chef on what the code sets aside: the manager removes nothing, does not calibrate, says so once. Without calibration no cook leaves (86 `no-calibration`). |
| 5 | `BRIGADE_MANAGER_MODEL` and `BRIGADE_MANAGER_EFFORT` are **mandatory**: without them, refusal to start (code 2). |
| 6 | The ticket type → calibration table below. `xhigh` and `max` are never set by the manager. |
| 7 | The manager only judges issues whose author is `OWNER`, `MEMBER` or `COLLABORATOR`, and only reads those people's comments — the card's rule. |

| Ticket | Calibration |
|---|---|
| doc, rename, fix whose test is already written | `haiku` / `low` |
| mechanical `fix`/`tech` on a known module | `sonnet` / `low` |
| non-mechanical `fix`/`tech`, or any issue with precise acceptance criteria | `sonnet` / `medium` |
| `feature`, cross-cutting refactor, core of the product | `opus` / `high` |

Confirmed givens: the manager only judges what is not calibrated and fired; it sets labels on an
issue **only once** — after which everything it carries belongs to the chef (a removed `fire` is
not set again, a changed calibration is not rewritten); it never sets a label in a dimension that
already carries one; the judgment goes through the guardrails and does not happen during a quota 86;
a card "awaiting: #N" holds nothing back here (#70).

> **Since #71**, the `epic` label is no longer a set-aside: an issue that carries it, or that the
> judgment calls `epic`, is **to be split** (`2026-10-08-decoupage-epique.md`). Decisions 2 and 4
> still hold for the roadmap, `question`, `decision` and `blocked-on-human`.

## What the dev decided

- **A judgment is a cook in the log.** It leaves through the guardrails' `lancer`: `cook.launched`
  (station `manager`, model, effort), `cook.exited` (turns, tokens, duration). Its ticket is null
  there: it holds no ticket of the rail, and the projections of the rail and of the pass ignore it.
  The link with the judged issue is carried by `manager.judged` (`run`).
- **A successful judgment is `neutral` for the breaker**, an unreadable judgment `failed`. An
  "ok" would reset the cooks' consecutive failures: three failed cooks separated by successful
  judgments would never open the breaker.
- **"Once per state" is measured on what the LLM reads**, not on `updatedAt`: the fingerprint of
  the title, the body and the trusted comments, minus the manager's own (marker
  `<!-- brigade:manager -->`). Its own labels and comments move `updatedAt` without changing the
  fingerprint: it does not wake itself up. `updatedAt` only serves as an in-memory cache, so as not
  to reread the comments of an issue that has not moved.
- **An unreadable judgment is not retried on the same state**: it is in the log
  (`manager.failed`), stated in a comment, and the issue is rejudged when it changes. Unreadable
  means: ran to its end, with an answer the code cannot read. A judgment stopped by
  "stop", by the quota or by a disconnection, or that did not complete (outage, error exit,
  guardrail), is not a judgment: it restarts on its own, writing nothing on the issue, and the
  breaker bounds the attempts.
- **Labels are reread just before being set**, and the sort goes over them again: between reading
  the list and setting, other judgments may have lasted minutes.
- **Off during a judgment**, the manager sets nothing: the decision stays in the log and is set,
  without rejudging, at the next "on".
- **An exhausted quota or an expired connection, seen by a judgment, hold the station back**: the
  same `station.86` / `station.disconnected` facts as a cook's, since it is the same account.
- **The decision is written before its effects**: `manager.judged`, then the labels
  (`manager.labeled` after the call), then the comment (`manager.commented`). An outage between
  two is resumed without rejudging. A runtime that died between setting the labels and their fact no
  longer knows it set them: they then belong to the chef, which costs nothing.
- **Just one more poll**, the list of open issues under its own ETag, confirmed only when nothing
  is waiting any more: a wake-up with nothing to qualify costs one conditional request, and no
  quota.
- **The LLM judges without a tool** (`--tools ""`), outside any worktree. The issue is given to it
  as data, and its answer is a JSON object reread by code: verdict, reason, calibration,
  justification.

## Plan

1. `github.ts`: `ouvertes()` (list under ETag, with body and author link), `labelliser()`.
2. `evenements/manager.ts`, `projections/manager.ts`: the switch, and the state of each issue.
3. `juger.ts`: the instruction, the arguments of `claude`, the reading of the decision.
4. `manager.ts`: `configManager`, `brancherManager` — sort by the code, judgment, application.
5. `manager-cli.ts`: view, `on`, `off`.
6. `main.ts`, systemd unit, `docs/runtime.md`.
