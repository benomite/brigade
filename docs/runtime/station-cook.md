### File zones

**One file, one owner**: two tickets that can start at the same time do not own the
same file. A `zone` path owns **the file it names and everything beneath it**,
by whole segments (`runtime/src` does not own `runtime/src2`). Two zones **overlap**
as soon as a path of one equals or contains a path of the other. Nothing is read from disk.

**The common paths** — `BRIGADE_COMMON_PATHS`, optional — **belong to nobody**: they
do not make two zones overlap, and writing there is never "out of zone". Two deliveries may
collide there: a conflict, the pass sends the cook back to update itself; a regression without a conflict,
the gates see it on the merge (see "Green means green once merged").

| When | What the runtime does | Where it reads |
|---|---|---|
| **At the split** | Two tickets whose zones overlap and that do not await each other: the code **sets the dependency** | The card (`awaiting`), the split comment, `manager.split` (`overlaps`) |
| **On the rail** | A queued ticket whose zone overlaps that of a ticket **started and not yet served** is **held** | `run rail`: `zone held by #14 (path)`; `status`: `zone held by #14 (path)` |
| **At the harvest** | A file delivered outside the ticket's zone is **flagged**, not stopped | `cook.out-of-zone`, and the cook's closing comment |

**The hold on the rail** is recomputed at every read and never blocks. **Holds its zone**: a
taken ticket, one in pass or **86** (even refused before any cook: settle it or remove its `fire`), a
ticket **that the pass sent back** — until its delivery is merged —, and a cook still running, its
ticket having left the rail. **Holds nothing**: a ticket back to queued without having delivered anything,
a ticket off the rail, a merged delivery (even by you), a ticket **re-split by the manager**
(86 `manager:split`), an **unreadable** card.

**The "out of zone" signal** names on the issue the files delivered out of zone and the rail ticket that
owns each; the pass judges the delivery like any other. If the deviation is legitimate, widen the zone
in the card. **The zone that counts is the one at the take**, in the log: if the card changed
during the cooking, the comment shows both zones and the fact carries `cardChanged: true`.

Limits: a PR closed without a merge holds its zone until its ticket is taken again, served or
removed from the rail (see "What awaits the chef"); a PR open outside any ticket holds none.

### What a cook loads

**Nothing from the account that runs the service, and nothing the code does not name**: the `claude` binary,
its built-in tools, the Max connection, its instruction. The list of what it loads in addition
(`SOURCES_DE_REGLAGES`, `runtime/src/claude.ts`) is empty.

| What exists on the machine | Does a cook load it? | Cut by |
|---|---|---|
| Settings of the account (`~/.claude/settings.json`) and of the served repository (`.claude/settings.json`, `settings.local.json`): plugins, skills, hooks, agents, variables | no | `--setting-sources ""` |
| Skills — of the account and of the binary | no | `--disable-slash-commands` |
| MCP servers — of the repository, of the account, claude.ai connectors | no | `--strict-mcp-config` |
| Automatic memory of the account | no | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |
| `CLAUDE.md` of the served repository | **not automatically** — the instruction sends the cook to read it | goes away with the `project` source |
| Max connection | yes | — |
| Project secrets (`BRIGADE_SECRETS_FILE`) | **the ones its repository declares**, and no others | see "The project's secrets" |
| The machine's GitHub account (`gh`, `git push`) | **yes** under the single identity; **no** under a per-role identity | no token in its environment, `GH_CONFIG_DIR` empty — see "One GitHub identity per role" |

So: **the served repository's hooks do not run under a cook**, and a `CLAUDE.md` that imports
others (`@file`) is followed only if the cook goes to read them. Still out of reach: the tools and
agents built into the binary, and the transcript that `claude` writes — under the partition, the project's.

### The cook does not deliver, the station harvests

The cook commits in its worktree and says what it did. `git push`, `git merge` and `gh pr merge`
are forbidden to it at launch — a good-faith guardrail, since it runs in `bypassPermissions`. The
closing is elsewhere: under a per-role identity, the cook receives **no GitHub token**, and the
branch protection lets only the pass's identity merge.

| End | Recognized by | What the station does | Breaker |
|---|---|---|---|
| **done** | commits on the branch — whether the cook concluded, exited with an error, or was stopped by a guardrail or its lease | commits what it left uncommitted, pushes, opens the PR to the integration branch, puts the ticket **in pass**, comments on the issue | success |
| **done, no diff** | no commit, a **delimited deliverable** in its last message, and an **intact** worktree | pushes nothing, no PR, ticket **in pass** (`cook.reported`, reason `no-diff`): the reviewer judges it alone | success |
| **failed** | no commit and nothing delimited (`no-deliverable`); files written never committed (`no-commit`); a cook with no commit that did not conclude; a worktree no longer on its branch (`off-branch`) or no longer pointing to its repository (kept, see "What remains after a cook"); a push that is impossible | returns the ticket, comments on the issue with the reason. What it had written is committed on its **local** branch, never pushed | failure |
| **86** | the stream says the quota is exhausted | ticket **86** until the quota returns, no more takes until then | does not count |
| connection expired | the stream says the machine no longer has a session | returns the ticket, comments, takes nothing more before `resume` | does not count |
| **refused by the model** | `stop_reason: refusal`, no commit | see "When the model refuses" | does not count |
| chef's `stop` | — | nothing is harvested: back to queued | does not count |
| **ticket off the rail** during the cooking | issue closed or `fire` removed | stops the cook, pushes nothing, comments on the issue; what it had written is on its local branch | does not count |

A ticket that fails is taken again at once by a new cook, new worktree and branch: it is the
breaker that bounds the series. **The worktree goes away at the end of the cook**, successful or not.

**What a cook leaves uncommitted in a delivery goes with it**, in a separate commit in the name
of `brigade`; the comment says so, and the reviewer is warned. What the project ignores never gets in
— but **a new file that it does not ignore goes into the PR** (a `.env`, a tool
output): the reviewer takes it as blocking, the guard is the project's `.gitignore`.

- **A cook that finishes, its ticket already off the rail**: its branch is pushed, **no PR is
  opened**; the comment gives the command to open it yourself.
- **A ticket that the pass sent back** restarts on the branch of the refused delivery, in a
  new worktree, with the findings as instruction; it delivers on the same PR.
- **A runtime dead between the sending to pass and the report**: at startup, the station finds
  the PR again, rereads the raw stream and writes `cook.reported` (`reconciled: true`). No cook is relaunched.

**What a human pushes to a cook's branch is never overwritten**: the station force-pushes in a
**guarded** way (`--force-with-lease`, against what it knows of the origin).

| When a human pushed | What the station does |
|---|---|
| **between two cooks** | the resend cook restarts from what the origin carries. A branch you rewrote is adopted as is |
| between two cooks, the clone keeping the never-pushed harvest of a failed cook | it merges the two (merge commit in the name of `brigade`). **In conflict**, no cook: 86 (`worktree-failed`, offered again ten minutes later), the alert names the branch and the files — to reconcile by hand, in the clone |
| **while the cook works** | the push fails (`push-failed`); the work stays on the local branch, and the next retake merges |

The cook's closing **comment** carries its end, its calibration, its turns, tokens, duration, branch,
PR, then **what it delimited**; the rest of its message is folded. Everything is in the log
(`cook.reported`), the raw stream in `runs/<run>.jsonl`.

#### The deliverable is delimited

A cook's deliverable is **what it delimits in its last message, between `<livrable>` and
`</livrable>`**, and nothing else. With a diff, it is its report: it goes into the PR's body and the
reviewer reads it; without a diff, it is the deliverable itself. A decision is missing? It says so
in this passage.

| What the last message carries | What is kept |
|---|---|
| one closed delimitation; several | its content; **the last one** |
| an opening reopened before being closed | what follows the **last** opening |
| a closing without an opening, a tag that is not its own, a **quoted** tag (backticks, code block) | ignored |
| an opening **never closed**, an empty delimitation, no delimitation | **no deliverable** |

The tags are read bare, whatever their case. **Without a deliverable**: a cook that committed
is not a failure, its message is published as is; a cook **with no commit** has failed
(`no-deliverable`), and the comment says what is missing.

### When the model refuses

`claude` exits with an error and its stream ends on `stop_reason: refusal`. It is neither an outage nor a
failure: noted apart (`cook.exited`, `outcome: refused`), **the breaker does not count it**. At the
**third refusal in a row** of the same launch, the runtime stops and tells you on the issue, with
the refusal's category when `claude` gives it.

| What the model refuses | Up to two refusals in a row | At the third |
|---|---|---|
| a ticket's **cook** | back to queued, comment "refused by the model, try n/3" | 86, reason `refused`, "Escalated to the chef" |
| the **review** of a delivery | retried at the next wake-up | the pass escalates the ticket to you (`unjudged`, cause `review-refused`): 86, no merge and no sending back |
| a manager's **judgment**, **split** or **reaction** | retried at the next wake-up | pinned like an unreadable answer (`manager.failed`, `manager.split-failed`, or a reaction that escalates) |

It is then up to you: reword the ticket, recalibrate it, or relaunch it — remove then set `fire` again.

### 86: the quota is exhausted

A normal state: the ticket goes 86 until the quota's return time — one hour, if `claude` does not
give it —, then the station serves again.

### Max connection expired

The station sees it at startup (`claude auth status`) and in a cook's stream. It writes it
(`station.disconnected`), comments on the ticket that suffered it, and **takes no more tickets**;
`run status` says so at the top (`connection` line: `MISSING` at startup, `EXPIRED` en route).
**To start again**: `claude /login` under the service account — nothing else. The runtime rereads the
renewal's state file at every tick: as soon as a **successful** pass, with no failure behind it,
raises credentials **rewritten** after the drop (`renouvele` or `ecrits` more recent than
`station.disconnected` — a fresh `verifie` is not enough: the pass also succeeds without a
rewrite), it writes
`session.restored`, the connection stop lifts, the alert band and the queue no longer say it,
and the runtime's output says "Max connection restored at HH:MM, the kitchen has resumed". Allow a
minute. `guardrails -- resume` remains for the other stops (chef's `stop`, breaker), and
to date a reconnection that no renewal saw.

The runtime never reads `claude`'s credentials, and **refuses to start** if its
environment carries `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`.

Before it drops, the session announces itself: see "The Max session: renewal and alert".

### The Max session: renewal and alert

The Max session is renewed **outside the partition**, and the runtime **tracks it without reading it**. Two
pieces, which talk to each other only through a state file:

- **The renewal** — `runtime/deploy/brigade-renouvellement`, played every minute by
  `brigade-renouvellement.timer` under the service account, one per box. It runs
  `claude mcp list` outside any partition: `claude` refreshes its token there if it expires within
  five minutes, and rewrites its credentials file. This command calls no model: one
  pass costs the quota nothing. It never reads the credentials file — it notes its
  date and inode through `stat` — and it writes a single file: `/var/lib/brigade/.session/renouvellement`
  (`BRIGADE_SESSION_STATE`), `key=value` lines of dates and of the nature of a failure, never a
  token. Its form and its keys are in the script's header.
- **The tracking** — the runtime rereads this file at startup, then at every tick, and writes to the log
  only what changes (`session.observed`). A restart that sees nothing new writes nothing.

**With a long-lived token** (`BRIGADE_CLAUDE_TOKEN_FILE`), there is no renewal left to
track: the runtime does not reread the state file, does not write `session.observed` or
`session.restored`, the station's watch draws no loss from it (`session-refusee`…), and the alert
below does not come out — it is the token's expiry that announces itself. Without a token, nothing changes.

**The alert.** When the estimated expiry enters the notice period, the chef's queue carries it, in
`awaiting`, with the gesture:

```
awaiting   …
  session  for <duration>  Max session close to its expiry — <time> — to do before then: claude /login under the service account, then run guardrails -- resume
end awaiting
```

or, if the renewal failed and nothing caught it up:

```
  session  for <duration>  Max session renewal failing (<nature>: <detail>) — <time> — to restore: claude /login …, then run guardrails -- resume
```

- **The expiry is estimated**, never read: a token's life (`BRIGADE_SESSION_LIFETIME`, default
  `28800` s, eight hours) counts from the most recent of three dates — the last successful
  renewal, the last credentials write seen, the chef's last reconnection
  (`resume`). The announcement goes out `BRIGADE_SESSION_WARNING` before (default `10800` s, three hours).
  This setting cannot exceed the token's life, and the life cannot be `0`: startup refuses it.
- **Whether it runs or not, the alert announces itself.** A renewal that failed may come back, but
  the expiry remains the expiry: the line only goes out at the next successful renewal, which restarts
  the expiry, or at the chef's `resume`. A session already dropped receives no
  second announcement: the queue then says since when, and the gesture ("Max connection expired").
- **Under a dropped connection, nothing more.** As long as a station is disconnected, the `session`
  line is not added: `connection` carries it.

**What it does not do, and its limits.**

- **Without the state file, nothing announces itself** — neither the timer is installed, nor has it yet made
  a pass, nor is the file readable (`file`: `absent` or `unreadable` in `session.observed`).
  The expiry can then only be guessed from a chef reconnection. This is the case of any box where the
  timer was not set up: step 5 of the installation copies its two units with the rest, and
  `sudo systemctl enable --now brigade-renouvellement.timer` starts it. The station package
  carries its own, which it activates alone. "Check" shows its state on one line.
- **The renewal only repairs what `claude` can refresh.** If Anthropic refuses the
  renewal (`session-refusee`) or if the token died without having been renewed
  (`non-renouvele`), nothing raises it: only `claude /login` under the service account starts again.
- **The alert only holds for this box and this account.** A single file per box, a single Max
  session: the account's connection, not a project's.
- **The renewal only runs if the unit runs.** Its liveness (a pass in the last ten
  minutes, `live`) is shown in `session.observed`; the runtime does not stop for
  all that.
- **The announcement stops nothing.** The kitchen only stops on the chef's `stop`, the breaker,
  or a dropped connection.

**The guardrails, unchanged.** Nothing here loosens what protects the credentials:

- The runtime never opens `.credentials.json` (a test guards that over `runtime/src`); it only reads
  the state file.
- The renewal writes only its state file, runs `claude` in an emptied environment, and
  exposes no key or token to the service.
- Under the partition, cooks, reviewers, judges and gates still see the credentials read-only
  ("The partition"); the renewal is the only one to rewrite them, outside the partition.
- The `stop`, the breaker and the pass do not change.
- The `claude /login` remains **manual**: it goes through a browser and a human. Neither the renewal
  nor the runtime launch it, and the alert only asks for it.

**Reading it.**

```
cat /var/lib/brigade/.session/renouvellement           # what the last pass noted
journalctl -u brigade-renouvellement.service            # one pass, one failure: one line each
npm --prefix runtime run status                         # the awaiting block: the session line, if there is one
npm --prefix runtime run log                        # session.observed, when what is read has changed
```

A renewal that fails in a loop is recognized by `echec` more recent than `verifie` in the
file: the nature and the detail are there, without anything of the value.

### The long-lived token's expiry

The token that `claude setup-token` created at installation (`BRIGADE_CLAUDE_TOKEN_FILE`) **lives for one
year** (365 days, `VIE_DU_JETON_JOURS` in `runtime/src/events/token.ts`, the only place that
knows it). The Max connection step stores the date of its creation beside it
(`<file>.cree`, for example `/etc/brigade/claude-token.cree`) — an ISO 8601 date, without the
token. The runtime rereads it at startup then at every tick, and writes to the log only what
changes (`token.observed`): neither a pass nor a restart that sees nothing new writes
anything.

**The alert.** Thirty days before the expiry (`PREAVIS_DU_JETON_JOURS`), the chef's queue carries
one line, a single one, counted from the opening of the notice period:

```
  token  for 5 d  Max connection token close to its expiry — it expires on <date>, 365 days after its creation (<date>) — to do before then: remake the token — `claude setup-token` under the service account: delete <file>, then run the Max connection step again (docs/installation-station.md, step 5); the station reads the new token and its date
```

Past the expiry, it says `Max connection token EXPIRED since <date>`, and is counted from
the expiry. If the date cannot be read — absent (a token stored by hand), unreadable, or not
a date —, it says so (`Max connection token creation date missing`, `unreadable`, `not readable
as a date`): the expiry is then unknown, the gesture is the same. Nothing of what the
file carries other than a date is kept, and neither the line nor the log quote the token:
they name its file. It goes out when the remade token carries a new date. Without
`BRIGADE_CLAUDE_TOKEN_FILE`, nothing announces itself. The announcement stops nothing.

### Revoking the Max connection

**When**: as soon as you believe the account's credentials have left the machine — a
`.credentials.json` or an `sk-ant-…` token seen in a PR, a branch, a comment; an
unexplained consumption. A `credentials-committed` refusal or a masking alone is not a
leak. When in doubt, revoke — **at Anthropic, from a browser** logged in to the Max account:

1. **Stop serving**: `guardrails -- stop`.
2. **<https://claude.ai/settings/claude-code>**: remove **all** of Claude Code's authorizations.
3. **<https://claude.ai/settings/account>**: sign out all sessions; change the password.
4. **Check**, on the box: `sudo -u <account> claude auth status` must no longer answer
   `"loggedIn": true`, and `sudo -u <account> claude -p "ok"` must fail by asking for `/login`. If it
   still answers, write to Anthropic's support and leave the station suspended.
5. **Reconnect**: `claude /login` under the service account, then `guardrails -- resume`.

`claude /logout` on the box is not enough. If the token was **pushed to GitHub**, revoke first,
then close the PR and delete the branch.

### Seeing the station

```bash
npm --prefix runtime run station                 # see it
npm --prefix runtime run station -- cooks 12     # set its cooks cap (0: no limit)
npm --prefix runtime run station -- cooks auto   # go back to the default cap, the cores'
```

Its outputs, its refusals and its errors are **in English**, with the words of `docs/glossary.md`
(`cooks`, `a decision`, `remove`, `help` included; the decision gestures — `seuil-ticket`,
`manager-modele`, `closer-retraits`… — keep their name, and the old words `retirer` and `aide`
still answer, saying the new one). It shows the cap (`simultaneous cooks`), the machine — or, for a remote station, its **presence** (`presence`) and what it does with **ordinary tickets** (`ordinary tickets`) —, the Max connection (`Max connection`), the quota, the withholding (`withholding`), the cooks running
(`cooks running`) with their calibration, the last ten finished (`latest cooks`), and **`consumed`** — everything the project launched,
cooks, reviews and judgments: what is running, the **last 5 hours** (the Max quota
window, to compare with `/usage` as an order of magnitude) and the **last 24 hours**.
This consumption is that of **what the project launched**, not the account's: the runtime
sees neither the chef's sessions nor anything else drawing on the same subscription. `/usage`, in a
session, remains the account's measure of truth; the runtime does not replace it.

| Event | Meaning |
|---|---|
| `station.announced` | A station the project declares introduces itself: engine, what it provides, declared cooks cap, `cores` — its machine's cores, for a local station only —, `remote: true` if it is remote, and `ordinary: true` if it also takes ordinary tickets (no ticket) |
| `station.withdrawn` | The project no longer declares this station: it leaves `status` and `station` (no ticket) |
| `stations.undeclared` | The project declares no station: no cook starts. Written once, by the runtime; the first announcement clears it (no ticket) |
| `station.capped` | The chef set the cooks cap: `maxCooks`, `0` for no limit, `null` when he removes his setting (`cooks auto`) (no ticket) |
| `station.saturated`, `station.relieved` | The machine can take no more (`resource`: `cpu`, `memory`, `disk`; `observed`, `limit`; for memory, `limitFrom`: `{ totalMb }` when the threshold derives from the total memory, `env` when `BRIGADE_MIN_FREE_MEMORY_MB` sets it; `also`: the other resources at fault, of the same shape), then breathes again (no ticket) |
| `station.held`, `station.released` | A ticket could start and is not taken (`reason`, see "Several cooks at once"); nothing holds any more (no ticket) |
| `station.unarbitrated`, `station.arbitrated` | The arbiter no longer answers: degraded mode, one cook at a time, each `cook.launched` carries `unarbitrated: true`; then it answers again (no ticket) |
| `station.86` | The quota is exhausted until `until` (no ticket) |
| `station.disconnected` | The Max connection has expired |
| `cook.stalled` | Half the lease has passed with no progress (`idleMs`, `leaseMs`). A signal |
| `ticket.86` | Station reasons: `no-calibration`, `unreadable-card`, `refused` (no return time); `setup-failed`, `ticket-unreadable`, `secrets-unavailable`, `worktree-failed` (return at `until`). For `worktree-failed`, `why`: git's error; `access` (`blocked`, `reason`, `gesture`): the repository access refused, when it is |
| `worktree.prepared` | A worktree is prepared again after a `worktree-failed`: the failure that the project's tracking published drops. Once per retake |
| `setup.failed` | Why the setup failed: `why`, and `hosts`, what the door refused. Written at every failure; it is what decides the comment on the issue |
| `setup.blocked`, `setup.unblocked` | The setup failed like the project's previous one: `why`, `hosts`, and `base`, the integration branch commit the worktree started from — no more setup is launched; then the branch moved (`base`: where it is), the setups resume |
| `aside.failed`, `aside.blocked`, `aside.unblocked` | A cause for setting aside (`worktree-failed`, `ticket-unreadable`, `secrets-unavailable`): `reason` each time; twice in a row with no cook between the two, the project is blocked (`base`: the base seen); lifted by a cook that started, another cause, or the base moving (`why`) |
| `secrets.unavailable` | `problems`: names of variables and files, **never a value** |
| `cook.reported` | A cook's report. `ending`: `done`, `failed`, `86`, `disconnected`, `refused`; `reason` (`no-commit`, `no-diff`, `no-deliverable`, `guard:idle`, `guard:lease`, `harvested:…`, ``secret-committed: `NAME` ``, `credentials-committed: name` or `shape` — nothing is pushed…); `summary`: its last message, secrets and credentials masked; `deliverable`: what it delimited, or `null`; `pr`; `reconciled` |
| `cook.out-of-zone` | The delivery checked against the take's zone: `zone`, `files` (`path`, `owners`), `cardChanged`. A signal; never written for a ticket taken without a zone |
