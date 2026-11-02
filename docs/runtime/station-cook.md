### File zones

**One file, one owner**: two tickets that can leave at the same time do not own the same file. A
`zone` path owns **the file it names and everything below it**, by whole segments (`runtime/src`
does not own `runtime/src2`). Two zones **overlap** when a path of one equals or contains a path of
the other. Nothing is read from the disk. The common paths (`BRIGADE_COMMON_PATHS`, optional)
**belong to no one**: they never make zones overlap, and writing there is never "out of zone"; a
collision there ends in the pass sending the cook back to update, or in the gates on the merge
("Green means green once merged").

- **At the split**, two tickets with overlapping zones that do not await each other: the code **sets
  the dependency** (`awaiting`, `manager.split` `overlaps`).
- **On the rail**, a queued ticket whose zone overlaps that of a ticket **that has left and is not yet
  served** is **held**: `zone held by #14 (<path>)` in `run rail` and `status`.
- **At the harvest**, a file delivered outside the ticket's zone is **flagged**, not stopped
  (`cook.out-of-zone`; the issue names the files and the rail ticket owning each; the pass judges the
  delivery like any other), and **held** like the zone: `OUT OF ZONE: wrote <paths>` on that ticket
  (five at most); the waiting one reads `waits on #14 (written outside its zone)` in `run rail`, `zone
  held by #14 (<path>, written outside its zone)` in `status`. It is settled when the card
  claims the files (zone widened, or path made common), when a new delivery no longer writes them, or
  when its delivery is merged. Only a delivery is checked (#1367).

**The hold on the rail** is recomputed at every read and never blocks. **Holds its zone**: a ticket
taken or in pass, one **the pass sent back** (until its delivery is merged), a cook still running, and
a PR closed without a merge while its ticket is queued ("What awaits the chef"). **Holds nothing**: a
ticket **86**, whatever the reason (it waits for a gesture or a time, not for a cook, #1368), a ticket
back to queued having delivered nothing, one off the rail, a merged delivery (even by you), an
**unreadable** card, a PR opened outside any ticket. **Back from 86**, a ticket claims its zone again
under the same rule; if another took it meanwhile, it waits for that one to be served.

**The zone that counts is the one at the take**: if the card changed during the cook, the comment
shows both and the fact carries `cardChanged: true`.

### What a cook loads

**Nothing from the account that runs the service, and nothing the code does not name**: the `claude`
binary, its built-in tools, the Max connection, its brief (`SOURCES_DE_REGLAGES`,
`runtime/src/claude.ts`, is empty). Not loaded, and cut by: account and repository settings (`~/.claude/settings.json`,
`.claude/settings.json`, `settings.local.json`: plugins, skills, hooks, agents, variables)
`--setting-sources ""`; skills, `--disable-slash-commands`; MCP servers (repository, account, claude.ai
connectors), `--strict-mcp-config`; the account's automatic memory,
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Loaded: the Max connection; the **project secrets its repository
declares** and no others (`BRIGADE_SECRETS_FILE`, "The project's secrets"); the repository's
`CLAUDE.md` **not automatically** (the brief sends the cook to read it). The machine's GitHub account
(`gh`, `git push`) is usable under the single identity, **not** under one identity per role (no token,
`GH_CONFIG_DIR` empty; "One GitHub identity per role").

So **the repository's hooks do not run under a cook**, and a `CLAUDE.md`'s imports (`@file`) are
followed only if the cook reads them.

### The cook does not deliver, the station harvests

The cook commits in its worktree. `git push`, `git merge` and `gh pr merge` are
forbidden to it at launch (a good-faith safeguard: it runs in `bypassPermissions`). The real closure:
under one identity per role it gets **no GitHub token**, and branch protection lets only the pass's
identity merge.

| Ending | Recognised by | What the station does | Breaker |
|---|---|---|---|
| **done** | commits on the branch, concluded or not (error, guardrail, lease) | commits the rest, pushes, opens the PR, puts the ticket **in pass**, comments | success |
| **done, no diff** | no commit, a **delimited deliverable**, an **intact** worktree | no push, no PR, ticket **in pass** (`cook.reported`, reason `no-diff`): the reviewer judges it alone | success |
| **failed** | no commit and nothing delimited (`no-deliverable`); files never committed (`no-commit`); no commit and no conclusion; a worktree off its branch (`off-branch`) or abandoned ("What is left after a cook"); an impossible push | returns the ticket, comments with the reason; what it wrote is committed on its **local** branch, never pushed | failure |
| **86** | the stream says the quota is exhausted | ticket **86** until the quota is back | not counted |
| expired connection | the stream says the machine has no session | returns the ticket, comments, takes nothing until "resume" | not counted |
| **refused by the model** | `stop_reason: refusal`, no commit | "When the model refuses" | not counted |
| the chef's "stop" | — | nothing harvested: back to queued | not counted |
| **ticket off the rail** | issue closed, `fire` removed | stops the cook, pushes nothing, comments; work stays on the local branch | not counted |

A failed ticket is taken again at once by a new cook (new worktree and branch); the breaker bounds the
series. **The worktree goes away at the end of the cook.**

**What a cook leaves uncommitted goes into the delivery**, in a separate commit in the name of
`brigade`; the comment says so and the reviewer is warned. What the project ignores never goes in, but
**a new file it does not ignore does** (a `.env`): the reviewer holds it as blocking; the guard is the
project's `.gitignore`.

- **A cook finishing with its ticket off the rail**: branch pushed, **no PR**; the comment gives the
  command to open it.
- **A ticket the pass sent back** restarts on the refused delivery's branch, in a new worktree, with
  the findings as its brief, on the same PR.
- **A runtime that died between the send to pass and the report**: at startup the station finds the
  PR, rereads the raw stream and writes `cook.reported` (`reconciled: true`); no cook is relaunched.

**What a human pushes onto a cook's branch is never overwritten** (guarded `--force-with-lease`).
**Between two cooks**, the resend cook restarts from what the origin carries (a branch you rewrote is
adopted as it is); if the clone keeps a failed cook's never-pushed harvest, the station merges the two
(merge commit in the name of `brigade`), and **on a conflict** launches no cook: 86 (`worktree-failed`,
offered again ten minutes later), the alert names the branch and files, to reconcile by hand in the
clone. **While the cook works**, the push fails (`push-failed`); the work stays local, the next
resumption merges.

The end-of-cook **comment** (French until translated) carries ending, calibration, turns, tokens,
duration, branch, PR, then **what the cook delimited**; the rest of its message is folded. All of it
is in the log (`cook.reported`), the raw stream in `runs/<run>.jsonl`.

#### The deliverable is delimited

A cook's deliverable is **what it delimits in its last message, between `<livrable>` and
`</livrable>`** (`runtime/src/livrable.ts`; tags French until the runtime is translated), and nothing
else. With a diff it is the report, in the PR body; with no diff it is the deliverable itself.

- Several delimitations: **the last one**. An opening reopened before being closed: what follows the
  **last** opening. A closing with no opening, a foreign tag, a **quoted** tag: ignored.
- An opening **never closed**, an empty delimitation, none: **no deliverable**.

Tags are read whatever their case. **With no deliverable**, a cook that committed is not a failure
(its message is published as it is); one **with no commit** has failed (`no-deliverable`).

### When the model refuses

`claude` exits with an error and its stream ends on `stop_reason: refusal`: neither an outage nor a
failure, noted apart (`cook.exited`, `outcome: refused`), **not counted by the breaker**. At the
**third refusal in a row** of the same launch, the runtime stops and tells you on the issue (with the
category when `claude` gives it). Up to two in a row:

- a ticket's **cook**: back to queued, comment `refusé par le modèle, essai n/3`; at the third, 86,
  reason `refused`, `Remonté au chef` (wording in `runtime/src/station.ts`, French until translated);
- the **review** of a delivery: retried at the next wake-up; at the third the pass escalates
  (`unjudged`, cause `review-refused`): 86, no merge; the kitchen takes it up (sent back once to a
  cook, then a `fix` ticket), not your queue;
- a manager's **judgment**, **split** or **reaction**: retried at the next wake-up; at the third it is
  pinned like an unreadable answer (`manager.failed`, `manager.split-failed`, or a reaction that
  escalates).

Then reword, recalibrate, or relaunch (remove then set `fire` again).

### 86: the quota is exhausted

A normal state: the ticket goes 86 until the quota's return time (one hour if `claude` gives none),
then the station serves again.

### Max connection expired

The station sees it at startup (`claude auth status`) and in a cook's stream. It writes
`station.disconnected`, comments on the ticket that suffered it, and **takes no more tickets**;
`run status` says so (`connection`: `MISSING` at startup, `EXPIRED` along the way).
**To restart**: `claude /login` under the service account. The runtime rereads the renewal's state
file at every tick: once a **successful** pass carries credentials **rewritten** after the drop
(`renouvele` or `ecrits` more recent than `station.disconnected`; a fresh `verifie` is not enough), it
writes `session.restored`, the stop lifts, and the output says "connexion Max rétablie à HH:MM, la
cuisine a repris" (count one minute). `guardrails -- resume` remains for the other stops and to date a
reconnection no renewal saw.

The runtime **refuses to start** if its environment carries `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`.

### The Max session: renewal and alert

The Max session is renewed **outside the partition**; the runtime **follows it without reading it**,
through a state file.

- **The renewal**: `runtime/deploy/brigade-renouvellement`, run every minute by
  `brigade-renouvellement.timer` under the service account, one per box. It runs `claude mcp list`
  outside any partition (`claude` refreshes its token there if it expires within five minutes), calls
  no model, never reads the credentials file (only its date and inode, with `stat`) and writes only
  `/var/lib/brigade/.session/renouvellement` (`BRIGADE_SESSION_STATE`): `key=value` lines of dates
  and a failure's kind, never a token. Keys (`renouvele`, `ecrits`, `verifie`, `echec`) and kinds
  (`session-refusee`, `non-renouvele`) stay French until translated; see the script's header.
- **The follow-up**: the runtime rereads the file at startup and every tick, logging only changes
  (`session.observed`).

With a **long-lived token** (`BRIGADE_CLAUDE_TOKEN_FILE`) none of this applies (no `session.observed`,
`session.restored` or alert below).

**The alert.** When the estimated expiry enters the notice period, the chef's queue carries a
`session` line in `awaiting`: `Max session close to its expiry — <estimated expiry> — to do before
then: claude /login under the service account, then run guardrails -- resume` (or, on a failed
renewal, `Max session renewal failing (<kind>: <detail>) — …`).

- **The expiry is estimated**, never read: a token's life (`BRIGADE_SESSION_LIFETIME`, default
  `28800` s) counts from the latest of the last successful renewal, the last credentials write seen
  and the chef's last reconnection ("resume"). The announcement leaves `BRIGADE_SESSION_WARNING`
  before (default `10800` s). The warning cannot exceed the life, the life cannot be `0`: startup
  refuses it.
- **A failed renewal does not cancel it**: the line leaves at the next successful renewal or the
  chef's "resume". Once the session has dropped, `connection` carries it.
- **Without the state file, nothing announces itself** (timer not installed, no pass yet, file
  `absent`/`unreadable` in `session.observed`). Installation step 5 copies the units; `sudo systemctl
  enable --now brigade-renouvellement.timer` starts it (the station's package enables its own).
- **The renewal only repairs what `claude` can refresh**: if Anthropic refuses it or the token died
  unrenewed, only `claude /login` under the service account restarts (**manual**).
- **One file per box, one Max session.** The announcement stops nothing; liveness (`live`) shows in
  `session.observed`.

The runtime never opens `.credentials.json` (a test guards `runtime/src`); under the partition the
credentials are read-only ("The partition"), the renewal alone rewrites them. A renewal failing in a
loop shows as `echec` more recent than `verifie`.

### The long-lived token's expiry

The token that `claude setup-token` created at installation (`BRIGADE_CLAUDE_TOKEN_FILE`) **lives one
year** (365 days, `VIE_DU_JETON_JOURS` in `runtime/src/events/token.ts`). The Max connection step
stores its creation date next to it (`<file>.cree`, an ISO 8601 date, without the token). The runtime
rereads it at startup and every tick, and logs only what changes (`token.observed`).

Thirty days before the expiry (`PREAVIS_DU_JETON_JOURS`), the chef's queue carries one `token` line,
counted from the opening of the notice period: `Max connection token close to its expiry — it expires
on <date>, 365 days after its creation (<date>)`, with the gesture: `claude setup-token` under the
service account, delete `<file>`, run the Max connection step again (`docs/installation-station.md`,
step 5). Past the expiry: `Max connection token EXPIRED since <date>`. A creation date absent (token
stored by hand), unreadable or not a date is said so. The line never quotes the token and leaves when
the remade token carries a new date. Without `BRIGADE_CLAUDE_TOKEN_FILE`, nothing is announced; the
announcement stops nothing.

### Revoking the Max connection

**When**: as soon as you believe the account's credentials have left the machine (a
`.credentials.json` or `sk-ant-…` token seen in a PR, branch or comment; unexplained consumption). A
`credentials-committed` refusal or a masking alone are not a leak. When in doubt, revoke, **at
Anthropic, from a browser** logged in to the Max account:

1. **Stop serving**: `guardrails -- stop`.
2. **<https://claude.ai/settings/claude-code>**: remove **all** of Claude Code's authorisations.
3. **<https://claude.ai/settings/account>**: log out all sessions; change the password.
4. **Check**, on the box: `sudo -u <account> claude auth status` must no longer answer
   `"loggedIn": true`, and `sudo -u <account> claude -p "ok"` must ask for `/login`. If not, write to
   Anthropic's support and leave the station suspended.
5. **Reconnect**: `claude /login` under the service account, then `guardrails -- resume`.

`claude /logout` on the box is not enough. A token **pushed to GitHub**: revoke first, then close the
PR and delete the branch.

### Seeing the station

```bash
npm --prefix runtime run station                 # see it
npm --prefix runtime run station -- cooks 12     # set its cap (0: no limit)
npm --prefix runtime run station -- cooks auto   # back to the default cap
```

Its output is **in English**, with the words of `docs/glossary.md` (decision gestures such as
`seuil-ticket` keep their name until translated; the old `retirer` and `aide` still answer, saying
the new word). It shows the cap
(`simultaneous cooks`), the machine (for a remote station, its **presence** and **ordinary tickets**),
the Max connection, the quota, the hold (`withholding`), the cooks running with their calibration,
the last ten finished (`latest cooks`), and **`consumed`**: all the project launched (cooks, reviews,
judgments), running now, over the **last 5 hours** (the Max quota's window) and **24 hours**. It is
not the account's consumption (the chef's sessions are invisible): `/usage` remains the truth.

Events (* = no ticket):

- `station.announced`*, `station.withdrawn`*: a declared station introduces itself (engine, provides,
  cap, `cores`, `remote`, `ordinary`), or is no longer declared. `stations.undeclared`*: none declared,
  no cook leaves. `station.capped`*: `maxCooks` (`0` no limit, `null` for `cooks auto`).
  `station.86`*: quota exhausted until `until`. `station.disconnected`: the Max connection expired.
- `station.saturated`*, `station.relieved`*: the machine cannot cope (`resource`: `cpu`, `memory`,
  `disk`; `observed`, `limit`; for memory `limitFrom`: `{ totalMb }` or `env`; `also`), then breathes.
  `station.held`*, `station.released`*: a ticket could leave and is not taken (`reason`, "Several
  cooks at once"), then nothing holds. `station.unarbitrated`*, `station.arbitrated`*: the arbiter
  stops answering (one cook at a time, `cook.launched` carries `unarbitrated: true`), then answers.
- `cook.stalled`: half the lease passed with no progress (`idleMs`, `leaseMs`). `cook.out-of-zone`:
  `zone`, `files` (`path`, `owners`), `cardChanged`; never written for a ticket taken with no zone.
  Both are signals.
- `ticket.86` reasons: `no-calibration`, `unreadable-card`, `refused` (no return time);
  `setup-failed`, `ticket-unreadable`, `secrets-unavailable`, `worktree-failed` (back at `until`;
  `why`: git's error; `access`: `blocked`, `reason`, `gesture`). `worktree.prepared`: prepared again
  after a `worktree-failed`; the published failure falls.
- `setup.failed`: `why`, `hosts` (what the door refused); decides the issue comment.
  `preparation.setup-failed`: the preparation ticket's setup failed, its cook leaves anyway (`run`,
  `why`, `sentence`, shown while that cook is the last launched).
  `setup.blocked`, `setup.unblocked`: the setup failed like the previous one (`why`, `hosts`, `base`,
  the integration commit the worktree started from): no setup until the branch moves.
- `aside.failed`, `aside.blocked`, `aside.unblocked`: a cause for setting aside (`worktree-failed`,
  `ticket-unreadable`, `secrets-unavailable`), `reason`; twice in a row with no cook between, the
  project is blocked (`base`) until a cook leaves, another cause, or the base moves (`why`).
  `secrets.unavailable`: `problems`, names of variables and files, **never a value**.
- `cook.reported`: `ending` (`done`, `failed`, `86`, `disconnected`, `refused`); `reason`
  (`no-commit`, `no-diff`, `no-deliverable`, `guard:idle`, `guard:lease`, `harvested:…`,
  ``secret-committed: `NAME` ``, `credentials-committed: name` or `shape`: nothing is pushed);
  `summary` (secrets and credentials masked); `deliverable` or `null`; `pr`; `reconciled`.
