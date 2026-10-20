# Study: can brigade be a layer on Hermes Agent?

*Study, 2026-10-15 (#739). It informs a decision for the chef: keep our runtime, or make brigade
a layer on [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research). Hermes
is read from the sources of its docs and code, commit `ecac27c` of 2026-10-15, version v0.22.2;
brigade, from `v2` of the same day. Sources are at the end of the document.*

## In one minute

**Recommendation: keep our runtime.** No migration, and no hybrid built on Hermes.

1. **Hermes does not run `claude` on the Max plan.** It borrows Claude Code's OAuth token and
   calls Anthropic's API from its own loop, posing as Claude Code. Its docs say so: this path
   **only consumes the extra usage credits bought on top of Max**; the included plan allowance
   is never touched. This is also the case Anthropic's terms forbid: Max credentials used outside
   the official `claude` binary. Our V2 was built on the opposite constraint (V2 spec,
   "Constraints").
2. **Its workers cannot be `claude`.** Plugging Claude Code in as a board worker is "*not yet a
   paved path*": it is a Python plugin to write, and the PR that tried it for Codex is closed
   without merge.
3. **Its board only runs on one machine**, by its own admission ("*deliberately single-host*").
   Stations, and therefore epic #702, have no place there.
4. **What it does well is exactly the plumbing that costs us**: installation, service, update
   with rollback, dashboard, notifications to the phone. But this plumbing is welded to its agent
   loop: you cannot take it without taking the rest.

**The lesson to keep**: the chef is right about the diagnosis, not about the remedy. Generic
plumbing is what costs the most (installation is the most reworked piece since October 10: 62
commits, against 28 for the cooks). It is bought **piece by piece**, with standard tools. It is
not bought wholesale along with another agent runtime.

## Piece by piece

| Brigade piece | Hermes | What it provides | What is missing for us |
|---|---|---|---|
| **Rail** (GitHub issues `fire`, `prio:`, `awaiting`, epics) | **partly** | A durable but local board (SQLite, `~/.hermes/kanban.db`), with priorities, parent → child dependencies, cycle rejection, and entry by CLI, chat or REST | **No synchronization with GitHub issues**: it is an open request, #31992. No epic, no "served = merged", no WAITING |
| **Cooks** (one `claude` per ticket, worktree, lease, harvest) | **partly** | One process per task, `--workspace worktree`, a 15-minute lease extended while the pid lives, a heartbeat, a breaker, a model per task | **The worker is the Hermes loop, not `claude`.** No effort per task. No lease held by worktree progress. No "the cook does not deliver, the station harvests" |
| **Manager** (qualify, calibrate, split, react) | **partly** | Automatic splitting of `triage` tasks into a task graph, orchestrator profiles, `specify` | No model/effort calibration per ticket. No reaction to a red (raise, re-split). No "your action outranks its own" |
| **Pass** (gates, reviewer, CI, verdict, merge under grant) | **partly** | A review lane by an LLM (skill `sdlc-review`, approve or send back), and a completion contract that waits for the PR's *required* checks | **No deterministic gates**, no "merged with the base" judgment, **no merge, no grant**, no red base or repair ticket. The CI contract writes nothing to GitHub, by its own admission |
| **Zones** (one file, one owner) | **no** | Plain conventions: `hotspot:` comments, a conflict reconciliation map | Everything |
| **Stations** (several machines, capacities, `requiert`) | **no** | Terminal *backends* (`ssh`, `docker`, `modal`…) that move **the commands**, not the worker. A two-host board is "*not supported*" | Everything. It is the heart of #702 (the Windows `space`, the single station) |
| **Update, installation, service** | **yes** | One-line `install.sh`, `hermes gateway install` (systemd or launchd), `hermes update` with channels and automatic rollback | Bootstrapping **a repository**: labels, protected branch, secrets, per-role GitHub identities, partition |
| **App** | **yes, its own** | A web dashboard, a desktop app (kanban, terminals, git review), a TUI | "What awaits you", buttons that write without sending, the second in its terminal, our six columns |
| **Notifications** | **yes, and better than ours** | Telegram, Signal, Discord, ntfy, e-mail…; subscription to completions, blocks and reviews; reply from the phone (`/kanban unblock`, `comment`) | Nothing specific to brigade. **We have no phone channel**: a native app notification, and nothing if the app is closed |
| *(base)* Max quota, guardrails | **no — blocking** | Concurrency caps; "*budgets, governance gates … remain user-space*" | **The Max plan itself** (see above), our turns/tokens/duration/idle caps, the arbiter between projects |

Hermes is also **young and moving**: 41 releases in seven months, the switch from dates to semver
in September, 1,333 open kanban tickets, 15 of them in two days (worker dead on an RPC error,
kill of a reused pid…). A layer on top of it would follow ground that shifts every week.

## What a migration would remove, and what it would lose

**Removed from our code** (nearly 10,000 lines, tests excluded):

| What | Lines |
|---|---|
| Installation, service, update (`installation`, `installateur`, `desinstallateur`, `mettre-en-service`, `version`, `etapes`, `mode-auto`…) | 5,327 |
| `runtime/deploy` (switchover, systemd units, sudoers rules, `brigade` command) | 1,783 |
| App: installation, adding and removing a project, version lag | 2,469 |
| Notifications (urgency, alert) | 383 |

To these would be added the rail, the cooks, the pass and the manager, but **to be rewritten** as
Python plugins: these are lines moved, not saved.

**Lost**:

- **The Max plan.** Everything would go through extra usage or an API key, paid per token.
  Otherwise, Claude Code's token would be borrowed, which Anthropic's terms forbid and which
  Anthropic has blocked server-side since 2026 (press at the end of the document). This loss
  alone settles it.
- **The pass as we wanted it**: "green means green once merged", the `merge` grant with an
  expiry, the never-granted lines (`acces-prod`, `identifiants-max`), the refusal of automatic
  merge on `.claude/brigade/` and `.github/workflows/`, the red base that holds deliveries back.
  Hermes has no merge, and its hooks on the kanban only observe.
- **The zones, the stations and their capacities.** They would have to be rebuilt, and stations
  are impossible on a single-host board.
- **The append-only log**, and everything derived from it: `rail`, `pass -- <n>`, "why is this
  code on `v2`?", recovery after a crash.
- **The box's security**: the `bwrap` partition, the door as the only way out, one-hour GitHub
  tokens that no cook receives. Hermes' model is that of a "trusted local user", and its
  dashboard routes are not authenticated.

## Recommendation: keep, and buy the plumbing piece by piece

**Keep the runtime.** What is specific to brigade (rail on GitHub, pass, grant, zones, stations,
Max quota through the official binary) is precisely what Hermes lacks. What it has, it ties to its
agent loop and to a model provider that is not our plan.

**The hybrid on Hermes is ruled out**: taking only the notifications or the dashboard from it
would run a second agent runtime, with its own connection to a model, for the role of a
postman.

**What the study changes going forward.** The chef's observation holds: plumbing costs us, and we
write it by hand. Before each plumbing ticket, ask first: *which standard tool already does
this?* Leads to investigate, not yet tested:

- **Notifications to the phone**: an existing push service (ntfy or an equivalent), called from
  the urgency fact the runtime already writes, rather than a channel of our own. It is the only
  piece where Hermes clearly outdoes us.
- **Joining a machine** (#702, enrollment by command and code): a market mesh network (Tailscale
  or an equivalent) already gives "a machine presents itself, the chef accepts it" and the `ssh`
  that goes with it. Our code would only have to declare the station and its capacities.
- **Installation and update**: a standard package or installer, rather than growing the
  per-project switchover and its sudoers rules.

**Cost of a migration**, if the chef wanted it anyway:

- **in money**: all the work of the cooks, the manager and the reviewer, paid per token, on top
  of the subscription;
- **in work**: rewrite in Python, as plugins, the `claude` worker (an unpaved path at Hermes), the
  bridge with GitHub issues, the pass and the grant (through a `pre_tool_call` hook that blocks
  `kanban_complete`), then the zones. The order of magnitude is that of V2 itself: about 365
  runtime commits in eight days, redone on ground that changes every week;
- **and epic #702 cannot be done there at all.**

**What would reopen the question**: an official `claude` worker at Hermes (its ticket #19931) and
a multi-host board. Even then, the quota would remain that of `claude`: it is the condition that
does not depend on Hermes.

## For #702

Until the study is settled, the epic does not move beyond its spec. If the chef chooses "keep",
#702 restarts, and it is this study's first client: before #712 and #713 (registry, enrollment),
check whether a market mesh network does not deliver half the epic without code of our own. It is
for the chef to decide; the study changes neither the epic nor its tickets.

## A decision the study cannot make

The ticket says Hermes "runs `claude` on a Max subscription (confirmed by the chef)". According
to its docs, this is true in the sense that the Max connection works, but **on extra usage
credits**, not on the plan. If the chef saw it run, his Anthropic console should show this
consumption in addition. It should be checked before taking the conclusion for granted: if his
trial did consume the included plan, it was through the `claude-code` skill, where a Hermes agent
launches the binary, which still requires another model for Hermes' loop.

## Sources

Hermes, in its repository (`https://github.com/NousResearch/hermes-agent/blob/main/<path>`,
commit `ecac27c`). The site of its docs is built from `website/docs/`.

- `website/docs/integrations/providers.md`: "*only works if you're on a Claude Max plan and
  have purchased extra usage credits … The base Max plan allowance … is not consumed by Hermes*"
- `agent/anthropic_adapter.py`: `claude-code/<version>` headers, prefix "*You are Claude Code,
  Anthropic's official CLI for Claude.*", tools renamed to avoid "*Third-party apps now
  draw from extra usage*"
- `website/docs/user-guide/security.md`: `auth.adopt_external_logins`, true by default, borrows
  `~/.claude/.credentials.json`
- `website/docs/user-guide/features/kanban-worker-lanes.md`: Claude Code worker "*not yet a
  paved path*", #19931, PR #19924 closed
- `website/docs/user-guide/features/kanban.md`: "*Kanban is deliberately single-host*",
  completion contract "*no remote writes*", "*Collision hotspots*"
- `website/docs/getting-started/installation.md`, `updating.md`, `user-guide/desktop.md`,
  `user-guide/features/hooks.md`
- the GitHub API: published releases, open tickets (`kanban`), sync request #31992

Anthropic: [Claude Code Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
("*developers may not … intermediate Claude.ai credentials*"; the unmodified `claude` binary,
with its own subscription, is allowed). Press on the blocking of third-party harnesses in 2026
(January, February, April): [alternativeto.net](https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use),
[implicator.ai](https://www.implicator.ai/anthropic-cuts-openclaw-from-claude-subscriptions-citing-unsustainable-compute-costs/).
None of these articles names Hermes.

brigade: `wc -l` on `runtime/src`, `runtime/deploy` and `app/src`, and `git log` on `v2`, on
2026-10-15. The lines per piece come from a ranking of each of the 166 files of `runtime/src`
into a single piece.
