# One GitHub identity per role (#174)

V2 milestone 7 (epic #179). Pilot: `BOBL-tech/calculus-workspace` — one organization, one private
repository, an integration branch that is `main`, and humans who work in it.

## The problem

Today everything goes through the machine's `gh` and `git`: a single GitHub identity for the
cook, the station, the pass and the manager. A branch protection only tells different actors
apart; "only the pass merges" therefore rests only on the list of tools forbidden to the cook.

## What is settled

### Three Apps, not one, not four

| Identity | What acts under it | Token rights (the project's repository only) |
|---|---|---|
| **cook** | the station, on the cook's behalf: fetch the base, push `cook/<run>`, open the PR | `contents: write`, `pull_requests: write` |
| **pass** | the pass: read PRs and CI, merge, close the issue, comment its verdict on it | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | the manager and the rail: poll the issues, rail and calibration labels, comments, issues born of a split, an epic's body — and what the station says on the issue | `issues: write` |

Why this number:

- **Not one** (what the V2 spec said, "one GitHub App per repository"): GitHub gives an App only
  one identity. A branch protection could not let the pass merge without letting the one who
  pushes the cook branches merge.
- **Not two** (pass / everything else, with tokens reduced per role): reducing a token's rights is
  done by the runtime, not by GitHub. The key that makes the manager's tokens would also make the
  cook's; and a label set by the manager would read under the same name as a cook's PR. The ticket
  asks for distinct identities, readable by humans.
- **Not four**: the **reviewer has no GitHub action**. It is a `claude` launched without a token
  in a throwaway worktree; its verdict is a fact of the log, published by the pass in its
  comment. An App for it would be a fourth key on the machine for zero calls. The "distinct
  identities" criterion is met in the strongest way: it has none.
- **Not one per cook**: cooks are interchangeable, and the PR already names its ticket and its run.

### The cook itself has no token

The cook does not push, does not open a PR, does not comment: the station does it. It therefore
receives **nothing** — neither a write token nor a read token. Consequence, on a private
repository: it can no longer read its ticket with `gh issue view`. In Apps mode, the station
**hands it the ticket as a file** (`runs/<run>.ticket.md`: title, body, comments with their
author), outside its worktree, and the instruction sends it there.

The "cook" identity is therefore the one under which the station delivers *for* it. What the
station says on the issue (report, failure reason) goes out under the **manager** identity:
commenting on an issue requires `issues: write`, which also allows closing and labeling it — what
the cook identity must not be able to do.

### Short-lived, reduced, never written

- One installation token per role, requested from GitHub with `repositories: [<repository>]` and
  the rights in the table: even if the App is installed more broadly or was given more rights, the
  token is only good for that repository and that role. It expires in one hour (GitHub).
- The runtime keeps it **in memory**, requests it again ten minutes before its end, and maintains
  it at every tick: a pass action or an end-of-cook push, even hours later, goes out with a live
  token. No long-running process (cook, gates, reviewer, manager's judge) receives one.
- It reaches `gh` and `git` only through **the environment of the process launched for an action**
  (`GH_TOKEN`; `GIT_CONFIG_*` for the HTTP header) — never through an argument, never in a file,
  an event or an error message.
- The exchange (JWT signed by `node:crypto`, then `POST /app/installations/<id>/access_tokens`)
  goes through `fetch`, not `gh`: a JWT in a command argument would be readable in `ps`.
- The private key: one file per role, `0600` required (otherwise refusal to start), read at
  startup.

### Configuration

One variable, optional: `BRIGADE_GITHUB_APPS_DIR`, a directory holding, for each of the three
roles, `<role>.id` (the App's identifier) and `<role>.pem` (its private key).

- **Absent**: single identity, as today. The runtime **says so** at startup, and nothing else
  changes — neither the cook's instruction nor its environment.
- **Present**: all six files are required; one is missing, a key is readable by others, two roles
  carry the same App → refusal to start, naming the file.

`BRIGADE_GITHUB_API_URL` exists for tests (like `BRIGADE_GH_BIN`): never set on the box.

### What the cook, the gates and the judges see of GitHub in Apps mode

Their environment loses `GH_TOKEN`, `GITHUB_TOKEN` and their variants, including those a setup
would export — for the cook as for the gates, which replay the setup and run the cook's code;
`GH_CONFIG_DIR` points to an empty directory and `GIT_TERMINAL_PROMPT=0`. This is tidiness, not
the closure: the closure is that these processes **do not receive** any token, and that the branch
protection refuses any actor other than the pass.

### `merge.done` says who

- `PR` gains `mergeePar` (GitHub's `merged_by.login`).
- `merge.done` gains `actor` (optional: logs from before replay fine): the account that merged —
  the one GitHub names when the pass observes a merge, the pass's identity when it has just done it
  itself.
- In Apps mode, `by` is no longer assumed: it is `pass` if and only if GitHub names the pass's
  identity. The case that changes: a merge found again at restart after an intent with no result
  used to be credited to the pass without proof; if done by hand in the meantime, it is now
  `outside`, and the base is checked.
- In single identity, nothing tells the pass's account from the chef's: `by` stays declarative,
  and `actor` is only known when it was read on GitHub.
- `npm run pass -- <ticket>` displays it.

## What remains unguaranteed (to be written in the doc)

- **The cook runs under the runtime's Unix account.** It can read what that account can read: the
  Apps' keys, a `gh auth login` or an SSH key left on the machine. The runtime does not *give* it
  anything, it does not *prevent* it from looking. Closure: the container (#176). Until then, the
  box must carry neither a logged-in `gh` nor an SSH key registered with GitHub.
- **The runtime holds the three keys**: it is the boundary. A runtime flaw is worth all three
  roles.
- **The branch protection is a repository setting**, set by the chef: the runtime does not check
  it. Without it, the cook identity (`contents: write`) can push to the base.
- **The repository's humans** keep their rights: a manual merge remains possible, seen as
  `outside` and checked after the fact.
- In **single identity**, none of this is closed: it is the state from before.

- **A ticket that touches `.github/workflows/` cannot be pushed in Apps mode.** GitHub requires
  the `workflows` right of an App for that, and the cook identity does not have it: whether a cook
  may rewrite a project's CI is a decision for the chef, not a runtime defect. The cook fails
  (`push-failed`), and the reason names the missing right. Under single identity, this push went
  through.

## What the chef plays (acceptance, outside the repository)

Create the three Apps on the organization, install them on the project's repository only, put keys
and identifiers on the box, and a rule (ruleset) on the integration branch that reserves its
update for the **pass** App and the humans who already merge. Then: ask a cook to merge — it
fails; read `npm run pass` — the merge carries the pass's identity. The walkthrough is written in
`docs/runtime.md`, "One GitHub identity per role".

## Out of scope

Project secrets (#175), container (#176), MCP authentication, multi-human access, GitHub
Enterprise (the `github.com` host is assumed).

## Plan

1. `identites.ts`: configuration, JWT, exchange, token cache and maintenance, identity
   (`GET /app`) — tests against a fake local HTTP server.
2. `github.ts`: per-call token in `gh`'s environment, `mergeePar`, `identite()`; one GitHub per
   role, composed for the station and the pass.
3. `depot.ts`: token in the environment of `git`'s network actions.
4. `claude.ts` / `station.ts`: environment without GitHub, ticket handed over as a file,
   instruction.
5. `pass.ts`, `events/pass.ts`, `montrer-pass.ts`: `actor`, `by` verified.
6. `main.ts`: wiring, announcement of the mode, maintenance at the tick.
7. `docs/runtime.md`: new section, variables, box, acceptance, "What the pass does not guarantee".
