### File zones

**One file, one owner**: two tickets that can leave at the same time do not own the same file. A
`zone` path owns **the file it names and everything below it**, by whole segments (`runtime/src`
does not own `runtime/src2`). Two zones **overlap** as soon as a path of one equals or contains a
path of the other. Nothing is read from the disk.

**The common paths** — `BRIGADE_COMMON_PATHS`, optional — **belong to no one**: they do not make two
zones overlap, and writing there is never "out of zone". Two deliveries can collide there: on a
conflict, the pass sends the cook back to update; on a regression without a conflict, the gates see
it on the merge (see "Green means green once merged").

| When | What the runtime does | Where it reads |
|---|---|---|
| **At the split** | Two tickets whose zones overlap and that do not await each other: the code **sets the dependency** | The card (`awaiting`), the split comment, `manager.split` (`overlaps`) |
| **On the rail** | A queued ticket whose zone overlaps that of a ticket that **has left and is not yet served** is **held** | `run rail`: `zone held by #14 (<path>)`; `status`: `zone held by #14 (<path>)` |
| **At the harvest** | A file delivered outside the ticket's zone is **flagged**, not stopped | `cook.out-of-zone`, and the end-of-cook comment |

**The hold on the rail** is recomputed at every read and never blocks. **Holds its zone**: a ticket
that is taken, in pass or **86** (even refused before any cook: settle it or remove its `fire`), a
ticket **that the pass sent back** — until its delivery is merged —, and a cook that is still
running, even if its ticket has left the rail. **Holds nothing**: a ticket back to queued without
having delivered anything, a ticket that has left the rail, a merged delivery (even by you), a
ticket **re-split by the manager** (86 `manager:split`), an **unreadable** card.

**The "out of zone" signal** names on the issue the files delivered out of zone and the rail ticket
that owns each one; the pass judges the delivery like any other. If the gap is legitimate, widen the
zone in the card. **The zone that counts is the one at the take**, in the log: if the card changed
during the cook, the comment shows both zones and the fact carries `cardChanged: true`.

Limits: a PR closed without a merge holds its zone until its ticket is taken again, served or
removed from the rail (see "What awaits the chef"); a PR opened outside any ticket holds none.

### What a cook loads

**Nothing from the account that runs the service, and nothing the code does not name**: the `claude`
binary, its built-in tools, the Max connection, its brief. The list of what it loads in addition
(`SOURCES_DE_REGLAGES`, `runtime/src/claude.ts`) is empty.

| What exists on the machine | Does a cook load it? | Cut by |
|---|---|---|
| Account settings (`~/.claude/settings.json`) and served repository settings (`.claude/settings.json`, `settings.local.json`): plugins, skills, hooks, agents, variables | no | `--setting-sources ""` |
| Skills — the account's and the binary's | no | `--disable-slash-commands` |
| MCP servers — the repository's, the account's, claude.ai connectors | no | `--strict-mcp-config` |
| The account's automatic memory | no | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |
| The served repository's `CLAUDE.md` | **not automatically** — the brief sends the cook to read it | goes with the `project` source |
| Max connection | yes | — |
| Project secrets (`BRIGADE_SECRETS_FILE`) | **the ones its repository declares**, and no others | see "The project's secrets" |
| The machine's GitHub account (`gh`, `git push`) | **yes** under the single identity; **no** under one identity per role | no token in its environment, `GH_CONFIG_DIR` empty — see "One GitHub identity per role" |

So: **the served repository's hooks do not run under a cook**, and a `CLAUDE.md` that imports others
(`@file`) is followed only if the cook goes to read them. Still out of reach: the tools and agents
built into the binary, and the transcript `claude` writes — under the partition, the project's.

### The cook does not deliver, the station harvests

The cook commits in its worktree and says what it did. `git push`, `git merge` and `gh pr merge` are
forbidden to it at launch — a good-faith safeguard, since it runs in `bypassPermissions`. The real
closure is elsewhere: under one identity per role, the cook receives **no GitHub token**, and branch
protection lets only the pass's identity merge.

| Ending | Recognised by | What the station does | Breaker |
|---|---|---|---|
| **done** | commits on the branch — whether the cook concluded, exited with an error, or was stopped by a guardrail or its lease | commits what it left uncommitted, pushes, opens the PR to the integration branch, puts the ticket **in pass**, comments on the issue | success |
| **done, no diff** | no commit, a **delimited deliverable** in its last message, and an **intact** worktree | pushes nothing, no PR, ticket **in pass** (`cook.reported`, reason `no-diff`): the reviewer judges it alone | success |
| **failed** | no commit and nothing delimited (`no-deliverable`); files written and never committed (`no-commit`); a cook with no commit that did not conclude; a worktree that is no longer on its branch (`off-branch`) or no longer points to its repository (kept, see "What is left after a cook"); a push that is impossible | returns the ticket, comments on the issue with the reason. What it had written is committed on its **local** branch, never pushed | failure |
| **86** | the stream says the quota is exhausted | ticket **86** until the quota is back, no more takes until then | not counted |
| expired connection | the stream says the machine no longer has a session | returns the ticket, comments, takes nothing more until "resume" | not counted |
| **refused by the model** | `stop_reason: refusal`, no commit | see "When the model refuses" | not counted |
| the chef's "stop" | — | nothing is harvested: back to queued | not counted |
| **ticket off the rail** during the cook | issue closed or `fire` removed | stops the cook, pushes nothing, comments on the issue; what it had written is on its local branch | not counted |

A ticket that fails is taken again at once by a new cook, new worktree and branch: the breaker is
what bounds the series. **The worktree goes away at the end of the cook**, successful or not.

**What a cook leaves uncommitted in a delivery goes with it**, in a separate commit in the name of
`brigade`; the comment says so, and the reviewer is warned. What the project ignores never goes in —
but **a new file that it does not ignore goes into the PR** (a `.env`, a tool's output): the reviewer
holds it as blocking, the guard is the project's `.gitignore`.

- **A cook that finishes, its ticket already off the rail**: its branch is pushed, **no PR is
  opened**; the comment gives the command to open it yourself.
- **A ticket that the pass sent back** restarts on the branch of the refused delivery, in a new
  worktree, with the findings as its brief; it delivers on the same PR.
- **A runtime that died between the send to pass and the report**: at startup, the station finds the
  PR again, rereads the raw stream and writes `cook.reported` (`reconciled: true`). No cook is
  relaunched.

**What a human pushes onto a cook's branch is never overwritten**: the station force-pushes in a
**guarded** way (`--force-with-lease`, against what it knows of the origin).

| When a human has pushed | What the station does |
|---|---|
| **between two cooks** | the resend cook restarts from what the origin carries. A branch you rewrote is adopted as it is |
| between two cooks, the clone keeping the never-pushed harvest of a failed cook | it merges the two (merge commit in the name of `brigade`). **On a conflict**, no cook: 86 (`worktree-failed`, offered again ten minutes later), the alert names the branch and the files — to reconcile by hand, in the clone |
| **while the cook works** | the push fails (`push-failed`); the work stays on the local branch, and the next resumption merges |

The end-of-cook **comment** carries its ending, its calibration, its turns, tokens, duration, branch,
PR, then **what it delimited**; the rest of its message is folded. Everything is in the log
(`cook.reported`), the raw stream in `runs/<run>.jsonl`.

The comment's headings and wording, written by the runtime, stay French until the runtime is
translated.

#### The deliverable is delimited

A cook's deliverable is **what it delimits in its last message, between `<livrable>` and
`</livrable>`**, and nothing else. With a diff, it is its report: it goes into the body of the PR and
the reviewer reads it; with no diff, it is the deliverable itself. Is a decision missing? It says so
in that passage.

The tags `<livrable>` and `</livrable>` are what the runtime asks of the cook and reads back
(`runtime/src/livrable.ts`); they stay French until the runtime is translated.

| What the last message carries | What is kept |
|---|---|
| one closed delimitation; several | its content; **the last one** |
| an opening reopened before being closed | what follows the **last** opening |
| a closing with no opening, a tag that is not its own, a **quoted** tag (backticks, code block) | ignored |
| an opening **never closed**, an empty delimitation, no delimitation | **no deliverable** |

The tags are read bare, whatever their case. **With no deliverable**: a cook that committed is not
a failure, its message is published as it is; a cook **with no commit** has failed
(`no-deliverable`), and the comment says what is missing.

### When the model refuses

`claude` exits with an error and its stream ends on `stop_reason: refusal`. This is neither an outage
nor a failure: noted apart (`cook.exited`, `outcome: refused`), **the breaker does not count it**. At
the **third refusal in a row** of the same launch, the runtime stops and tells you on the issue, with
the category of the refusal when `claude` gives it.

| What the model refuses | Up to two refusals in a row | At the third |
|---|---|---|
| a ticket's **cook** | back to queued, comment `refusé par le modèle, essai n/3` | 86, reason `refused`, `Remonté au chef` |
| the **review** of a delivery | retried at the next wake-up | the pass escalates the ticket to you (`unjudged`, cause `review-refused`): 86, no merge and no send back |
| a manager's **judgment**, **split** or **reaction** | retried at the next wake-up | pinned like an unreadable answer (`manager.failed`, `manager.split-failed`, or a reaction that escalates) |

The comment `refusé par le modèle, essai n/3` and the mention `Remonté au chef` are written by the
runtime (`runtime/src/station.ts`) and stay French until the runtime is translated.

It is then up to you: reword the ticket, recalibrate it, or relaunch it — remove then set `fire`
again.

### 86: the quota is exhausted

A normal state: the ticket goes 86 until the quota's return time — one hour, if `claude` does not
give it —, then the station serves again.

### Max connection expired

The station sees it at startup (`claude auth status`) and in a cook's stream. It writes it
(`station.disconnected`), comments on the ticket that suffered it, and **takes no more tickets**;
`run status` says so at the top (`connection` line: `MISSING` at startup, `EXPIRED` along the way).
**To restart**: `claude /login` under the service account — nothing else. The runtime rereads the
renewal's state file at every tick: as soon as a **successful** pass, with no failure behind it,
carries credentials **rewritten** after the drop (`renouvele` or `ecrits` more recent than
`station.disconnected` — a fresh `verifie` is not enough: the pass also succeeds without a rewrite),
it writes `session.restored`, the connection stop lifts, the alert band and the queue no longer say
it, and the runtime's output says "connexion Max rétablie à HH:MM, la cuisine a repris". Count one
minute. `guardrails -- resume` remains for the other stops (the chef's "stop", the breaker), and to
date a reconnection that no renewal saw.

The keys `renouvele`, `ecrits`, `verifie`, `echec` and the kinds `session-refusee`, `non-renouvele`
are written by `runtime/deploy/brigade-renouvellement` and read by the runtime; the line "connexion
Max rétablie à HH:MM, la cuisine a repris" is printed by `runtime/src/renouvellement.ts`. All stay
French until the runtime is translated.

The runtime never reads `claude`'s credentials, and **refuses to start** if its environment carries
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`.

Before it drops, the session announces itself: see "The Max session: renewal and alert".

### The Max session: renewal and alert

The Max session is renewed **outside the partition**, and the runtime **follows it without reading
it**. Two pieces, which talk to each other only through a state file:

- **The renewal** — `runtime/deploy/brigade-renouvellement`, run every minute by
  `brigade-renouvellement.timer` under the service account, one per box. It runs
  `claude mcp list` outside any partition: `claude` refreshes its token there if it expires within
  five minutes, and rewrites its credentials file. This command calls no model: a pass costs the
  quota nothing. It never reads the credentials file — it notes its date and inode with `stat` — and
  it writes a single file: `/var/lib/brigade/.session/renouvellement` (`BRIGADE_SESSION_STATE`),
  `key=value` lines of dates and of the kind of a failure, never a token. Its shape and its keys are
  in the script's header.
- **The follow-up** — the runtime rereads this file at startup, then at every tick, and writes to the
  log only what changes (`session.observed`). A restart that sees nothing new writes nothing.

**With a long-lived token** (`BRIGADE_CLAUDE_TOKEN_FILE`), there is no renewal left to follow: the
runtime does not reread the state file, does not write `session.observed` or `session.restored`, the
station's watch draws no loss from it (`session-refusee`…), and the alert below does not come out —
it is the token's expiry that announces itself. Without a token, nothing changes.

**The alert.** When the estimated expiry enters the notice period, the chef's queue carries it, in
`awaiting`, with the gesture:

```
awaiting   …
  session  for <duration>  Max session close to its expiry — <estimated expiry> — to do before then: claude /login under the service account, then run guardrails -- resume
end awaiting
```

or, if the renewal failed and nothing made up for it:

```
  session  for <duration>  Max session renewal failing (<kind>: <detail>) — <estimated expiry> — to restore: claude /login …, then run guardrails -- resume
```

The `<kind>` is one of the French codes above (`session-refusee`, `non-renouvele`…), which stay
French until the runtime is translated.

- **The expiry is estimated**, never read: a token's life (`BRIGADE_SESSION_LIFETIME`, default
  `28800` s, eight hours) counts from the most recent of three dates — the last successful renewal,
  the last write of the credentials seen, the chef's last reconnection ("resume"). The announcement
  leaves `BRIGADE_SESSION_WARNING` before (default `10800` s, three hours). This setting cannot
  exceed the token's life, and the life cannot be `0`: startup refuses it.
- **Whether it runs or not, the alert announces itself.** A renewal that failed may come back, but
  the expiry remains the expiry: the line only leaves at the next successful renewal, which restarts
  the expiry, or at the chef's "resume". A session that has already dropped does not get a second
  announcement: the queue then says since when, and the gesture ("Max connection expired").
- **Under a dropped connection, nothing more.** As long as a station is disconnected, the `session`
  line is not added: `connection` carries it.

**What it does not do, and its limits.**

- **Without the state file, nothing announces itself** — either the timer is not installed, or it has
  not made a pass yet, or the file is unreadable (`file`: `absent` or `unreadable` in
  `session.observed`). The expiry can then only be guessed from a chef's reconnection. This is the
  case of any box where the timer was not laid down: step 5 of the installation copies its two units
  with the rest, and `sudo systemctl enable --now brigade-renouvellement.timer` starts it. The
  station's package carries its own, which it enables by itself. The app's "check the installation"
  shows its state on one line.
- **The renewal only repairs what `claude` can refresh.** If Anthropic refuses the renewal
  (`session-refusee`) or if the token died without having been renewed (`non-renouvele`), nothing
  lifts it: only `claude /login` under the service account restarts.
- **The alert is only for this box and this account.** One file per box, one Max session: the
  account's connection, not a project's.
- **The renewal only runs if the unit runs.** Its liveness (a pass in the last ten minutes, `live`)
  shows in `session.observed`; the runtime does not stop for that.
- **The announcement stops nothing.** The kitchen only stops on the chef's "stop", the breaker, or a
  dropped connection.

**The safeguards, unchanged.** Nothing here loosens what protects the credentials:

- The runtime never opens `.credentials.json` (a test guards that on `runtime/src`); it only reads
  the state file.
- The renewal writes only its state file, runs `claude` in an emptied environment, and exposes no key
  or token to the service.
- Under the partition, cooks, reviewers, judges and gates still see the credentials read-only
  ("The partition"); the renewal is the only one to rewrite them, outside the partition.
- The "stop", the breaker and the pass do not change.
- `claude /login` stays **manual**: it goes through a browser and a human. Neither the renewal nor
  the runtime launches it, and the alert only asks for it.

**Reading it.**

```
cat /var/lib/brigade/.session/renouvellement           # what the last pass noted
journalctl -u brigade-renouvellement.service            # a pass, a failure: one line each
npm --prefix runtime run status                         # the awaiting block: the session line, if there is one
npm --prefix runtime run log                        # session.observed, when what is read has changed
```

A renewal that fails in a loop is recognised by `echec` more recent than `verifie` in the file: the
kind and the detail are there, with nothing of the value.

### The long-lived token's expiry

The token that `claude setup-token` created at installation (`BRIGADE_CLAUDE_TOKEN_FILE`) **lives one
year** (365 days, `VIE_DU_JETON_JOURS` in `runtime/src/events/token.ts`, the only place that knows
it). The Max connection step stores the date of its creation next to it (`<file>.cree`, for example
`/etc/brigade/claude-token.cree`) — an ISO 8601 date, without the token. The runtime rereads it at
startup then at every tick, and writes to the log only what changes (`token.observed`): neither a
pass nor a restart that sees nothing new writes anything.

**The alert.** Thirty days before the expiry (`PREAVIS_DU_JETON_JOURS`), the chef's queue carries one
line, a single one, counted from the opening of the notice period:

```
  token  for 5 d  Max connection token close to its expiry — it expires on <date>, 365 days after its creation (<date>) — to do before then: remake the token — `claude setup-token` under the service account: delete <file>, then run the Max connection step again (docs/installation-station.md, step 5); the station reads the new token and its date
```

Past the expiry, it says `Max connection token EXPIRED since <date>`, and is counted from the
expiry. If the date cannot be read — absent (a token stored by hand), unreadable, or not a date —,
it says so (`Max connection token creation date missing`, `unreadable`, `not readable as a date`):
the expiry is then unknown, the gesture is the same. Nothing the file carries other than a date is
kept, and neither the line nor the log quotes the token: they name its file. It leaves when the
remade token carries a new date. Without `BRIGADE_CLAUDE_TOKEN_FILE`, nothing announces itself. The
announcement stops nothing.

### Revoking the Max connection

**When**: as soon as you believe the account's credentials have left the machine — a
`.credentials.json` or a `sk-ant-…` token seen in a PR, a branch, a comment; unexplained
consumption. A `credentials-committed` refusal or a masking alone are not a leak. When in doubt,
revoke — **at Anthropic, from a browser** logged in to the Max account:

1. **Stop serving**: `guardrails -- stop`.
2. **<https://claude.ai/settings/claude-code>**: remove **all** of Claude Code's authorisations.
3. **<https://claude.ai/settings/account>**: log out all sessions; change the password.
4. **Check**, on the box: `sudo -u <account> claude auth status` must no longer answer
   `"loggedIn": true`, and `sudo -u <account> claude -p "ok"` must fail asking for `/login`. If it
   still answers, write to Anthropic's support and leave the station suspended.
5. **Reconnect**: `claude /login` under the service account, then `guardrails -- resume`.

`claude /logout` on the box is not enough. If the token was **pushed to GitHub**, revoke first, then
close the PR and delete the branch.

### Seeing the station

```bash
npm --prefix runtime run station                 # see it
npm --prefix runtime run station -- cooks 12     # set its cap of cooks (0: no limit)
npm --prefix runtime run station -- cooks auto   # go back to the default cap, the cores'
```

Its outputs, its refusals and its errors are **in English**, with the words of `docs/glossary.md`
(`cooks`, `remove` and `help` included; the decision gestures — `seuil-ticket`, `manager-modele`,
`closer-retraits`… — keep their name until the runtime is translated, and the old words `retirer` and
`aide` still answer, saying the new one). It shows the cap (`simultaneous cooks`), the machine — or,
for a remote station, its **presence** (`presence`) and what it does with **ordinary tickets**
(`ordinary tickets`) —, the Max connection (`Max connection`), the quota, the hold (`withholding`),
the cooks running (`cooks running`) with their calibration, the last ten finished (`latest cooks`),
and **`consumed`** — everything the project launched, cooks, reviews and judgments: what is running,
the **last 5 hours** (the Max quota's window, to compare with `/usage` as an order of magnitude) and
the **last 24 hours**. This consumption is that of **what the project launched**, not the account's:
the runtime sees neither the chef's sessions nor anything else that draws on the same subscription.
`/usage`, in a session, remains the account's measure of truth; the runtime does not replace it.

| Event | Meaning |
|---|---|
| `station.announced` | A station that the project declares introduces itself: engine, what it provides, declared cap of cooks, `cores` — its machine's cores, for a station from here only —, `remote: true` if it is remote, and `ordinary: true` if it also takes ordinary tickets (no ticket) |
| `station.withdrawn` | The project no longer declares this station: it leaves `status` and `station` (no ticket) |
| `stations.undeclared` | The project declares no station: no cook leaves. Written once, by the runtime; the first announcement clears it (no ticket) |
| `station.capped` | The chef set the cap of cooks: `maxCooks`, `0` for no limit, `null` when they remove their setting (`cooks auto`) (no ticket) |
| `station.saturated`, `station.relieved` | The machine cannot cope (`resource`: `cpu`, `memory`, `disk`; `observed`, `limit`; for memory, `limitFrom`: `{ totalMb }` when the threshold derives from total memory, `env` when `BRIGADE_MIN_FREE_MEMORY_MB` sets it; `also`: the other resources involved, of the same shape), then breathes (no ticket) |
| `station.held`, `station.released` | A ticket could leave and is not taken (`reason`, see "Several cooks at once"); nothing holds any more (no ticket) |
| `station.unarbitrated`, `station.arbitrated` | The arbiter no longer answers: degraded mode, one cook at a time, each `cook.launched` carries `unarbitrated: true`; then it answers again (no ticket) |
| `station.86` | The quota is exhausted until `until` (no ticket) |
| `station.disconnected` | The Max connection has expired |
| `cook.stalled` | Half the lease has passed with no progress (`idleMs`, `leaseMs`). A signal |
| `ticket.86` | The station's reasons: `no-calibration`, `unreadable-card`, `refused` (no return time); `setup-failed`, `ticket-unreadable`, `secrets-unavailable`, `worktree-failed` (back at `until`). For `worktree-failed`, `why`: git's error; `access` (`blocked`, `reason`, `gesture`): the repository access refused, when it is |
| `worktree.prepared` | A worktree is prepared again after a `worktree-failed`: the failure the project's follow-up published falls. Once per resumption |
| `setup.failed` | Why the setup failed: `why`, and `hosts`, what the door refused. Written at every failure; it is what decides the comment on the issue |
| `setup.blocked`, `setup.unblocked` | The setup failed like the project's previous one: `why`, `hosts`, and `base`, the commit of the integration branch the worktree started from — no setup is launched any more; then the branch moved (`base`: where it is), the setups resume |
| `aside.failed`, `aside.blocked`, `aside.unblocked` | A cause for setting aside (`worktree-failed`, `ticket-unreadable`, `secrets-unavailable`): `reason` each time; twice in a row with no cook between the two, the project is blocked (`base`: the base seen); lifted by a cook that left, another cause, or the base moving (`why`) |
| `secrets.unavailable` | `problems`: names of variables and files, **never a value** |
| `cook.reported` | A cook's report. `ending`: `done`, `failed`, `86`, `disconnected`, `refused`; `reason` (`no-commit`, `no-diff`, `no-deliverable`, `guard:idle`, `guard:lease`, `harvested:…`, ``secret-committed: `NAME` ``, `credentials-committed: name` or `shape` — nothing is pushed…); `summary`: its last message, secrets and credentials masked; `deliverable`: what it delimited, or `null`; `pr`; `reconciled` |
| `cook.out-of-zone` | The delivery set against the take's zone: `zone`, `files` (`path`, `owners`), `cardChanged`. A signal; never written for a ticket taken with no zone |
