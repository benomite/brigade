# The rail — spec and plan (#14)

**Date**: 2026-10-08
**Status**: approved on 2026-10-08 — (a) on the four questions at the end of the document
**Issue**: #14 "The rail carries a project's tickets and lends each one out only once"
**Builds on**: `2026-10-08-runtime-stack.md` (§2 GitHub polling, §3 "lend only once") and
`2026-10-08-runtime-journal.md` (extension rule, projections, cursors). This document
re-decides nothing found there. Decisions already made on #19: an issue enters the rail
through the **`fire`** label; the service order is **`prio:` then age**; the
`project → owner/repo` link is a configuration that #14 sets up.

---

## What #14 delivers

A project's rail: the queue of its tickets, fed from GitHub, and the primitive that lends one
to a station — one station at a time. **No cook, no call to `claude`**: #14 only runs `gh`, so it
consumes no Max quota.

| Issue criterion | What carries it |
|---|---|
| Open issues appear on the rail; a closed issue disappears from it | `gh api` polling at startup then at every tick; the gap between GitHub and the rail becomes `ticket.arrived` / `ticket.left` events |
| Each ticket carries a status the chef can read | `rail` projection: one line per ticket, with its status |
| A taken ticket cannot be taken by another station; the chef sees who and since when | `prendre` (take): check and write `ticket.taken` in a single `BEGIN IMMEDIATE` transaction; the projection keeps the station, the time of taking and the lease expiry |
| A station that dies: the ticket goes back to queued after a delay, with the trace | Lease with an expiry, which the station renews; at the tick, an expired lease becomes `ticket.released` (reason `lease-expired`) |
| The rail is rebuilt identically after a restart | The rail is a projection: erased and replayed at every startup. Nothing lives in memory |

## Modules

Following #13's extension rule: two domain files, one line in each registry.

```
runtime/src/
  evenements/rail.ts     the rail's facts
  evenements.ts          + one line (Fait union)
  projections/rail.ts    the `rail` table and its reads (the sorted rail, one ticket)
  projections.ts         + one line (registry)
  rail.ts                the actions: take, renew, return, send to pass, serve, 86,
                         and collect expired leases
  github.ts              the polling: `gh api`, conditional request, issues → tickets
  alimenter.ts           the GitHub ↔ rail gap, written to the log; configuration; hooking onto wake-ups
  montrer-rail.ts        `npm run rail`: the rail, read-only
  main.ts                + two lines: read the rail configuration before starting, hook the rail up afterwards
```

`runtime.ts` is not modified: the rail subscribes through `surReveil`, the mechanism #13 laid
down for this.

**An unreadable rail fact is ignored by the projection** (no ticket, or a shape this version
does not know): the log is append-only and replayed at every startup, so a fact that made the
projection throw would stop the runtime from restarting, with no way to remove it.

**Hook left to #15**: return the ticket when its cook finishes or is found interrupted
(`cook.exited`, `cook.interrupted`, introduced by #16). #14 delivers the return action; these facts
did not exist yet on `v2`.

## The states

| State (chef) | In the database | Meaning |
|---|---|---|
| **queued** | `waiting` | on the rail, to be taken |
| **taken** | `taken` | lent to a station, under a lease |
| **in pass** | `pass` | the cook is done; gates, CI, review, merge (#17) |
| **served** | `served` | passed — stays visible on the rail as long as its issue is open |
| **86** | `86` | not servable for now (quota exhausted, station absent) |

```
            take                    in pass                serve
queued ────────► taken ─────────────────► in pass ─────────────► served
     ▲                 │ lease expired / returned │ sent back (#17)
     ├─────────────────┘◄────────────────────────┘
     │   86 (from queued or taken)
     └──────── 86 ◄──────
```

#14 sets up **all** the states and the actions that lead to them, guarded (only a ticket in pass
is served; only the station holding the lease renews it or sends it to pass). What triggers them
comes later: the cook (#15) takes, renews and signals the 86; the pass (#17) serves or sends back.

**A consequence to know**: a **served** ticket disappears from the rail when its issue closes.
On `v2`, a merged PR does not close its issue (`Closes #n` only acts on the default branch): a
served ticket stays displayed there as "served" until someone closes the issue. This is accurate,
and harmless — a served ticket is never taken again.

## The events

English names, like #13's. All carry the ticket number.

| Type | Author | Payload | Effect on the rail |
|---|---|---|---|
| `ticket.arrived` | `github` | `title`, `priority` (1, 2, 3 or nothing), `createdAt`, `url` | new line, queued |
| `ticket.changed` | `github` | `title`, `priority` | title or priority updated |
| `ticket.left` | `github` | `reason`: `closed` \| `unfired` \| `gone` (issue deleted) | the line disappears, whatever its state |
| `ticket.taken` | `station:<name>` | `station`, `leaseUntil` | taken |
| `ticket.renewed` | `station:<name>` | `leaseUntil` | expiry pushed back |
| `ticket.released` | `runtime` or the station | `reason`: `lease-expired` \| `returned` \| … , `station` | back to queued |
| `ticket.passing` | `station:<name>` | — | in pass, lease closed |
| `ticket.served` | `runtime` | — | served |
| `ticket.86` | `runtime` or the station | `reason`, `until` (time of return, or nothing) | 86, lease closed |

**Time never enters the projection.** An expired lease does not release the ticket by itself:
it is a `ticket.released` event, written by the runtime, that releases it. Without that, replaying
the log at another hour would give another rail. `prendre` collects expired leases in its own
transaction, before choosing: a ticket therefore never waits for the tick to become takeable again.

## Feeding the rail from GitHub

- **Source**: `gh api repos/<owner>/<repo>/issues?labels=fire&state=open`, PRs filtered out.
  `gh` carries the authentication; the runtime reads no token.
- **Conditional request**: the `ETag` of the last response is sent back as `If-None-Match`;
  a `304` costs nothing against the API quota and produces no event (tried on 2026-10-08
  with `gh` 2.100: `gh api -i` exits with code 1 with `HTTP/2.0 304` at the top). The `ETag` is an
  in-memory cache: losing it costs one full request, not a state. Beyond one page of
  100 tickets, polling becomes unconditional again — a change on page 2 would not show in
  page 1's `ETag`.
- **Gap, not stream**: each poll compares GitHub's list with the rail and writes what
  differs. A missed poll (network, box off) is made up at the next one, with nothing to replay.
  For a ticket no longer in the list, a request on the issue says whether it is closed
  (`closed`) or lost its label (`unfired`).
- **Unique key**: `github:<owner>/<repo>#<n>:<fact type>:<issue's updated_at>`. Two polls of the
  same change — or, later, the poll and the webhook — write only one line.
- **Service order**: `prio:1`, `prio:2`, `prio:3`, then issues without `prio:`; at equal
  priority, the oldest first (issue creation date).
- **`gh` down** (network, expired authentication): the rail stays as it is, the failure
  is printed on the error output (journald). It does not enter the log: one line per minute of
  outage would tell nothing there.
- **Test double**: `BRIGADE_GH_BIN` overrides the binary, like `BRIGADE_CLAUDE_BIN`. The
  gap tests inject a list of issues directly; a single test goes through a fake `gh`.
  No test touches the network.

## Lending only once

`prendre(station)` returns the first queued ticket in service order, or nothing. In a
single `BEGIN IMMEDIATE` transaction: collect expired leases, read the first queued ticket,
write `ticket.taken`. Two takers follow each other, they do not cross; the second reads a rail
where the ticket is already taken.

The test that proves it: two real processes, each with its own connection, rush at a one-ticket
rail; only one gets it, the log carries a single `ticket.taken`. The same test with N
tickets and two takers: no ticket taken twice.

## Configuration

A third variable, **required, with no default**: `BRIGADE_GITHUB_REPO=<owner>/<repo>`.
Absent or malformed, the runtime refuses to start (code 2) and names it. On the box, it is
set per project in an instance drop-in (`systemctl edit brigade@<project>`) — the unit
template cannot guess it.

A new item for the "to check before installing" list: `gh` is installed on the box and
logged in under the service's account (`gh auth status`).

## Plan

Each step in TDD. The suite stays on the order of a second.

1. `evenements/rail.ts`, `projections/rail.ts`: arrival, change, departure, service order;
   #13's replay-test history is enriched with the rail's facts.
2. `rail.ts`: take (order, a single taker), renew, return, expired lease collected, guards on the
   transitions to in pass, served, 86.
3. Two concurrent takers, on real processes.
4. `github.ts`: reading a `gh api` response, `304`, PRs filtered out, pagination, fake `gh`.
5. `alimenter.ts`: the gap and its unique key; hooking at startup and at the tick.
6. `main.ts`: `BRIGADE_GITHUB_REPO`, refusal, hooking; restart: the previous rail is found again.
7. Chef-facing surface (per question 1), `docs/runtime.md`, acceptance test.

## Questions settled — (a) on all four, on 2026-10-08

Questions 2, 3 and 4 by the chef; 1 by the precedent of #13.

**1. How does the chef read the rail, until #18 is delivered?** Three criteria say "the chef
sees"; the status display is ticket #18.

- **(a) — recommended**, as for #13: a minimal read-only command,
  `npm --prefix runtime run rail` — one line per ticket: number, state, priority, title, and for
  a taken ticket, the station and since when. #18 will fold it into `brigade status`.
- (b): #14 only delivers the projection, proved by test; the chef waits for #18 to see it.

**2. An open issue whose `fire` label is removed: what becomes of its ticket?**

- **(a) — recommended**: it leaves the rail, whatever its state, exactly like a closed issue.
  Removing `fire` becomes the chef's action to take a ticket back. If a cook was
  working on it, its lease drops with the trace in the log; stopping it is the guardrails' business (#16).
- (b): it leaves the rail only if queued; taken or in pass, it goes through to the end.

**3. How long before a ticket taken by a dead station goes back to queued?** The station
renews its lease as long as it lives; the delay is the silence tolerated.

- **(a) — recommended**: **10 minutes** by default, adjustable via `BRIGADE_LEASE_SECONDS`. Long
  enough not to take back a cook that is thinking, short enough that a ticket does not sleep for
  an hour. At milestone 1 the cooks die with the runtime, and #15 will return their tickets as soon
  as it restarts: this delay is the safety net, not the normal path.
- (b): another value.

**4. A ticket in 86: how does it come back to queued?**

- **(a) — recommended**: the 86 carries its reason and, when known, the **time of return**
  (the `claude` stream gives it for an exhausted quota). Past that time, the tick puts it back to
  queued, with the trace. With no time of return, it stays 86 until an explicit action
  returns it — #15 or a chef command, outside this ticket.
- (b): an 86 never comes back by itself; an action is always needed.
