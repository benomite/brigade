### A station on another machine

**Every station of a project serves it itself, on GitHub** ([`github-seul.md`](github-seul.md)). A station
that runs elsewhere than the box — `mac/claude`, with the chef's connected Chrome — opens the project's kitchen
in its own process and takes, cooks, reviews and merges tickets like any other, reading and writing only GitHub.
Every station of a project is equal, and nothing passes between stations but GitHub.

```bash
brigade <project> station stations box/claude:30:code,mac/claude:1:chrome-connecté:distante
```

A declaration marked `distante` (also `distante+ordinaires`, `distante+ensemble`; the words stay French) only says
that the station does not run on this machine: the kitchen of this machine opens the GitHub-only turn under the name
of the station that is **not** marked `distante`.

**What is gone (#2061).** The box no longer serves remote stations: no `pull` request, no `remote.asked` /
`remote.answered`, no lease lent from its log, no presence (`station.present` / `station.absent`), no ordinary ticket
lent to the chef's workstation when the box is saturated, no station whose deliveries went through another station's
pass, and no claim relay through the stations' gists and the Kitchen board. Those events may remain in an
old log, unread.

**A station paired through the app** and added to a project opens that project's kitchen on its own computer and
cooks there through GitHub, whatever other stations serve it (#2713): it opens its own kitchen, as each of the others
does, and `brigade-cuisines-rejointes.json` is no longer written.

**What it says when it cannot cook yet.** A station installed from the app and cooking nothing says why on its line
of the home screen, with the gesture: `not reached` (stopped or silent on GitHub: start Brigade on its computer,
button **check again**), `cannot be read` (its page on GitHub: remove it, pair it again with a new code, button
**open its page**), `not added to any project` (button **add a project**).

#### A local kitchen: all its cooks in the sandbox

**A project whose kitchen runs on the chef's Mac** — in the station its app launches
(`runtime/src/station/cuisine.ts`) — **launches every `claude` of its kitchen in Claude Code's
sandbox, without exception**: a ticket's **cook**, the closing pass's **closer**, the **pass's
reviewer**, the **manager's judgement** (`runtime/src/bac-a-sable/local.ts`). A kitchen is local when
its station runs under macOS: the box is never one, and its partition (`bwrap`) guards it.

- **The sandbox configuration** (`runtime/src/bac-a-sable/configuration.ts`),
  written for the directory where the launch works. The network list is `.claude/brigade/reseau` of the
  integration branch, reread at each launch; unreadable, the base alone (Anthropic and GitHub). A
  cook's `--permission-mode bypassPermissions` gives way to `--permission-mode dontAsk --settings
  <the configuration>`; the reviewer and the judgement receive them in front of `--setting-sources`.
- **The project's caches** are named in `BRIGADE_SANDBOX_CACHES` (absolute paths separated by `:`);
  none by default.
- **Where its cooks work: the station's workshop** (*ticket #1176*). The app puts the station under
  `~/.config/brigade/station`, which no cook reads, so the **clone and worktrees** live in the
  workshop, `~/.local/share/brigade/station/clones/<project>` and `…/worktrees/<project>/<run>`
  (`atelierDeLaStation`). A station outside everything a cook must not read, or on a server, keeps
  everything under its directory. The station gives the paths (`BRIGADE_REPO_DIR`,
  `BRIGADE_WORKTREES_DIR`); a line does not set `BRIGADE_WORKTREES_DIR`.
- **A project served before moves into the workshop on its own** (`runtime/src/station/atelier.ts`):
  clone and worktrees are renamed as they are, then `git worktree repair`; nothing is copied or
  removed. What cannot be moved stays where it is, and the kitchen opens all the same. The service log
  says both (`déménagé dans l'atelier de la station — …`, `pas déménagé dans l'atelier de la station
  — …`; still French).
- **Without a sandbox, the kitchen does not open**: the station refuses the project, naming what is
  missing (`sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — <reason>`;
  still French). Fixed, it reopens at the station's restart or when its line changes.
- **What it does not keep**: what the runtime itself launches outside `claude` — the worktree's setup,
  the gates.

**Is the sandbox usable on this Mac?**

```bash
BRIGADE_STATION_DIR=<the station's directory> node runtime/src/bac-a-sable/verifier.ts
```

It writes `ok` (code 0), or what is missing in one sentence (code 1): not macOS, no Seatbelt, a
`claude` too old or silent (the one the station launches: `BRIGADE_CLAUDE_BIN`, otherwise `claude`),
`HOME` missing, a relative cache, or worktrees where a cook must read nothing; 2, badly called. It
tries the station's places with a trial cook in its workshop, so a station under `~/.config/brigade`
— the app's default — **holds**. The sentences stay French until the runtime is translated
(`runtime/src/bac-a-sable/local.ts`, `detection.ts`, `configuration.ts`).

**Checking by hand**, on the Mac: `--settings` returns the configuration for a directory and a list of
hosts; `claude` launched with it must refuse what a cook does not do. The trial directory is under the
account (`/tmp` links to `/private/tmp` under macOS).

```bash
mkdir -p "$HOME/brigade-essai-wt" && cd "$HOME/brigade-essai-wt"
claude -p 'With Bash, return the raw output of: touch ~/brigade-essai ; touch ~/brigade-essai-wt/ok ; ls ~/.ssh ; cat ~/.claude/.credentials.json ; curl -sS -o /dev/null -w "%{http_code}" https://example.com https://registry.npmjs.org' \
  --permission-mode dontAsk --setting-sources '' \
  --settings "$(node <repo>/runtime/src/bac-a-sable/verifier.ts --settings "$HOME/brigade-essai-wt" registry.npmjs.org)"
```

Expected: `~/brigade-essai`, `~/.ssh` and the credentials fail (`Operation not permitted`);
`~/brigade-essai-wt/ok` is created; `example.com` is refused; `registry.npmjs.org` answers `200`.

#### Moving a project's kitchen, whenever you want

The station that runs a project's manager and pass is chosen when the project is added ("Adding a project
to a station from the app, without a terminal", in [`station-machine.md`](station-machine.md)); **that
choice commits to nothing**: the manager and the pass can be moved afterwards to this computer, to its box or to another station, without removing or re-adding the
project. The app launches the operation (`runtime/src/demenagement/demenager.ts`):

```bash
BRIGADE_STATION_DIR=<the directory of this Mac's station> \
  node runtime/src/demenagement/demenager.ts <project> <gist of the target station> <gist>…
```

The gists are those of the chef's stations. It returns a JSON line —
`{"moved":true,"project":"parade","from":"box","to":"mac","askedAt":"…"}` (code 0), or
`{"moved":false,"said":"<a sentence>"}` (code 1, nothing changed); 2, badly called; 3, GitHub could be
neither read nor written. It writes only two requests (`brigade-projets.json`): `remise` on the
station the kitchen is leaving, `reprise` on the one that takes it over (field names stay French); the
app must keep them as they are when it rewrites these requests, or the move becomes an ordinary change
of the station that runs the manager and the pass. The rest happens **through the stations' gists**, in three steps
(`runtime/src/projets/tenir.ts`):

1. **The target station says it is ready**, or why it cannot be: its Apps authorized on the
   repository, the repository cloned, and, on this computer, the sandbox usable. Its tracking file
   says so (`bascule.etape`: `acceptee`, or `refusee` and the reason).
2. **The station it is leaving, only then, stops**: it removes the project's line (its kitchen closes,
   no cook leaves any more), proves by its lock that no kitchen holds it, stops every cook in flight
   and waits for its death, then publishes its state in its gist (`brigade-remise-<project>.json` and
   its parts): `remise`. Until the other is ready, it serves as before (`served by box; moving to mac
   is asked …`).
3. **The target station lays down that state, then opens it**: its kitchen starts on the log received
   (`recue`). A state it kept from before is set aside (`etat/.<project>.avant-<time>`), never
   overwritten; the ticket that had prepared the repository follows it, and none reopens.

The values `acceptee`, `refusee`, `remise` and `recue` of `bascule.etape` stay French.

**What follows the project: its whole log** (tickets and rail, grants, the chef's decisions, history);
the move adds only `kitchen.moved`. **A ticket in progress is not lost**: its cook is stopped
(`cook.exited`, `outcome: stop`, `cause: move` — no failure, nothing for the breaker), the ticket goes
back to the rail, and the station that takes over takes it up.

**Never two kitchens at once.** The handing over waits for the kitchen to be closed (lock free) and its
cooks dead; the target only opens its own once the handing over is published. A station that has
handed over a project does not reopen it on its own (`it was handed over to mac … move it back to
bring it here`): it only comes back through a move in the opposite direction.

**To this computer, not without a sandbox** ("A local kitchen", above). The command first plays the
check of `bac-a-sable/verifier.ts`: unavailable, it refuses with its reason and writes nothing; the
computer's station replays it before saying it is ready (`refusee`), and the other station still
serves the project. A refused or not yet accepted move can be taken back by moving the project to the
station that still serves it; once accepted, the command refuses another move of the project until the
target serves it.

**Where each project cooks** is read in each station's tracking file (`brigade-projets-suivi.json`):
`station` (`nom`, `locale`: the station of the chef's computer) and per project `cuitSur` (the station
where it cooks, as it knows it) and `ici` (it cooks on this computer). These names stay French.

**What is not guaranteed by a move.** Does not travel: the raw streams (`runs/`), the worktrees, the
clone. A cook stopped in flight restarts from the base, or from its branch on the origin if pushed
(`travail-conserve.ts`); what a box cook committed without pushing stays in the box's clone. The log
travels compressed through the gist: beyond 10 MB the handing over is refused and the old kitchen
stays closed, retried at each read. The state kept on the old station is frozen: a command typed there
no longer reaches the kitchen. Declared stations travel as they are: the chef redeclares them
(`brigade <project> station stations …`, [`station.md`](station.md)).

**No station reaches another, and it is guarded.** A declaration carries no address; in `runtime/src`, no
module opens a connection toward a station, and no program that reaches another machine is launched by its
name. `runtime/test/architecture.test.ts` checks it: a module that opens a connection is an architecture
decision, not an import.

Events: `kitchen.moved` (`from`, `to`, `askedAt`, `cooks`), the last fact of the state handed over.
