## One GitHub identity per role

By default, everything the runtime does on GitHub goes out under **a single account**, that of the machine's `gh` and
`git`: a branch protection then cannot let the pass merge
without letting everything else merge. On a shared repository, you give the runtime **three GitHub Apps**,
each an identity (`<name>[bot]`) that branch rules can name.

| Identity | What acts under it | What its token is worth, on the project's repository only |
|---|---|---|
| **cook** | the station, **on behalf of** the cook: fetch the base, push `cook/<run>`, open the PR | `contents: write`, `pull_requests: write` |
| **pass** | the pass: read PRs and CI, merge, close the issue, publish its verdict and the reviewer's review there | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | the manager and the rail: poll issues, set labels, comment, create an epic's tickets — and what the station says on the issue | `issues: write` |

The **reviewer has no GitHub action**: it is a `claude` launched without a token in a disposable
worktree; its review is a log fact, which the pass publishes.

### The cook has no token

The "cook" identity is the one under which the **station** delivers. The cook's process receives
**nothing**: no write token, no read token.

- Its environment — and that of the gates, the reviewer and the manager's judges — loses `GH_TOKEN`,
  `GITHUB_TOKEN` and their enterprise variants, including those a worktree setup
  would export. `GH_CONFIG_DIR` points there to an empty directory (`gh-sans-compte/`, in the state);
  `GIT_TERMINAL_PROMPT=0`.
- **It does not read its ticket through `gh`**: the station hands it over as a file,
  `runs/<run>.ticket.md` — title, body, comments with their author, as at launch —,
  outside the worktree. Unreadable at that moment: **no cook is launched**, the ticket goes **86**
  for ten minutes (`ticket-unreadable`), then goes back to queued.
- What the station writes on the issue goes out under the **manager** identity: commenting requires
  `issues: write`, which also allows closing and labelling — the cook identity cannot.

### One-hour tokens, narrowed, never written

- For each action, an **installation** token of the role's App, requested with the project's
  **sole repository** and the rights in the table — even if the App is installed more widely. It **expires in one
  hour** and lives **in memory**, renewed at each tick before it ends. GitHub unreachable: said
  once in journald, retried at each tick; the actions that depend on it fail like an outage.
- It reaches `gh` and `git` only through the **environment of the process launched for that action** — never
  through an argument, a file, a log event, a cook stream, a comment or an error
  message. The account credential helper is cut for these actions, an SSH clone
  goes back to HTTPS, and the exchange goes directly to GitHub's API.
- No long-running process receives a token: not the cook, not the gates, not the reviewer, not a judge.

### The merge says who did it

`merge.done` carries `actor`, the GitHub account that merged; `npm run pass -- <ticket>` shows it.
When the pass **notices** a merge (by hand, or found again at restart), `by` is **what
GitHub names**: `pass` if it is its identity, `outside` otherwise — and the base is then checked.
Under the single identity, `by` stays what the runtime assumes.

### What you create at GitHub

Once per project, by someone who administers the organization. **This path could not be
played from a dev session**: it is the recipe.

1. **Three GitHub Apps**, created on the **organization** (*Settings → Developer settings → GitHub
   Apps*), named `<project>-cook`, `<project>-pass`, `<project>-manager`. No webhook, no
   organization or account right, *Only on this account*. Repository rights — cook: *Contents*
   and *Pull requests* read and write; pass: the same, plus *Issues* read and
   write, *Checks* and *Commit statuses* read; manager: *Issues* read and write.
   **No *Workflows* right** for the cook App: a ticket that touches `.github/workflows/` cannot be
   pushed, and its failure says so. Giving less makes the token be refused (`token refused`, journald).
2. **Install each on the project's repository only** (*Only select repositories*), and note down for
   each its **private key** (`.pem`, given only once) and its *App ID*.
3. **On the box**, a directory that only the service account reads:

   ```bash
   sudo install -d -m 700 -o <account> /etc/brigade/<project>/apps
   # For each of the three roles: cook, pass, manager
   echo <App ID> | sudo -u <account> tee /etc/brigade/<project>/apps/<role>.id
   sudo install -m 600 -o <account> <the downloaded key>.pem /etc/brigade/<project>/apps/<role>.pem
   ```

   then, in the drop-in: `Environment=BRIGADE_GITHUB_APPS_DIR=/etc/brigade/<project>/apps`. A missing
   file, a key readable by others than the account, a file that is not a key,
   or two roles under the same App: the runtime **refuses to start** and names the file. These keys
   are copied neither into the drop-in, nor into a readable backup, nor into the repository.
4. **Remove the GitHub account from the machine**: `sudo -u <account> gh auth logout`, no SSH key of the
   account at GitHub, no `GH_TOKEN` in the drop-in. On a private repository, the first clone is
   made with a token of yours, which you do not leave in the `origin` address.
5. **The branch rule that reserves the merge** — add a rule, do not remove any. An active *ruleset*
   on the integration branch (*Settings → Rules → Rulesets*, or `gh api -X POST
   repos/<owner>/<repo>/rulesets`), with **Restrict updates**, **Restrict deletions** and **Block
   force pushes** (`update`, `deletion`, `non_fast_forward`); in the *Bypass list*, the **pass** App
   (`Integration`, *Always*) and the humans who merge. Neither the cook App nor the manager App appears there.

At start, the runtime states its mode: `GitHub — one identity per role (cook, pass, manager) …`
or `GitHub — single identity … nothing reserves the merge to the pass`. A badly installed App does not
make the start be refused: it is stated in journald from the first tick (`identity "pass": its
App (…) is not installed on <owner>/<repo>`), and nothing goes out under that role until then. What
remains unguaranteed: see "What the pass does not guarantee".

## The project's secrets

The project's dev secrets have their own path, **separate from the runtime's environment**: the rule
that keeps the runtime's state, the Anthropic keys and the GitHub tokens away from the cook does not move.

- **The declaration**: `.claude/brigade/secrets`, in the repository, versioned — variable
  **names**, one per line; `#` comments.
- **The values**: the file named by `BRIGADE_SECRETS_FILE`, on the machine
  (`/etc/brigade/<project>/secrets.env`) — `NAME=value`, one per line.

**A cook receives the intersection**: the variables its repository declares, with the value the
machine holds. The declaration is read in the cook's worktree, on its branch. A delivery that
touches it is never merged by the pass: it waits for your review (`review-required`, cause
`declaration-modified: …` — see "What the pass decides").

The values file: an absolute path, **outside `BRIGADE_STATE_DIR` and `BRIGADE_REPO_DIR`**,
`chmod 600` — otherwise the runtime refuses to start. A value runs to the end of its line; a
leading `export ` and a pair of surrounding quotes are removed; nothing is interpolated. **It is
reread at every launch**: a value is replaced by editing the file, without restarting anything.

### Who receives them

The worktree setup, the cook, and the gates the pass plays (on the delivery, on the base):
**yes**. The reviewer and the manager's judgments: **no** — they run nothing of the project.

### What cannot be declared

- The names by which the runtime drives its cooks: `BRIGADE_*`, `ANTHROPIC_*`, `CLAUDE_*`,
  `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`.
- **Nothing of production** — no grant touches it. The runtime does not know what a value opens;
  it refuses what can be recognized: a **name** of which a word is `PROD`, `PRODUCTION` or `LIVE`, a
  **value** that starts with `sk_live_` or `rk_live_`. The rest depends on what you put there.
- **A value of fewer than 8 characters**: it is not a secret but a configuration, which is
  exported from `.claude/brigade/worktree-setup.sh`.

### When one is missing

At the slightest problem — a name declared without a value, no `BRIGADE_SECRETS_FILE` while the repository
declares, a missing file or one readable by others, a badly written line, a reserved name, a
too-short value, a production mark — **nothing is launched**: the ticket goes **86** for ten
minutes (`secrets-unavailable`) then is offered again, consuming nothing and counting nothing at the breaker;
**the issue says so, once**, naming each variable and the file — never a value. Once what
was missing is in place, the cook leaves at the next attempt. `npm run installation -- setup` plays the same check
as a dry run. On the pass side, gates that cannot receive their secrets **are not played** —
never red for that reason: the delivery is escalated to you (`unjudged`, cause `secrets-unavailable`) and
is not rejudged on its own — once the values are in place, remove then put back `fire`. A check of the base
is "not played", with its reason.

### No value is read anywhere

Each value — exact, or in its form inside a JSON stream — is replaced by `[secret:NAME]`
everywhere the runtime keeps or publishes a text coming from a process that received the secrets:

the cook's raw stream (`runs/<run>.jsonl` and `.stderr`), masked **at write time**, line by line —
hence its report (`cook.reported`), the issue comment, the PR body, the instruction
of a return; the output of the setup (journald) and of the gates (`failures`, `tail`, the pass's
comment); and the reviewer's review, which receives no secret but reads a worktree where the gates
ran with them.

**A delivery that carries a secret is not pushed.** Before the push, the station looks for the
values in everything the branch adds — each patch, each commit message, what it harvested itself;
a binary is read there as text, a merge commit shows what it changes against
each of its parents. What origin has already received is not reread. Found: the cook fails
(``secret-committed: `NAME` ``), nothing goes out, the ticket goes back to queued — a **first cook**
starts again from the base on a fresh branch; a **return from the pass** resumes the same branch, which the
station **brings back to the refused delivery** (what the faulty cook had added there is lost, and
the issue says so).

### Claude's credentials are not pushed either

The runtime **never opens** the Max account credentials: the same check, before the push, recognizes
them **by their name and their shape**, for any project — with or without secrets, with or without
a partition — in **what the branch adds** (added lines of each commit, messages). A token
written then removed two commits later is recognized; a token that the base already carried, not.

| Sign | What triggers it |
|---|---|
| `name` | a commit **creates a file named `.credentials.json`**, anywhere, whatever its content. Modifying or deleting it triggers nothing |
| `shape` | **a Claude token**: `sk-ant-`, a type and two digits, a dash, then at least 40 characters (`A`–`Z`, `a`–`z`, digits, `_`, `-`) — `oat01`, `ort01`, `api03` |
| `shape` | **the structure of the credentials file**: the key `claudeAiOauth`, then an `accessToken` or a `refreshToken` of at least 20 characters, escaped quotes included |

Recognized: the cook fails (`credentials-committed: name`, `shape`, or both), **nothing is
pushed**, and the ticket goes back to queued as for a secret. The reason, the log and the issue
state **the sign, never the path nor the content**. To see, on the station:
`git -C "$BRIGADE_REPO_DIR" log -p origin/<base>..<the branch the comment names>`.

**Refused wrongly** (the issue comment says so to the next cook): a `.credentials.json`
belonging to the project is committed by you — a cook can neither create it nor rename a file to that
name, but modifies it once it is on the base; an example token is written **truncated** (fewer than 40
characters after `sk-ant-<type>-`) or is **assembled at run time**; a whole token that the base
already carries and that a cook adds elsewhere (moved line, copied file, merged base) is truncated
on the base, once and for all.

**What it does not stop**: a **transformed** copy — base64, encrypted, split. It is
a shape recognition, against accident and injection through the ticket or the diff. Three things
bound the damage: the allowlisted network ("The partition"), **GitHub's push protection** —
to be enabled on the repository by the chef (`installer.md`, "Protecting the integration branch") —, and
revocability ("Revoking the Max connection").

### Nor published in what a cook says

The same recognizer runs over **any text that a process launched by the runtime says, before it is
written** — for any project, with or without secrets, with or without a partition: a Claude token
(the shape above), and inside the `claudeAiOauth` structure the value of `accessToken` and of
`refreshToken` from 20 characters, give up their place there to `[Claude token masked]`. **Only the token
goes**: the surrounding text stays, nothing is refused or held back.

- **Where**: the raw stream of each `claude` launched — cook, reviewer, the manager's judgments and
  splits —, masked **at write time**, after the project's secrets, and thus everything read from it
  (report, comment, PR body, review, instruction of a return, a judge's decision);
  the output of the setup and of the gates, before it is kept. The stream **leaves the machine** with
  `backup`: this is why it is masked at the source.
- **Line by line**: a value delivered in two pieces is masked all the same. What does not have
  its newline yet waits, up to **1 MiB** per output; beyond that, it is masked and written without it,
  and the cut never falls inside what could be an `sk-ant-…` token.
- **A masking is readable, with nothing of the value**: `credentialsMasked` (how many times) in
  `cook.exited` and in `gates` of `pass.judged` and `base.checked`; on the issue, `Masked N times:
  what has the shape of Claude credentials`. The count covers the **whole stream**: a process
  read the account's connection. If they are real credentials: "Revoking the Max connection".

### What is not guaranteed

- **A transformed value gets through** — base64, encrypted, split, straddling two lines: the
  masking is a safety net against accident, not a fence. The structure of the credentials file
  is recognized only **on one line**.
- **On a line of more than 1 MiB, only the `sk-ant-…` token is held**: a project secret or the
  structure of the credentials file, straddling two slices, are not recognized there.
- **Without a partition, partitioning between projects rests on file permissions**: a cook runs
  under the runtime's account and can read its project's whole secrets file, and that
  of another. **With the partition, neither**: only the declared values
  reach it, through its environment.
- Not masked: `claude`'s **session transcript** (`~/.claude/projects`, which stays
  on the machine and keeps the Max credentials if they got in there); what the project's gates
  write to disk themselves; a comment that a cook posts itself on GitHub — under
  one identity per role, it has none.
