# A project's secrets reach its cooks, and only them (#175)

Milestone 7 of V2 (epic #179). V2 spec, §Isolation and secrets: "**Dev secrets**: one file
per project, mounted only in its container. Never prod."

## The problem

`brigade` has no secrets; a real project does not get far without — a test database, a
sandboxed third-party service, a development API key. Today, the only way to give a value to
a cook is to have `worktree-setup.sh` export it, and that file is **versioned**: a secret value
has no place in it. What remains is the runtime's environment, which the cook inherits wholesale — that is,
putting the project's secrets in the systemd unit, next to what the runtime keeps for itself, with
nothing saying what is expected, what is missing, or what must be hidden.

## What is settled

### Two sets: names in the repository, values on the machine

| | Where | What it carries |
|---|---|---|
| **The declaration** | `.claude/brigade/secrets`, in the project's repository, versioned | variable **names**, one per line (`#` comments) |
| **The values** | the file named by `BRIGADE_SECRETS_FILE`, on the machine, outside the repository | `NAME=value`, one per line |

A cook receives **the intersection**: the variables its repository declares, with the value the
machine holds. A value the repository does not declare is given to no one; a name declared
without a value is a missing secret (see below).

The declaration is read **in the cook's worktree**, like the setup: it is the branch that says what
it needs. A cook that adds a name to the declaration gains nothing more than what the
chef put in **this** project's file.

The values file:

- **optional** (`BRIGADE_SECRETS_FILE` absent: the project has no secrets, nothing changes);
- an absolute path, **outside `BRIGADE_STATE_DIR` and outside `BRIGADE_REPO_DIR`** — so outside
  what `backup` takes along and outside any worktree — otherwise startup is refused;
- `0600` required (`chmod 600`), at startup **and at every read**;
- re-read **at every launch** (cook, setup, gates): a value is replaced without restarting.
- Format: `NAME=value`, the value runs to the end of the line; a leading `export ` and a surrounding
  pair of quotes are removed; `#` comments; no multi-line values, no interpolation.

### The secrets path is not the runtime environment's path

The milestone 1 rule stands whole: the cook's environment is the runtime's minus `BRIGADE_*`
and minus what would divert `claude` from the Max connection, and a setup brings in neither an Anthropic
key nor (under a per-role identity) a GitHub token. The project's secrets do not travel through it: they are
**added** by the runtime, by name, at launch time.

The names the runtime reserves for itself cannot be declared: `BRIGADE_*`, `ANTHROPIC_*`,
`CLAUDE_*`, `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`. A project therefore cannot, through this path,
give a cook a model key or a GitHub token — that is #174's business.

### Who receives them

| Process | Receives the secrets? | Why |
|---|---|---|
| the worktree setup | yes | it prepares the test database |
| the cook | yes | that is the point |
| the gates (pass: delivery, meeting, base check) | yes | they run the project's tests, which need the same database; same project, same code |
| the reviewer | **no** | it reads a diff, it runs nothing of the project |
| the manager's judges | **no** | they read tickets |

### A missing secret stops things before launch

Before the setup and before the cook, the station reads the declaration and the values. At the
slightest problem, **no cook is launched**: the ticket goes 86 for ten minutes (reason `secrets-unavailable`), then
comes back by itself — like a failed setup, nothing is consumed and the breaker counts nothing. The
problem is written to the log (`secrets.unavailable`, names, never a value) and **commented
on the issue, once**: the comment is only posted again if the list of problems changes.

What counts as a problem: a declared name absent from the file, `BRIGADE_SECRETS_FILE` undefined
while the repository declares, a missing file / readable by others / badly written line, a badly
written or reserved name, a too-short value, a production mark.

On the pass side, gates that cannot receive their secrets are **not run** — never red for that
reason, a send-back to the cook would change nothing: the delivery is escalated to the chef
(`secrets-unavailable`; it is not re-judged alone — putting `fire` back relaunches a cook), a meeting escalates `replay-failed`, a base check is "not
run" with its reason.

### The masking

Everywhere a text from a process that received the secrets is kept or published, each value
is replaced by `[secret:NAME]`:

- the cook's raw stream (`runs/<run>.jsonl`, `.stderr`), **at write time** — everything derived from it
  (report, `cook.reported`, issue comment, PR body, send-back instruction) is therefore
  already masked;
- the output of the setup and of the gates that the runtime keeps (journald, `failures` and `tail` in the log,
  the pass's comment, send-back instruction);
- the reviewer's stream: it receives no secret, but it reads a worktree where the gates have just
  run with them.

Both the exact value and its JSON-escaped form (the one it takes in the stream) are masked.

**The short-values rule: under 8 characters, it is not a secret, and the runtime refuses it.**
Masking `test` or `1234` would eat half a report; not masking them
would make two kinds of secrets. A short or trivial value is configuration: it goes in the
exports of `worktree-setup.sh`. Everything the secrets file carries is masked, without exception.

**A delivery that carries a secret is not pushed.** Before the push, the station looks for the
values in everything the branch adds (patches and commit messages, harvest included — a
`.env` written by the cook would otherwise be harvested and pushed). If found: the cook has failed
(`secret-committed`), nothing leaves, the ticket goes back to queued, and the comment names the
variable.

- Read in full: a binary file as text (whatever a cook's `.gitattributes` says),
  a merge against each of its parents. What the origin has already received from the branch is not re-read.
- **On a send-back**, the next cook resumes the same branch: the station brings it back to the
  refused delivery (what the faulty cook added there is lost), otherwise every following cook would fail
  until the breaker. On a first cook, the next one starts again from the base.

### "Never prod": what the runtime refuses, and nothing more

The runtime does not know what a value opens. It refuses what can be recognized:

- a **name** that says production (`PROD`, `PRODUCTION`, `LIVE` as a word of the name);
- a **value** that carries a known production-key mark (`sk_live_`, `rk_live_`).

The rest depends on what the chef puts in the file. No grant touches it: secrets
go through no grant, and no grant action widens them.

## What remains unguaranteed (to write in the docs)

- **Isolation between projects rests on file permissions** as long as the container (#176)
  does not exist. A cook runs under the runtime's Unix account: it can read its project's file
  in full (not only what is declared), and that of another project served under the
  same account. Until #176: one Unix account per project, or nothing sensitive.
- **Masking is a net against accident, not a fence against a cook that wants to get a value
  out**: transformed (base64, split in two, a URL fragment), it gets through. The fence is that
  these are dev secrets, and #176's allow-listed network.
- The session transcript that `claude` writes under `~/.claude/projects` is not masked: it stays
  on the machine, under the account.
- What the project's gates themselves write to disk (`.brigade-state/gates/` in
  brigade) is the project's business.
- A secret replaced while a cook is running does not reach it: it applies to the next launch.

## Out of scope

The container and the network (#176); the roles' GitHub token (#174); a command to set a
secret (the file is edited); encryption at rest.

## Plan

1. `secrets.ts`: configuration (`BRIGADE_SECRETS_FILE`), reading the declaration and the values,
   problems, mask, leak search — unit tests.
2. `superviseur.ts` / `garde-fous.ts`: raw stream masked at write time, line by line.
3. `gates.ts`: output of the setup and of the gates masked.
4. `depot.ts`: what the branch adds (patches and messages).
5. `station.ts`: read before setup, refusal before launch (86, log, single comment),
   environment, mask, refusal to push a secret.
6. `pass.ts`: the gates' secrets, escalation when they are missing.
7. `main.ts`: wiring, announcement at startup.
8. `installation.ts`: the checker reads `BRIGADE_SECRETS_FILE`, the dry-run setup receives the secrets.
9. `docs/runtime.md`: section "Les secrets du projet", setup, "Ce qu'un cook charge", variables,
   "Ce que la pass ne garantit pas".
