## One GitHub identity per role

By default everything the runtime does on GitHub goes out under **a single account**, the machine's
`gh` and `git`: a branch protection cannot let the pass merge without letting everything else
merge. On a shared repository, give the runtime **three GitHub Apps**, each an identity
(`<name>[bot]`) the branch rules can name.

| Identity | What acts under it | Token rights, on the project's repository alone |
|---|---|---|
| **cook** | the station, **on behalf of** the cook: bring in the base, push `cook/<run>`, open the PR | `contents: write`, `pull_requests: write` |
| **pass** | the pass: read PRs and CI, merge, close the issue, publish its verdict and the reviewer's review | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | the manager and rail: poll issues, set labels, comment, create an epic's tickets — and what the station says on the issue | `issues: write` |

The pass's token has **no `actions` permission**: it neither reads a CI job's log nor reruns failed
jobs, so a CI red stays a verdict instead of being rerun once before judging (and, on tests the
delivery does not touch, set aside and sent to the kitchen as a `fix` ticket), and a CI run a red
verdict already judged is judged again, not rerun (`pass.md`). Under the single account, it is rerun.

The **reviewer has no GitHub gesture**: a `claude` launched without a token in a throwaway
worktree; its review is a log fact, which the pass publishes.

### The cook has no token

The "cook" identity is the one under which the **station** delivers. The cook's process receives
**no** write or read token.

- Its environment — and that of the gates, reviewer and manager's judges — loses `GH_TOKEN`,
  `GITHUB_TOKEN` and enterprise variants, including ones a worktree setup would export.
  `GH_CONFIG_DIR` points to an empty directory (`gh-sans-compte/`, in the state directory);
  `GIT_TERMINAL_PROMPT=0`.
- **It does not read its ticket through `gh`**: the station hands it over as
  `runs/<run>.ticket.md` — title, body, comments with author — outside the worktree. Unreadable
  then: **no cook is launched**, the ticket goes **86** for ten minutes (`ticket-unreadable`), then
  returns to queued.
- **On the GitHub-only path** (`brigade-github.ts`), the ticket is in the cook's prompt itself,
  between `<ticket>` and `</ticket>`: body, the zone of its card, the card and the last eight
  comments (claim marks left out), bounded so the prompt stays a valid argument
  (`bac-a-sable/hors-github.ts`). Unreadable: no cook, the ticket is released with the reason on
  the issue. Its environment loses the `gh` tokens on every machine, and `GH_CONFIG_DIR` too in
  the Mac's sandbox, where `gh` then meets the forbidden `~/.config/gh`. The station pushes the
  branch and opens the PR, under the cook identity when each role has one.
- What the station writes on the issue goes out under the **manager** identity: commenting needs
  `issues: write`, which also allows closing and labelling — the cook identity cannot.

### One-hour tokens, narrowed, never written

- Per gesture, an **installation** token of the role's App, requested with the project's
  **repository alone** and the table's rights, even if the App is installed more widely. It
  **expires in one hour**, lives **in memory**, renewed each tick before it ends. GitHub
  unreachable: said once in journald, retried each tick; dependent gestures fail like an outage.
- It reaches `gh` and `git` only through the **environment of the process launched for that
  gesture** — never an argument, file, log event, cook stream, comment or error message. The
  account's credential helper is off for these gestures, an SSH clone goes back to HTTPS, and the
  exchange goes straight to GitHub's API.
- No long-lived process receives a token: no cook, gates, reviewer or judge.

### The merge says who did it

`merge.done` carries `actor`, the GitHub account that merged; `npm run pass -- <ticket>` shows it.
When the pass **notes** a merge (by hand, or found at restart), `by` is **what GitHub names**: `pass`
if its identity, `outside` otherwise — and the base is then checked. Under the single identity, `by`
stays what the runtime assumes.

### What you create at GitHub

Once per project, by the chef, on his **personal GitHub account**. No organization is needed. Every
station is equal: each receives the three App IDs and keys through the app, and none keeps them in
a place of its own.

1. **Create three GitHub Apps** on your account (*Settings → Developer settings → GitHub Apps →
   New GitHub App*), named `<project>-cook`, `<project>-pass` and `<project>-manager`. For each: no
   webhook, *Only on this account*, no organization or account right, and the repository rights of
   its role:
   - **cook**: *Contents* and *Pull requests*, read and write. **No *Workflows* right**: a ticket
     touching `.github/workflows/` cannot be pushed, and its failure says so.
   - **pass**: *Contents* and *Pull requests*, read and write; *Issues*, read and write; *Checks*
     and *Commit statuses*, read.
   - **manager**: *Issues*, read and write.

   Giving less makes GitHub refuse the token (`jeton refusé`, in journald).
2. **Install each App on the project's repository alone** (*Install App → Only select repositories*).
3. **Note each App ID** (shown on the App's settings page).
4. **Download each App's private key** (*Private keys → Generate a private key*). It is a `.pem`
   file, given once.
5. **Hand the three IDs and keys to the app**, which gives them to any station that runs the
   project. A station receives them from the app, never from a file it keeps by hand.
6. **Reserve the merge** with a branch rule — add a rule, do not remove one. An active *ruleset*
   on the integration branch (*Settings → Rules → Rulesets*, or `gh api -X POST
   repos/<owner>/<repo>/rulesets`) with **Restrict updates**, **Restrict deletions**, **Block force
   pushes** (`update`, `deletion`, `non_fast_forward`); in the *Bypass list*, the **pass** App
   (`Integration`, *Always*) and the humans who merge. Neither the cook nor the manager App.

**Keys are never written to the repository, a backup or a log.** A `.pem` is a secret: do not commit
it, do not copy it into a backup, do not paste it into a log, a comment or an issue. The App IDs are
not secret, but they stay with the keys they belong to.

### Where a station keeps them

Each station keeps the three Apps in **its own directory**, `<BRIGADE_STATION_DIR>/apps-github/`:
`<role>.id` and `<role>.pem` for cook, pass and manager. The directory is `700` and each file `600`,
readable by the station's service account alone. This is the same on the box and on the chef's Mac.
The app stores one role at a time (`runtime/src/identites-stations.ts`):

```bash
BRIGADE_STATION_DIR=<station> node src/identites-stations.ts store <role> <App ID> < <key>.pem
BRIGADE_STATION_DIR=<station> node src/identites-stations.ts show
```

The key arrives on standard input, never as an argument, and is never printed back: `show` gives each
role's App ID and whether its key is there. Storing refuses a file that is not a private key, an
unknown role, one App for two roles, an existing directory open to other accounts (`chmod 700`;
nothing is written), and a directory inside a git repository or under `BRIGADE_STATE_DIR`,
`BRIGADE_BACKUP_DIR` or `BRIGADE_REPO_DIR`. The directory sits next to the projects' state (`etat/`),
never under it, so a backup never copies it. Every line of a key that is read or stored goes into the
identifiers mask, so journald, the log and the published texts show `[jeton Claude masqué]` instead.

A project opened after the three Apps are stored acts under them: no restart of the station is
needed for a project not yet open. **No App stored**: the single identity, as before. **Some roles
stored but not all**, or a directory open to others: the project **refuses to open**, and the
missing files are named. `BRIGADE_GITHUB_APPS_DIR`, the box's older setting, is still read first when
it is set.

On the GitHub-only path, every station claims, labels, judges, merges and reads under the **pass**
App, and opens the cook's PR under the **cook** App. The rail and the manager act under the
**manager** App. **Still open**: the claim and verdict readers only trust comments from the owner, a
member or a collaborator. A comment posted by an App (`<app>[bot]`) is likely to count as `NONE`,
so trusting the project's own Apps there is the next step.

At start the runtime states its mode: `GitHub — une identité par rôle (cook, pass, manager) …` or
`GitHub — identité unique … rien ne réserve le merge à la pass` (French until translated). A badly
installed App does not refuse the start: journald says so from the first tick (`identité « pass » :
son App (…) n'est pas installée sur <owner>/<repo>`), and nothing leaves under that role. What
remains unguaranteed: "What the pass does not guarantee" in [`pass-merge.md`](pass-merge.md).

## The project's secrets

Dev secrets have their own path, **separate from the runtime's environment**: the rule keeping the
runtime's state, Anthropic keys and GitHub tokens from the cook does not move.

- **The declaration**: `.claude/brigade/secrets`, versioned — variable **names**, one per line; `#`
  comments.
- **The values**: the file named by `BRIGADE_SECRETS_FILE` (`/etc/brigade/<project>/secrets.env`) —
  `NAME=value`, one per line.

**A cook receives the intersection**: the variables its repository declares, with the machine's
value. The declaration is read in the cook's worktree, on its branch. A delivery touching it is
never merged by the pass; it awaits your review (`review-required`, cause `declaration-modified: …`
— see "What the pass decides" in [`pass.md`](pass.md)).

The values file: an absolute path, **outside `BRIGADE_STATE_DIR` and `BRIGADE_REPO_DIR`**, `chmod
600` — otherwise the runtime refuses to start. A value runs to line end; a leading `export ` and a
surrounding pair of quotes are removed; nothing is interpolated. **Read again at each launch**:
edit the file to replace a value, no restart.

### Who receives them

The worktree setup, the cook, and the gates the pass plays (delivery, base): **yes**. The reviewer
and manager's judgements: **no** — they execute nothing of the project.

### What cannot be declared

- Runtime names: `BRIGADE_*`, `ANTHROPIC_*`, `CLAUDE_*`, `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`.
- **Nothing of production** — no grant touches it. The runtime cannot know what a value opens; it
  refuses what it recognizes: a **name** with a word `PROD`, `PRODUCTION` or `LIVE`, a **value**
  starting `sk_live_` or `rk_live_`. The rest is up to you.
- **A value under 8 characters**: configuration, not a secret; export it from
  `.claude/brigade/worktree-setup.sh`.

### When one is missing

At the slightest problem — a name without a value, no `BRIGADE_SECRETS_FILE` while the repository
declares, an absent or other-readable file, a bad line, a reserved name, a short value, a production
mark — **nothing is launched**: the ticket goes **86** for ten minutes (`secrets-unavailable`), then
is proposed again, consuming nothing and not counting towards the breaker; **the issue says so,
once**, naming each variable and the file, never a value. Once fixed, the cook leaves at the next
try. `npm run installation -- setup` plays the same check as a dry run. On the pass side, gates that
cannot receive their secrets **are not played** — never red for that: the delivery comes up to you
(`unjudged`, cause `secrets-unavailable`) and is not rejudged on its own — with values in place,
remove then set `fire` again. A base check is "not played", with its reason.

### No value is read anywhere

Each value — exact, or in its JSON-stream form — becomes `[secret:NAME]` wherever the runtime keeps
or publishes text from a process that received the secrets: the cook's raw stream
(`runs/<run>.jsonl` and `.stderr`), masked **as written**, line by line — hence its report
(`cook.reported`), issue comment, PR body, send-back brief; setup output (journald) and gates output
(`failures`, `tail`, the pass's comment); and the reviewer's review, which receives no secret but
reads a worktree where the gates ran with them.

**A delivery that carries a secret is not pushed.** Before the push, the station searches for the
values in everything the branch adds — each patch, commit message, what it gathered itself; binaries
are read as text, a merge commit shows its changes against each parent. What the origin already
received is not reread. Found: the cook fails (``secret-committed: `NAME` ``), nothing leaves, the
ticket returns to queued — a **first cook** restarts from the base on a new branch; a **send-back
from the pass** takes up the same branch, which the station **brings back to the refused delivery**
(the faulty cook's additions are lost; the issue says so).

### Claude's credentials are not pushed either

The runtime **never opens** the Max account's credentials: the same pre-push check recognizes them
**by name and shape**, for any project — with or without secrets or partition — in **what the branch
adds** (added lines of each commit, messages). A token written then removed two commits later is
recognized; one the base already carried, not.

| Sign | What triggers it |
|---|---|
| `name` | a commit **creates a file named `.credentials.json`**, anywhere, whatever its content. Modifying or deleting it triggers nothing |
| `shape` | **a Claude token**: `sk-ant-`, a type and two digits, a hyphen, then at least 40 characters (`A`–`Z`, `a`–`z`, digits, `_`, `-`) — `oat01`, `ort01`, `api03` |
| `shape` | **the credentials file's structure**: key `claudeAiOauth`, then an `accessToken` or `refreshToken` of at least 20 characters, escaped quotes included |

Recognized: the cook fails (`credentials-committed: name`, `shape`, or both), **nothing is pushed**,
and the ticket returns to queued as for a secret. Reason, log and issue state **the sign, never the
path or content**. To see, on the station: `git -C "$BRIGADE_REPO_DIR" log -p
origin/<base>..<the branch the comment names>`.

**Refused wrongly** (the issue comment tells the next cook): a project's own `.credentials.json` is
committed by you — a cook can neither create it nor rename a file to that name, but modifies it once
on the base; write an example token **truncated** (under 40 characters after `sk-ant-<type>-`) or
**assembled at run time**; a whole token the base already carries and a cook adds elsewhere (moved
line, copied file, merged base) is truncated on the base, once and for all.

**What it does not stop**: a **transformed** copy — base64, encrypted, split. It is shape
recognition, against accident and injection by ticket or diff. Three things bound the damage: the
allowlisted network ("The partition"), **GitHub's push protection** — the chef turns it on
(`installer.md`, "Protect the integration branch") —, and revocability ("Revoking the Max
connection" in [`station-cook.md`](station-cook.md)).

### Not published in what a cook says, either

The same recognizer runs over **every text a process launched by the runtime says, before it is
written** — any project, with or without secrets or partition: a Claude token (shape above), and in
the `claudeAiOauth` structure the `accessToken` and `refreshToken` values from 20 characters, give
way to `[jeton Claude masqué]` (French). **Only the token leaves**: the surrounding text stays,
nothing is refused or held.

- **Where**: the raw stream of every `claude` launched — cook, reviewer, manager's judgements and
  splits —, masked **as written**, after the project's secrets, hence everything read from it
  (report, comment, PR body, review, send-back brief, judge's decision); setup and gates output,
  before it is kept. The stream **leaves the machine** with `backup`, hence masking at the source.
- **Line by line**: a value delivered in two pieces is masked anyway. What lacks its newline waits,
  up to **1 MiB** per output; beyond, it is masked and written without it, and the cut never falls
  inside what may be an `sk-ant-…` token.
- **A masking can be read, with nothing of the value**: `credentialsMasked` (count) in `cook.exited`
  and in `gates` of `pass.judged` and `base.checked`; on the issue, `Masqué N fois : ce qui a la
  forme d'identifiants de Claude` (French). The count covers **the whole stream**: a process has read
  the account's connection. If they are real credentials: "Revoking the Max connection" (above).

### What is not guaranteed

- **A transformed value gets through** — base64, encrypted, split, straddling two lines: masking is
  a net against accident, not a fence. The credentials-file structure is recognized only **on one
  line**.
- **On a line over 1 MiB, only the `sk-ant-…` token is held**: a project secret or the credentials
  structure straddling two slices is not recognized.
- **Without a partition, project separation rests on file permissions**: a cook runs under the
  runtime's account and can read its project's whole secrets file, and another's. **With the
  partition, neither**: only declared values reach it, through its environment.
- Not masked: `claude`'s **session transcript** (`~/.claude/projects`, which stays on the machine and
  keeps the Max credentials if they got in); what the gates write to disk themselves; a comment a
  cook posts itself on GitHub — under one identity per role, it has none.
