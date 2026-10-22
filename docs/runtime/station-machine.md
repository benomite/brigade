## One station per machine: its presence on GitHub, and its pairing by a code

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#794).*

A machine's station (`runtime/src/station/main.ts`, a single process for all its projects)
has **no direct link** with the chef's app: it opens no port, and the app never reaches it.
Everything goes through **GitHub**, where it writes its state — in a **secret gist** of the account
of the machine's `gh`, which must be the chef's (`runtime/src/appairage/`).

The station's service log lines (the ones it prints itself) are written in French by the runtime;
each one quoted below stays French until the runtime is translated.

- **On first start**, it creates its gist, publishes in it the **fingerprint** of a fresh code —
  never the code itself —, and shows the code in its service log:
  `brigade : station à appairer — tape ce code dans l'app : 7KQ2-M9XD (valable jusqu'à 14:32)`.
  Eight characters of the Crockford alphabet (no I, no L, no O, no U), valid for a quarter of an
  hour; once expired, it draws another and says so, and the fingerprint of the old one stays
  published as expired — the app then says "expired", not "unknown".
- **The chef types the code in the app** ("All projects", [docs/app.md](../app.md)): the app finds
  the gist that publishes this fingerprint and writes `brigade-appairage.json` in it. The station
  reads it there at its next heartbeat, and no longer shows a code
  (`brigade : station appairée à l'app` — the runtime appends the time and ` — elle n'affiche plus de code`).
- **Every minute**, it checks whether its state has changed (with no GitHub call), and rewrites
  `brigade-station.json` — its name, its machine and cores, its version, the projects it serves,
  its last heartbeat — only on a change, or as a beat every 5 minutes. Two writes, including the one
  the station asks for after a project writes, are at least 60 s apart: a request that comes too
  soon is held back, then written when due. **Stopped** (SIGTERM), it writes the time of its stop
  there right away — the only write the 60 s gap does not hold back: the final state is not lost.
  It publishes `cadenceMs` = 285 s; the app says it is offline after 2 × `cadenceMs` + 30 s, that
  is 10 min at most (`app/src/stations/stations.ts`).
- **Its cores** (`coeurs`, the ones `os.availableParallelism()` sees): the app derives from them
  the number of cooks it proposes when the chef entrusts a project to this station (#1107) — the very
  rule of the default cap, `max(1, ⌊(cores − 2) / 2⌋)` (#1079,
  [“Several cooks at once”](station.md#several-cooks-at-once)). An older station does not publish
  them: the app then proposes 2, and says so.
- **Its failures go there too** (`appairage/etats.ts`, #798): `miseAJour`, its last update when it
  failed and it rolled back (target version, restored version, the time, and whether the rollback
  failed too — read from `BRIGADE_MISE_A_JOUR_DIR`), and `connexionMax`, the state of its Max
  connection and since when. Neither the reason for a failure, nor the reason for a loss, nor an
  action: the app makes each one a line and a button ([docs/app.md](../app.md)). A read that throws
  does not deprive the station of its heartbeat: it then publishes these two fields as null.
- What it keeps from one run to the next — its gist, its code, its pairing — is in
  `<BRIGADE_STATION_DIR>/appairage.json`. **A deleted gist** on GitHub resets it to zero: a fresh
  gist, a fresh code, a pairing to redo. **GitHub silent**: the outage is said once, its end too,
  and it retries every minute.

Three settings, all optional: `BRIGADE_GH_BIN` (the machine's `gh`, `gh` by default),
`BRIGADE_STATION_NOM` (its name on the home — by default, the machine's), and
`BRIGADE_STATION_VERSION` (the version it announces — set by its package; by default, the
fingerprint of its code, `code 1a2b3c4d5e6f`). These variable names stay French until the runtime is
translated.

**The detection delay** of a brutal stop (the station killed without warning) is therefore read
between 5 and 10 min: its last heartbeat is 5 min old at most, at the beat, and the app says it is
offline 2 × 285 s + 30 s after that heartbeat.

## The budget of calls to GitHub, and waiting out the limit

*Code: `runtime/src/limite-github.ts` (#873, #874).*

Every call by the station and its projects to GitHub — the polling of the issues (`github.ts`), the
gist channel (`appairage/canal.ts`) — takes a token from the budget before `gh` leaves.

- **The budget**: **2,500 calls per sliding hour**, half of the account's limit (5,000 per hour). A
  refused call does not leave and is not counted; the caller fails as on a GitHub outage, and its
  next turn catches up. The message says when the next call frees up: `budget GitHub épuisé : 2500
  appels sur l'heure glissante, appel refusé — le prochain se libère dans N s` (French until the
  runtime is translated).
- **Shared, not split.** The counter is a SQLite database in the station's directory,
  `<BRIGADE_STATION_DIR>/appels-github/compteur.db`. The station and each of its projects hold it
  together, like a runtime or a command launched with its environment: a transaction decides between
  two processes that take the last call at the same instant. A process outside any station (the dev
  workstation, a test) counts alone, in memory, under the same budget.
- **More than three projects**: nothing to tune. The budget is not divided among the projects: a
  project that polls a lot takes what another does not spend, and the cap holds whatever their
  number. What grows with the projects is the consumption: each one adds its polls to the same
  account.
- **Tuning it**: there is **no environment variable**. The cap is the constant `BUDGET_PAR_HEURE` of
  `runtime/src/limite-github.ts` (the window, `FENETRE_MS`, is one hour); it is changed in the code,
  and checked with the tests of `runtime/test/limite-github.test.ts`.
- **The hourly line**: once an hour, from the station's start, its service log writes
  `brigade : N appels GitHub sur l'heure écoulée`, N being the count of the last hour, all processes
  together. If reading the counter fails, the line says so instead:
  `brigade : appels GitHub de l'heure écoulée non comptés — <erreur>`. Both lines stay French until
  the runtime is translated.
- **GitHub's limit reached** (its 429, or its 403 "rate limit") is not a refusal like any other: a
  403 on a forbidden merge, for its part, stays a refusal. The station then stops every call and
  sets a pause on the counter, shared by all its processes, until the end of the window. It reads it
  in `retry-after`, otherwise `x-ratelimit-reset`, otherwise `gh api rate_limit`, otherwise 60 s.
  During the pause no call leaves and nothing is counted. The service log says it once:
  `brigade : station — GitHub a atteint sa limite d'appels : plus aucun appel ne part avant la fin de la fenêtre, puis ils reprennent seuls`
  (French until the runtime is translated).
- **What the chef sees of it.** During the pause, `status` writes a head line
  `github     GitHub is rate-limiting calls, back around HH:MM` (in French before #940), and `faits`
  carries `limiteGithub` (the instant of resumption, in ISO; absent outside a limit). Both read the
  pause on the counter, read-only, through `BRIGADE_STATION_DIR`: ssh does not depend on GitHub, the
  queue stays readable. The text of `gh` never appears there, and the line falls away by itself at
  the end of the pause. The app shows it as one line of each project's alert band — in the chef's
  local time: taken from `faits`, or from its own limit error when it is the app that GitHub
  refuses.
- **The resumption** is automatic: at the end of the pause, calls resume with no action. During the
  wait, the station does not write its state on GitHub, and the app says it is offline after
  2 × `cadenceMs` + 30 s, the time for the window to close.

## Adding a project to a station from the app, without a terminal

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#795).*

A project is only a line of the station's configuration. The chef adds it from the app
([docs/app.md](../app.md), "Add a project to your stations, without a terminal"); the app writes its
request in the gist of each station he chose, and the station reads it there — still with no direct
link (`runtime/src/projets/`).

- **What the app writes**: `brigade-projets.json` — per project, its name (taken from the
  repository), its repository, its integration base, whether this station is its **main** one (the
  one that runs its manager and its pass), its cap of cooks and the manager and reviewer
  calibration, chosen by the chef in the flow.
- **Every thirty seconds** (or on `SIGHUP`), a paired station rereads this request. For each
  project of which it is the main station:
  1. **its GitHub Apps** (`BRIGADE_GITHUB_APPS_DIR`, if set) must be installed on the repository;
     otherwise it publishes, for each App, the page where the chef installs it in one click
     (`https://github.com/apps/<app>/installations/new`), and waits. Without Apps, it acts under
     its `gh` account: nothing to authorize;
  2. it **clones** the repository through its `gh` (`gh repo clone`) into the station's workshop:
     `<BRIGADE_STATION_DIR>/clones/<projet>` on a server, `~/.local/share/brigade/station/clones/<projet>`
     on the chef's computer, whose station lives under `~/.config/brigade`, which no cook reads
     ("A local kitchen: all its cooks in the sandbox" in [`station-distante.md`](station-distante.md)).
     It always clones **over HTTPS, with its own token**: it names the repository by its address
     (`https://github.com/<repository>.git`), so the git protocol set for the account in `gh`
     (`git_protocol ssh`) does not apply (*ticket #1390*). **Failed**, the tracking says why and what
     to do (see "The failed clone" below), and the station retries at every beat;
  3. it **checks that it can fetch the repository and push to it**, through the machine's git, on
     the `origin` remote of its clone — the one its worktrees and its cooks will use: `git ls-remote`
     of the integration base, then `git push --dry-run`, which authenticates like a real push without
     sending anything (`runtime/src/projets/acces.ts`, *ticket #1117*). `gh repo clone` can succeed
     where git will fail afterwards: gh lends its credentials to the clone, not to the fetches that
     follow. **Refused**, the project is not prepared — no decisions, no preparation ticket, no
     line — and the tracking carries the blocked access: what is refused, why in one sentence, and
     the action that lifts it (see "The blocked access" below). **Unreachable** (network, no answer
     within sixty seconds), it is not a refusal: the tracking says `en-preparation`. In both cases,
     the station rechecks at every beat and serves the project as soon as access passes, without a
     restart;
  4. it **writes to the project's log** the decisions of the flow, under the chef's name —
     `BRIGADE_STATIONS` (`<station>/claude:<cooks>:code+raisonnement`), the manager and reviewer
     calibration —, only those that are not already there: a decision changed since is not
     overwritten;
  5. it **opens on GitHub the project's first ticket**, "Préparer le dépôt" (title kept French, see
     below) — see further down;
  6. it writes its **line** (`<projet> <dépôt> <branche>`) in its configuration, in a block it holds
     alone, between two comments — the lines written by hand, outside the block, are never
     touched; a project that already has a hand-written line there keeps it, and the tracking says
     so. It rereads its configuration at once and publishes its presence: the project is in its list
     on the home ("1 project").
- **What it says about it**: `brigade-projets-suivi.json`, rewritten when it changes — per project,
  `servi` (and since when), `a-autoriser` (with its pages), `en-preparation`, `refuse` (and why:
  failed clone, refused repository access, hand-written line, station refusal) or `secondaire` — a
  `servi` project whose kitchen no longer prepares a worktree also carries `worktree` (see "The
  worktree that does not prepare" below); and, next to the list, the **onboarding** of each project
  of which it is the main station — see further down. The tracking's keys and status words are
  written in French by the runtime; they stay French until it is translated.
- **Removed from the app**, the project leaves the request: the station removes its line from the
  block and no longer serves it. Its state and its clone stay on the machine.
- **A station that is not the main one** of a project writes no line for it and says it
  `secondaire`. The project's kitchen lets a second station cook alongside the first once it is
  declared `distante+ensemble` and pulls its work ("A second station of the project, which cooks
  alongside the first" in [`station-distante.md`](station-distante.md)); a `secondaire` station,
  paired only through its gist, is not declared that way and pulls nothing yet.

### The blocked access

*Ticket #1117.* When the check of step 3 is refused, the project's line in
`brigade-projets-suivi.json` says `refuse` and carries one more field, `acces` — absent as long as
nothing is refused:

```json
"acces": {
  "bloque": "fetch",
  "raison": "box cannot fetch from benomite/parade: git has no credentials for https://github.com and no credential helper to ask for them (git: could not read Username for 'https://github.com': terminal prompts disabled).",
  "geste": "Run `gh auth setup-git` on box, under the account that runs it: git then takes its credentials from gh."
}
```

The keys (`acces`, `bloque`, `raison`, `geste`) stay French until the runtime is translated; the two
sentences are written in English, and the app shows them as they are.

- `bloque`: `fetch` (the station cannot fetch the repository) or `push` (it fetches it, but cannot
  push to it — the reason says so: "can fetch from … but cannot push to it");
- `raison`: one sentence, in English — it is the app that shows it —, ending with git's line;
- `geste`: what the chef does to lift the refusal, in one sentence. `dit` carries both, the reason
  then the action.

The action depends on what git said:

| git says | action |
|---|---|
| it has no credentials, on an https remote with no credential helper | `gh auth setup-git` |
| it has no credentials, although a credential helper is set | `gh auth login`, then `gh auth setup-git` |
| `403`, `Permission to … denied`, read-only key | give the station's account read access (`fetch`) or write access (`push`), at `https://github.com/<repository>/settings/access` |
| `Repository not found`, repository absent | `gh repo view <repository>` under the station's account, and give it access |
| `Permission denied (publickey)` | add the account's ssh key to GitHub (`gh ssh-key add <key>.pub`) |
| `Host key verification failed` | `ssh -T <host>` once, and accept its host key |
| anything else | the git command to rerun on the station to see what it says |

The service log says it once (`brigade : station — <projet> n'est pas servi, son dépôt
refuse le fetch : … Geste : …`, French until the runtime is translated), and the **onboarding**
shows it at the `depot` step, current, with the action "On <station>, under the account that runs
it.".

### The failed clone

*Ticket #1390* (`runtime/src/projets/echec-du-clone.ts`). When the clone of step 2 fails, the
project's line says `refuse` (`refus.code`: `clone-failed`) and carries `clone` — absent as long as
the clone does not fail:

```json
"clone": {
  "cause": "token-excludes-repository",
  "raison": "The token used by parade-box does not include BOBL-tech/mirrorscreen, so GitHub answers that it does not exist and box cannot clone it.",
  "geste": "Add BOBL-tech/mirrorscreen to the repositories of the token used by parade-box (its resource owner must be BOBL-tech): edit the token, and select BOBL-tech/mirrorscreen under “Repository access”.",
  "ou": "On GitHub, in the fine-grained tokens of the account.",
  "liens": ["https://github.com/settings/personal-access-tokens"],
  "compte": "parade-box",
  "detail": "remote: Repository not found.\nfatal: repository 'https://github.com/BOBL-tech/mirrorscreen.git/' not found\nfailed to run git: exit status 128",
  "reessaieToutesLes": 30
}
```

- `raison` and `geste`: one sentence each, in English, with no git output; `dit` carries both;
- `ou`: where the action is done; `liens`: the GitHub pages where to do it;
- `compte`: the GitHub account of the station's `gh` (`gh api user`), null if it could not be read;
- `detail`: what gh and git said, as is — the app shows it only behind a "details" link;
- `reessaieToutesLes`: the seconds between two attempts (the beat). A gap, not an instant: the
  tracking is rewritten only when it changes.

GitHub answers "Repository not found" both for a repository that does not exist and for one the
account cannot see. After a failed clone, the station therefore asks its `gh` for its account, the
type of its token (read on its prefix — the token itself is kept nowhere: `github_pat_` is a
fine-grained token, which covers only the repositories chosen for it) and whether the repository's
owner exists (`gh api users/<owner>`). The cause follows:

| what gh and git say | `cause` | action |
|---|---|---|
| host unresolved, connection refused or timed out, `5xx` | `unreachable` | nothing if GitHub is down; otherwise check the station's network |
| `Host key verification failed`, `Permission denied (publickey)` | `ssh-rewrite` | remove the `url.<…>.insteadOf` setting that sends GitHub to ssh |
| SAML SSO | `sso-required` | authorize the token for the organization's single sign-on |
| no credentials, `401` | `not-logged-in` | `gh auth login` on the station |
| `403`, `Permission to … denied` | `no-read-access` | give the account read access, at `https://github.com/<repository>/settings/access` |
| not found, the owner does not exist | `repository-missing` | check the repository's name in the app |
| not found, a fine-grained token | `token-excludes-repository` | add the repository to the token, at `https://github.com/settings/personal-access-tokens` |
| not found, otherwise | `account-cannot-see` | invite the account as a collaborator, at `https://github.com/<repository>/settings/access` |
| anything else | `unknown` | the details say what git answered |

The service log keeps git's `fatal:` line (`brigade : station — <projet> n'est pas cloné, la station
réessaie : <raison> — clone de <dépôt> en échec — <ligne de git>`, French until the runtime is
translated). The **onboarding** shows the failure at the `depot` step, current: the reason, when the
station tries again, and the action with its page. Once the action is done, the next attempt clones,
the field disappears, and the step goes green by itself.

### The worktree that does not prepare

*Ticket #1118.* The access checked before serving a project can fail afterwards — a credential
helper removed, a right revoked —, and a worktree can fail to prepare for another reason (disk,
conflict). The ticket is then 86 (`worktree-failed`) and proposed again ten minutes later; the
project's line, still `servi`, carries the last failure, read in its kitchen's log
(`runtime/src/echec-du-worktree.ts`) — absent as long as none fails:

```json
"worktree": {
  "ticket": 433,
  "raison": "git fetch : fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  "prochainEssai": "2026-10-20T10:59:00.000Z",
  "acces": { "bloque": "fetch", "raison": "box cannot fetch from …", "geste": "Run `gh auth setup-git` on box, …" }
}
```

- `raison`: git's error, as it said it — or, when the attempt stumbled on the access rechecked
  before fetching anything, the reason for the refusal;
- `prochainEssai`: the time of the next attempt (ISO);
- `acces`: present when the station cannot fetch the repository or push to it — the same shape as
  the blocked access above, with its action.

It holds until the next attempt: failed, that one replaces it, with its new time; succeeded, it
disappears. Each attempt rechecks access first: once the action is done, the station restarts by
itself at its next attempt, without restarting the app.

**The refusal, told to the chef** (#1177): whatever the cause, a `refuse` project also carries
`refus` — `{ status: "refused", code, message, action }`. `code` is stable (`sandbox-unusable`,
`door-not-open`, `clone-failed`, `fetch-blocked`, `push-blocked`, `already-served`… ; the list is
authoritative in `runtime/src/projets/refus.ts`), `message` a sentence for the chef, `action` what
he can do. The field disappears as soon as the project is served. The `en-service` file keeps the
raw text of the error.

**The refusal's remedy** (#1203): each refusal also carries either `remedy` — `{ id, description,
destructive }`, the action that a button of the app has the station perform: what it will do, in one
sentence, and whether it removes or erases something (the app then asks for confirmation) —, or
`noRemedy`, in one sentence, why there is no button. Remedies are entered in a registry
(`runtime/src/remedes/registre.ts`), with the codes they lift: a registered remedy appears in the
refusal, with nothing else to touch. As long as none lifts a code, its reason with no button
(`SANS_REMEDE`) takes its place.

The app asks for a remedy through the station's gist, whether it is the chef's computer or a remote
station (`runtime/src/remedes/distant.ts`). It writes `brigade-remedes.json` —
`{ "brigade": "remedies", "format": 1, "requests": [{ "id", "askedAt", "project", "refusal", "remedy" }] }`
—, the station reads it at its beat, plays each request once through the entry point
(`runtime/src/remedes/executer.ts`), and answers in `brigade-remedes-suivi.json` —
`{ "brigade": "remedies-answers", "format": 1, "a", "answers": [{ "id", "answeredAt", "outcome", … }] }`.
The entry point checks that the refusal still holds and that it does offer this remedy, plays it,
then rereads the project and returns the outcome:

- `lifted`: the refusal is gone;
- `holds`: it holds — `reason`, in one sentence, says why (the action failed, or the station still
  refuses, for the same cause or another), and `refusal` is the refusal as it is now;
- `error`: nothing was played — unknown remedy, a refusal that does not offer this remedy, a refusal
  lifted or changed since. `error` says which.

A request more than ten minutes old is not played; a request already answered is not replayed, even
after a restart of the station. The app removes its request once the answer is read, and the answer
leaves the gist at the next beat.

**The remedy catalog** (#1204, `runtime/src/remedes/catalogue/`): one file per action.
- `proxy-port-set` → `remove-port-setting` (destructive): removes `BRIGADE_PROXY_PORT` from the project's line.
- `hand-written-line` → `remove-hand-written-line` (destructive): removes the hand-written line, never the one of the app's block.
- `configuration-invalid` → `rewrite-project-line` (destructive): erases the line the app wrote; the station rewrites it afresh.
- `clone-missing` → `clone-repository-again`: clones the repository again through the machine's `gh`.
- `sandbox-unusable` → `update-claude`: `claude update`; if the sandbox stays unusable, the refusal holds, with its reason.

The other refusals (`already-served`, `door-not-open`, `clone-failed`, `fetch-blocked`,
`push-blocked`, `decisions-not-written`, `handed-over-elsewhere`, `unexpected`) have no button: each
carries `noRemedy` (`SANS_REMEDE`). `clone-missing` and `sandbox-unusable` are replayed by the
station at every reread, their remedy not acting on the configuration.

### The first ticket: preparing the repository

*Ticket #796.* Before writing the line of a project added from the app, the station opens on its
repository, through its `gh`, the issue "Préparer le dépôt : gates, setup de worktree, sites autorisés"
(`runtime/src/preparation-depot/`) — its title stays French until the runtime is translated. It
carries `fire`, `model:opus` and `effort:high`: it enters the rail like any ticket, and a cook cooks
it. Its body tells the cook:

- **what to deliver**: `.claude/brigade/gates.sh`, `.claude/brigade/worktree-setup.sh` and
  `.claude/brigade/reseau` (the sites the project is allowed to reach), each with its contract and
  what the integration base already carries of it ("absent : à écrire", "déjà sur `main` : à
  éprouver" — written in French by the runtime);
- **where to prove it**: on the station that cooks it — the one that will serve the project —, not
  on a dev workstation: the setup runs in its worktree, the gates pass there;
- **the observable criteria**: gates green on the station, setup run in a fresh worktree, site list
  present, and, in the report, what was run and what came out of it.

Its number is kept in the project's state (`<état>/preparation-depot.json`): the station opens it
only once, even if the project is removed then added again; created without having been noted, it
finds it again among the open issues by its marker (`<!-- brigade:preparation-depot -->`), if it was
set by someone who has hand on the repository. GitHub silent: the line is not written, the tracking
says `en-preparation`, and the station retries at the next beat.

**As long as it is not served, the project's kitchen takes only it** — the same restriction as that
of a red base, which lets only its repair leave, and which remote stations undergo like the local
ones. The service log says it once: `brigade : le rail attend #<n> (préparer le dépôt) — aucun autre ticket ne part avant son merge`.
**Once served, the rail starts by itself** (`brigade : #<n> (préparer le dépôt) est servi — le rail démarre`).
Both lines stay French until the runtime is translated. Closed by the chef or gone, it also frees the
rail; with its `fire` label removed, it still holds it. A project written by hand in the
configuration, or added before this ticket, has no preparation ticket: its rail is the usual one.

The acceptance test (`runtime/test/0-en-premier/recette.test.ts`) measures, on a real test
station, the time between the opening of the flow and the project published in the station's list:
the spec bounds it at ten minutes; the station takes at most its beat, thirty seconds, plus the
clone.

### The onboarding: where a new project stands

*Ticket #1110.* Between "project added" and "first ticket served", the station computes where each
project of which it is the main station stands (`runtime/src/onboarding/`), and publishes it in its
tracking, under `onboarding`, by project name — that is where the app reads it. A project taken over
from another station (`reprise`) has none: it is not new. The state is computed from what the
station already knows — its tracking of the project, its clone, the preparation ticket noted — and
from the project's log, read-only; nothing is written for it.

- **Four steps, in order** (`etapes`): `depot` (the brigade Apps authorized on the repository, its
  clone, and the station's access to the repository for reading and writing — refused, its action
  is that of the blocked access), `machine` (the station that cooks it, its kitchen open),
  `preparation` (the "Préparer le dépôt" ticket, merged), `premier-ticket` (a ticket of the chef's on
  the rail). Each carries its `titre`, its `etat` — `faite`, `courante` or `a-venir` —, a sentence in
  English (`dit`), and, if it is the current one and awaits the chef, its `geste`: `quoi`, `ou`, and
  the `liens` where to do it (the Apps' authorization pages, the preparation PR, the page of a new
  issue). `courante` names the first one that is not done.
- **The preparation** (`preparation`): the ticket's number, its link, and its `etat` — `en-cours`
  (on the rail, or in a cook's hands), `en-echec` (set aside: `raison`, in one sentence, and
  `prochainEssai`, the time at which it leaves again by itself, null if it does not leave by
  itself), `a-relire` (at the pass, with its `pr`; stopped for lack of a grant or escalated to the
  chef, the action is to reread it and merge it), `suspendu` (its `fire` label removed), `faite`,
  or `abandonne` (closed without a merge: the rail no longer waits for it). Null as long as the
  ticket is not open.
- **Without a sandbox** (`sansBacASable`): true if the project's kitchen noted in the log that its
  cooks run without a sandbox (`isolation.configured`, `sandbox: null`); null as long as it has
  noted nothing.
- **Decision awaited** (`decisionAttendue`): true as long as the project's station cooks without a
  sandbox and the chef has not decided for it. Nothing leaves for the project — not even the
  preparation ticket: the rail is held back (`onboarding/attente.ts`), and the `machine` step is the
  current one, its action offering the two choices: continue without a sandbox on this machine, or
  choose another station. The decision (`decision-sans-bac-a-sable.json`, in the project's state)
  carries the station's name and holds only for it: the hold lifts at the next time the rail is
  taken, and a project moved to another station asks for it again if the new one has no sandbox
  either. A configured sandbox, or an unknown one, never holds.
- **Ready**: the first three steps done, the first ticket can be placed — `etat` is `pret`, and
  `termine` is true: the onboarding is over. A project that was already serving tickets before the
  preparation ticket existed is ready from the start.

The "no station chosen" case is also computed (the `machine` step current, the action of choosing a
station in the app); but a station publishes only the projects it is asked for: that case, only the
app sees it.

The onboarding's field names and status words (`etapes`, `etat`, `faite`, `courante`, `a-venir`,
`en-cours`, `en-echec`, `a-relire`, `suspendu`, `abandonne`, `pret`, `termine`…) are written in
French by the runtime and stay French until it is translated.
