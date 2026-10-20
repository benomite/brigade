## One station per machine: its presence on GitHub, and its pairing by a code

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#794).*

A machine's station (`runtime/src/station/main.ts`, a single process for all its projects)
has **no direct link** with the chef's app: it opens no port, and the app never reaches it.
Everything goes through **GitHub**, where it writes its state — in a **secret gist** of the account
of the machine's `gh`, which must be the chef's (`runtime/src/appairage/`).

- **On first start**, it creates its gist, publishes there the **fingerprint** of a fresh code — never the
  code itself —, and shows the code in its service log:
  `brigade: station to pair — type this code in the app: 7KQ2-M9XD (valid until 14:32)`.
  Eight characters of the Crockford alphabet (no I, L, O or U), valid for a quarter of an hour; once it has expired,
  it draws another and says so, and the old fingerprint stays published as expired — the app
  then says "expired", not "unknown".
- **The chef types the code in the app** ("All projects", [docs/app.md](../app.md)): the app finds the
  gist that publishes this fingerprint and writes `brigade-appairage.json` there. The station reads it there at its
  next sign of life, and shows no more code (`brigade: station paired with the app`).
- **Every minute**, it checks whether its state has changed (without calling GitHub), and rewrites
  `brigade-station.json` — its name, its machine and cores, its version, the projects it serves,
  its last sign of life — only on change, or as a heartbeat every 5 minutes. Two writes, including
  the one the station requests after a project is written, are at least
  60 s apart: a request that comes too soon is held back, then written when due. **Stopped** (SIGTERM), it
  writes the time of its stop there at once — the only write that the 60 s gap does not hold
  back: the final state is not lost. It publishes `cadenceMs` = 285 s; the app says it is offline
  after 2 × `cadenceMs` + 30 s, that is 10 min at most (`app/src/stations/stations.ts`).
- **Its cores** (`coeurs`, those seen by `os.availableParallelism()`): the app derives from them the number of
  cooks it proposes when the chef entrusts a project to this station (#1107) — the very rule of the
  default cap, `max(1, ⌊(cores − 2) / 2⌋)` (#1079, ["Several cooks at once"](station.md)). An
  older station does not publish them: the app then proposes 2, and says so.
- **Its failures go there too** (`appairage/etats.ts`, #798): `miseAJour`, its last update
  when it failed and rolled back (target version, restored version, the time,
  and whether the rollback failed too — read from `BRIGADE_MISE_A_JOUR_DIR`), and `connexionMax`,
  the state of its Max connection and since when. Neither the reason for a failure, nor the reason for a loss,
  nor an action: the app turns each into a line and a button ([docs/app.md](../app.md)). A read
  that throws does not deprive the station of its sign of life: it then publishes these two fields as null.
- What it keeps from one run to the next — its gist, its code, its pairing — is in
  `<BRIGADE_STATION_DIR>/appairage.json`. **A deleted gist** on GitHub resets it to zero: a
  fresh gist, a fresh code, a pairing to redo. **GitHub silent**: the outage is reported once,
  so is its return, and it retries every minute.

Three settings, all optional: `BRIGADE_GH_BIN` (the machine's `gh`, `gh` by default),
`BRIGADE_STATION_NOM` (its name on the home — by default, the machine's), and
`BRIGADE_STATION_VERSION` (the version it announces — set by its package; by default,
the fingerprint of its code, `code 1a2b3c4d5e6f`).

**The detection delay** for a hard stop (the station killed without warning) is therefore between 5 and
10 min: its last sign of life is at most 5 min old, at the heartbeat, and the app says it is offline
2 × 285 s + 30 s after that sign.

## The GitHub call budget, and the limit wait

*Code: `runtime/src/limite-github.ts` (#873, #874).*

Every call by the station and its projects to GitHub — the issue polling (`github.ts`), the
gist channel (`appairage/canal.ts`) — takes a token from the budget before `gh` leaves.

- **The budget**: **2,500 calls per sliding hour**, half the account's limit
  (5,000 per hour). A refused call does not leave and is not counted; the caller fails as on
  a GitHub outage, and its next turn catches up. The message says when the next call
  frees up: `GitHub budget exhausted: 2500 calls over the sliding hour, call refused — the next one
  frees up in N s`.
- **Shared, not split.** The counter is a SQLite database in the station's directory,
  `<BRIGADE_STATION_DIR>/appels-github/compteur.db`. The station and each of its projects hold it
  together, like a runtime or a command launched with its environment: a transaction decides
  between two processes that take the last call at the same instant. A process outside any station
  (the dev workstation, a test) counts alone, in memory, under the same budget.
- **More than three projects**: nothing to tune. The budget is not split between projects: a
  project that polls a lot takes what another does not spend, and the cap holds whatever
  their number. What grows with projects is consumption: each adds its polls
  to the same account.
- **Tuning it**: there is **no environment variable**. The cap is the constant
  `BUDGET_PAR_HEURE` in `runtime/src/limite-github.ts` (the window, `FENETRE_MS`, is one hour);
  it is changed in the code, and checked with the tests in `runtime/test/limite-github.test.ts`.
- **The hourly line**: once an hour, from the station's start, its service log
  writes `brigade: N GitHub calls over the past hour`, N being the count for the last
  hour, all processes together. If reading the counter fails, the line says so instead:
  `brigade: GitHub calls of the past hour not counted — <error>`.
- **GitHub's limit reached** (its 429, or its 403 "rate limit") is not a refusal like
  any other: a 403 on a forbidden merge, for instance, stays a refusal. The station then stops all calls
  and sets a pause on the counter, shared by all its processes, until the end of the window.
  It reads it in `retry-after`, otherwise `x-ratelimit-reset`, otherwise `gh api rate_limit`, otherwise 60 s.
  During the pause, no call leaves and nothing is counted. The service log says so
  once: `brigade: station — GitHub has reached its call limit: no call leaves before
  the end of the window, then they resume on their own`.
- **What the chef sees.** During the pause, `status` writes a head line
  `github     GitHub is rate-limiting calls, back around HH:MM` (in French before #940), and `facts` carries `limiteGithub` (the resume
  instant, in ISO; absent outside a limit). Both read the pause on the counter, read-only,
  through `BRIGADE_STATION_DIR`: ssh does not depend on GitHub, the queue stays readable. The text
  of `gh` never appears there, and the line drops on its own at the end of the pause. The app shows it as
  a line of each project's alert band — in the chef's local time: taken from `facts`, or
  from its own limit error when that is what GitHub refuses.
- **The resume** is automatic: at the end of the pause, calls resume with no action. During
  the wait, the station does not write its state to GitHub, and the app says it is offline after
  2 × `cadenceMs` + 30 s, the time for the window to close.

## Adding a project to a station from the app, without a terminal

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#795).*

A project is just a line of the station's configuration. The chef adds it from the app
([docs/app.md](../app.md), "Add a project to your stations"); the app writes its request in the gist
of each station chosen, and the station reads it there — still with no direct link
(`runtime/src/projets/`).

- **What the app writes**: `brigade-projets.json` — per project, its name (taken from the repo), its repo,
  its integration branch, whether this station is the **primary** one (the one that runs its
  manager and its pass), its cook cap and the manager and reviewer calibration, chosen by
  the chef in the flow.
- **Every thirty seconds** (or on `SIGHUP`), a paired station rereads this request. For
  each project it is the primary for:
  1. **its GitHub Apps** (`BRIGADE_GITHUB_APPS_DIR`, if set) must be installed on the
     repo; otherwise it publishes, for each App, the page where the chef installs it in one click
     (`https://github.com/apps/<app>/installations/new`), and waits. Without Apps, it acts under the
     account of its `gh`: nothing to authorize;
  2. it **clones** the repo through its `gh` (`gh repo clone`) into the station's workshop:
     `<BRIGADE_STATION_DIR>/clones/<project>` on a server, `~/.local/share/brigade/station/clones/<project>`
     on the chef's computer, whose station lives under `~/.config/brigade`, which no cook reads
     ("A local kitchen", [`station-distante.md`](station-distante.md));
  3. it **checks that it can fetch from the repo and push to it**, through the machine's git, on the
     `origin` remote of its clone — the one its worktrees and cooks will use: `git ls-remote`
     of the integration branch, then `git push --dry-run`, which authenticates like a real push
     without sending anything (`runtime/src/projets/acces.ts`, *ticket #1117*). `gh repo clone` can
     succeed where git will fail afterwards: gh lends its credentials to the clone, not to the fetches that
     follow. **Refused**, the project is not prepared — no decisions, no preparation ticket, no
     line — and the tracking carries the blocked access: what is refused, why in one sentence, and the action
     that lifts it (see "The blocked access" below). **Unreachable** (network, no answer within
     sixty seconds), it is not a refusal: the tracking says `en-preparation`. In both cases, the
     station rechecks at every cadence and serves the project as soon as access passes, without restarting;
  4. it **writes to the project's log** the decisions of the flow, under the chef's name —
     `BRIGADE_STATIONS` (`<station>/claude:<cooks>:code+raisonnement`), the manager and
     reviewer calibration —, only those not already there: a decision changed since is not
     overwritten;
  5. it **opens the project's first ticket on GitHub**, "Prepare the repo" — see below;
  6. it writes its **line** (`<project> <repo> <branch>`) in its configuration, in a block
     it keeps alone, between two comments — lines written by hand, outside the block, are
     never touched; a project that already has a hand-written line there keeps it, and the tracking says so.
     It rereads its configuration at once and publishes its presence: the project is in its list on
     the home ("1 project").
- **What it says about it**: `brigade-projets-suivi.json`, rewritten when it changes — per project, `servi`
  (and since when), `a-autoriser` (with its pages), `en-preparation`, `refuse` (and why: clone
  failed, repo access refused, hand-written line, station refusal) or `secondaire` — a `servi`
  project whose kitchen no longer prepares a worktree also carries `worktree` (see "The worktree
  that does not prepare" below); and, next to the list, the **onboarding**
  of each project it is the primary for — see below.
- **Removed from the app**, the project leaves the request: the station removes its line from the block and no longer
  serves it. Its state and its clone stay on the machine.
- **A station that is not the primary** for a project writes no line for it and says it
  `secondaire`: having a secondary station cook will come with the desk station (#797).

### The blocked access

*Ticket #1117.* When the check of step 3 is refused, the project's line in
`brigade-projets-suivi.json` says `refuse` and carries one more field, `acces` — absent as long as nothing
is refused:

```json
"acces": {
  "bloque": "fetch",
  "raison": "box cannot fetch from benomite/parade: git has no credentials for https://github.com and no credential helper to ask for them (git: could not read Username for 'https://github.com': terminal prompts disabled).",
  "geste": "Run `gh auth setup-git` on box, under the account that runs it: git then takes its credentials from gh."
}
```

- `bloque`: `fetch` (the station cannot fetch from the repo) or `push` (it fetches from it, but
  cannot push to it — the reason says so: "can fetch from … but cannot push to it");
- `raison`: one sentence, in English — the app shows it —, ending with git's line;
- `geste`: what the chef does to lift the refusal, in one sentence. `dit` carries both, the reason
  then the action.

The action depends on what git said:

| git says | action |
|---|---|
| it has no credentials, on an https remote with no credential helper | `gh auth setup-git` |
| it has no credentials, although a credential helper is set | `gh auth login`, then `gh auth setup-git` |
| `403`, `Permission to … denied`, read-only key | give the station's account read access (`fetch`) or write access (`push`), at `https://github.com/<repo>/settings/access` |
| `Repository not found`, repo missing | `gh repo view <repo>` under the station's account, and give it access |
| `Permission denied (publickey)` | add the account's ssh key to GitHub (`gh ssh-key add <key>.pub`) |
| `Host key verification failed` | `ssh -T <host>` once, and accept its host key |
| anything else | the git command to rerun on the station to see what it says |

The service log says it once (`brigade: station — <project> is not served, its repo
refuses the fetch: … Action: …`), and the **onboarding** shows it at the `depot` step, current, with the
action "On <station>, under the account that runs it.".

### The worktree that does not prepare

*Ticket #1118.* The access checked before serving a project can fail afterwards — a credential
helper removed, a right revoked —, and a worktree can fail to prepare for another reason
(disk, conflict). The ticket is then 86 (`worktree-failed`) and proposed again ten minutes later;
the project's line, still `servi`, carries the last failure, read from its kitchen's log
(`runtime/src/echec-du-worktree.ts`) — absent as long as none fails:

```json
"worktree": {
  "ticket": 433,
  "raison": "git fetch : fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  "prochainEssai": "2026-10-20T10:59:00.000Z",
  "acces": { "bloque": "fetch", "raison": "box cannot fetch from …", "geste": "Run `gh auth setup-git` on box, …" }
}
```

- `raison`: git's error, as it said it — or, when the attempt ran into the access rechecked
  before fetching anything, the reason for the refusal;
- `prochainEssai`: the time of the next attempt (ISO);
- `acces`: present when the station cannot fetch from the repo or push to it — the same shape as
  the blocked access above, with its action.

It holds until the next attempt: if that fails, it replaces it, with its new time; if it succeeds, it
disappears. Each attempt rechecks access first: once the action is done, the station restarts on its own at its
next attempt, without restarting the app.

**The refusal, told to the chef** (#1177): whatever the cause, a `refuse` project also carries `refus` —
`{ status: "refused", code, message, action }`. `code` is stable (`sandbox-unusable`, `door-not-open`,
`clone-failed`, `fetch-blocked`, `push-blocked`, `already-served`… ; the list is authoritative in
`runtime/src/projets/refus.ts`), `message` a sentence for the chef, `action` what they can do. The
field disappears as soon as the project is served. The `en-service` file keeps the raw text of the error.

### The first ticket: prepare the repo

*Ticket #796.* Before writing the line of a project added from the app, the station opens on its
repo, through its `gh`, the issue "Prepare the repo: gates, worktree setup, allowed sites"
(`runtime/src/preparation-depot/`). It carries `fire`, `model:opus` and `effort:high`: it enters
the rail like any ticket, and a cook cooks it. Its body tells the cook:

- **what to deliver**: `.claude/brigade/gates.sh`, `.claude/brigade/worktree-setup.sh` and
  `.claude/brigade/reseau` (the sites the project is allowed to reach), each with its contract
  and what the integration branch already carries of it ("absent: to write", "already on `main`: to
  test");
- **where to test it**: on the station that cooks it — the one that will serve the project —, not on a
  dev workstation: the setup runs in its worktree, the gates pass there;
- **the observable criteria**: green gates on the station, setup run in a fresh worktree,
  site list present, and, in the report, what was run and what came out of it.

Its number is kept in the project's state (`<state>/preparation-depot.json`): the station opens it
only once, even if the project is removed then added again; created without having been able to be noted, it
finds it again among the open issues by its marker (`<!-- brigade:preparation-depot -->`), if it was
placed by someone with control of the repo. GitHub silent: the line is not written, the tracking
says `en-preparation`, and the station retries at the next cadence.

**As long as it is not served, the project's kitchen takes only it** — the same restriction as
that of a red base, which lets only its repair leave, and which remote stations
undergo like local ones. The service log says it once: `the rail awaits #<n>
(prepare the repo) — no other ticket leaves before its merge`. **Once served, the rail
starts on its own** (`#<n> (prepare the repo) is served — the rail starts`). Closed by the chef or
gone, it also frees the rail; with its `fire` label removed, it still holds it. A project written
by hand in the configuration, or added before this ticket, has no preparation ticket: its
rail is the usual one.

The acceptance test (`runtime/test/0-en-premier/recette.test.ts`) measures, on a real test station, the time
between the opening of the flow and the project published in the station's list: the spec bounds it to
ten minutes; the station takes at most its cadence, thirty seconds, plus the clone.

### The onboarding: where a new project stands

*Ticket #1110.* Between "project added" and "first ticket served", the station computes where
each project it is the primary for stands (`runtime/src/onboarding/`), and publishes it in its tracking,
under `onboarding`, by project name — that is where the app reads it. A project taken over from another
station (`reprise`) has none: it is not new. The state is computed from what the station already knows
— its tracking of the project, its clone, the noted preparation ticket — and from the project's log, read
read-only; nothing is written for it.

- **Four steps, in order** (`etapes`): `depot` (brigade's Apps authorized on the
  repo, its clone, and the station's access to the repo for reading and writing — if refused, its action
  is that of the blocked access), `machine` (the station that cooks it, its kitchen open), `preparation` (the
  "Prepare the repo" ticket, merged), `premier-ticket` (a chef's ticket on the rail). Each
  carries its `titre`, its `etat` — `faite`, `courante` or `a-venir` —, a sentence in English
  (`dit`), and, if it is the current one and awaits the chef, its `geste`: `quoi`, `ou`, and the
  `liens` where to do it (the Apps' authorization pages, the preparation PR, the page of a
  new issue). `courante` names the first one that is not done.
- **The preparation** (`preparation`): the ticket's number, its link, and its `etat` — `en-cours`
  (on the rail, or in a cook's hands), `en-echec` (set aside: `raison`, in one sentence,
  and `prochainEssai`, the time at which it restarts on its own, null if it does not restart on its own), `a-relire`
  (at the pass, with its `pr`; stopped for lack of a grant or escalated to the chef, the action is to review it
  and merge it), `suspendu` (its `fire` label removed), `faite`, or `abandonne` (closed without merge:
  the rail no longer awaits it). Null as long as the ticket is not open.
- **Without a sandbox** (`sansBacASable`): true if the project's kitchen noted in the log that its
  cooks run without a sandbox (`isolation.configured`, `sandbox: null`); null as long as it has
  noted nothing.
- **Decision awaited** (`decisionAttendue`): true as long as the project's station cooks without a
  sandbox and the chef has not decided for it. Nothing leaves for the project — not even the preparation
  ticket: the rail is held (`onboarding/attente.ts`), and the `machine` step is the
  current one, its action offers both choices: continue without a sandbox on this machine, or
  choose another station. The decision (`decision-sans-bac-a-sable.json`, in the project's
  state) carries the station's name and is valid only for it: the hold is lifted at the
  next rail take, and a project moved to another station asks for it again if the new one has no
  sandbox either. A configured or unknown sandbox never holds.
- **Ready**: the first three steps done, the first ticket can be placed — `etat` is
  `pret`, and `termine` is true: the onboarding is over. A project that was already serving tickets
  before the preparation ticket existed is ready from the start.

The "no station chosen" case is also computed (the `machine` step current, the action of choosing
a station in the app); but a station only publishes the projects it is asked for: this case,
only the app sees.
