## The state of the kitchen

**The kitchen is a state, per project, on the box** — not a screen, and not the step of a ticket:

| The word | What it names |
|---|---|
| a project's **kitchen** | its state: `ouverte`, `retenue`, `arrêtée`, `éteinte` (open, held, stopped, off — below, "The state of the project"). It is what `guardrails -- stop` stops and `resume` reopens — in the log, `kitchen.stopped` and `kitchen.resumed` |
| **`en cuisine`** | the step of a ticket that a cook holds (`pris` on the rail, `taken`): in an epic's ticket list and in `pass` |
| **All projects** | the app's overview screen (`docs/app.md`). The app is a window on the Mac: closing it stops no kitchen, and stopping a kitchen does not close it |

One command to know where the project stands, without opening the database:
`npm --prefix runtime run status` — followed by `-- --follow [<ticket>]`, it stays open and
adds one line per event.

The last line before the follow, `todo`, counts the cards that entered TODO over a period, by
kind (`product`, `design`): `-- --days <N>` sets it, 7 days by default. A card
refused at the door (`todo.refused`), or entered before the two kinds and their choices, counts
nowhere; with no entry, each kind says 0.

```
awaiting   2 decisions await the chef — the oldest for 2 d
  #12  for 2 d  green delivery, not merged for lack of a `merge` grant — merge by hand: https://github.com/benomite/brigade/pull/31 — or enable the grant, for the next ones: `brigade brigade grant enable merge`  Le journal en ajout seul
  #21  for 3 h 02  BLOCKED: #17 dropped (label `fire` removed) — to unblock: put #17 back on the rail, or remove it from the `attend` line of the card  L'export du journal
  without a grant, 4 green deliveries stopped: 3 merged by hand, 0 closed without merge — no disagreement —, 1 still open
end awaiting
```

| Block | What it says |
|---|---|
| `nothing cooks` | **Very first line, absent otherwise.** The base is red and its repair ticket is working on it: `nothing cooks: base red since <duration> ago, repair #N in progress` (`rien ne cuit : base rouge depuis <durée>, réparation #N en cours` before #928 — the app reads both). A single line, **outside the `awaiting` block** — nothing waits for the chef there during the repair —, and the list of held tickets stays where it is. It disappears on return to green; a failed repair no longer carries it: it is the `base` line of the `awaiting` block that replaces it. The app sets it as is on the project's tile |
| `project` | (`projet` before #940.) The log's project, or `unknown — empty log` on an empty log |
| `github` | **Absent as long as GitHub does not limit the account's calls.** Otherwise: `GitHub is rate-limiting calls, back around HH:MM` (`GitHub limite les appels, reprise vers HH:MM` before #940), by the box's clock. See "The calls to GitHub, on the account's real quota, and waiting out the limit" (`station-machine.md`) |
| `runtime` | `running according to the log`, `stopped <duration> ago`, or `never started` — **according to the log**. A runtime killed without notice still appears to be running there: it is the **age of the last tick** that betrays it. Beyond a few cadences: `systemctl status brigade@<project>` |
| `kitchen` | (`cuisine` before #928.) The chef's "stop" and the breaker, like `run guardrails`: `open` or `STOPPED by the chef <duration> ago`, then `breaker closed (… failures in a row, opens at N)` or `breaker OPEN for <duration>` |
| `connection` | (`connexion` before #928.) **Absent as long as the Max connection holds.** Otherwise, per station: `Max MISSING` or `EXPIRED`, since when, the reason, and the gesture — `claude /login` under the service account; the kitchen resumes on its own within the minute. No ticket is taken until then. See "Max connection expired" |
| `grant` | **Absent as long as no grant is in force or has lapsed on its own.** Active: its expiry, what is left of it, its uses. `ACTIVE`; `EXPIRING SOON`: less than an hour, or a single use. `LAPSED` (turned off on its own): the pass stops at the open PR until you grant it again. See "The `merge` grant" |
| `setup` | **Absent as long as the project's setup is not blocked.** Blocked: `BLOCKED for <duration> on <commit>` — no setup is launched from here, for any ticket, as long as the integration branch does not move. The cause and the gesture are in the `awaiting` block (`setup` entry). See "The worktree setup comes before the cook" |
| `base` | **Absent as long as the base is not red** — unless its check is held because it cannot be fetched. Red, it holds the whole kitchen: since when, on which commit, the check that could not be played, the replay requested. With no request in progress, the last line is the gesture: `npm --prefix runtime run base -- replay`. See "The base is judged alone" |
| `backup` | (`sauvegarde` before #928.) The last successful backup (`backup.completed`): its age, its name, its last event. `TOO OLD`: the age exceeds `BRIGADE_BACKUP_MAX_AGE_HOURS`. `NEVER DONE`: the log carries none. In both cases: `systemctl status brigade-sauvegarde@<project>` |
| `awaiting` | **Always there**, from its `awaiting` line to its `end awaiting` line, **in English** — its edge, its count and each of its lines (words from `docs/glossary.md`); like everything else in `status` since #940, from `project` to `latest events`. When nothing awaits you, it says so: `nothing awaits the chef`. See "What awaits the chef", below |
| `stuck` | **Absent as long as no delivery is stuck in pass.** One line per card in pass, delivered and never judged, with **no active pass** — nothing judged or merged ahead of it — for more than **15 minutes** since its delivery (`COINCEE_APRES_MS`): `stuck      #644 in pass for 42 min with no active pass — delivered, never judged: \`brigade espace pass 644 --relaunch\``. A card whose own pass runs, that waits for its turn behind another, or that was delivered less than 15 minutes ago is not listed. The gesture relaunches its judgement: see "Relaunching a stuck delivery" ([`pass-merge.md`](pass-merge.md)) |
| `rail` | The count by state (`3 taken · 2 in pass · 6 queued · 2 BLOCKED · 4 86 · 1 WAITING · 1 served`, `empty` with no ticket), then each ticket in service order. A taken ticket carries two durations: since the taking, and **no progress** (`by box/claude since 5 min, no progress since 5 min, lease 5 min left` — since its station saw its worktree move). `STUCK: `: half of its lease has passed with no progress, or its lease has expired (`lease expired since 4 min`) and it is still taken. A `queued` ticket that does not leave says what it waits for, then since when (`… — since 2 min`) — another ticket (`awaiting #18`), a held zone (`zone held by #31 (…)`), what holds its station (`withheld by box/claude (…)`); `BLOCKED`: what it waited for was dropped (`#21 dropped (…)`), or frozen (`blocked by #36 (86 with no return time, not judged by the pass)`, see "The rail"). In pass or served: `since 3 d, cooked by box/claude`. An 86: `since 5 min (quota), back in 4 h 56` — or `no return time`, `back at the next tick`. A ticket in pass whose gates were cut on a saturated machine ends with `— gates replayed later: machine saturated, no test failing` |
| `cooks` | How many are running (`3 running`, `none running`), and the cap of each station with what gives it (`box/claude: 3 at most — 8 cores`, `box/playwright: 2 at most — declared`, `5 at most — set by you, replaces 3 (8 cores)`, `no limit — set by you, …`; see "Several cooks at once"). **If a cook is stuck, the line names it** (`— 2 STUCK: #14, #22`). Below, `MACHINE SATURATED for … on <resources> — …` with each resource that is lacking — memory, processor, both —, what it has, its threshold, and where the memory's comes from (`default: 10% of the machine's 32,050 MB`, `set by BRIGADE_MIN_FREE_MEMORY_MB`; see "The memory guard"), `<station> WITHHOLDING for …` with the reason, and `ARBITER UNREACHABLE for …`. Then one line per cook, **the worst first** (`STUCK` after its ticket); judgments and reviews at the end, with no branch. Turns and tokens are those of the last reading, whose age is shown (`12 turns of 100 · 184,000 tokens of 2,000,000 (reading 2 min ago)`, or `turns and tokens: no reading yet`); the line ends with what the cook is doing (`right now: reading runtime/src/etat.ts, since 2 min`) when its reading says so. Runtime stopped, the line says `… with no end in the log — runtime stopped: …`: a cook still listed died with it |
| `consumed` | (`consommé` before #940.) What all the launches together consumed — cooks, reviews, judgments: `in flight`, `5 h` (the Max quota window), `24 h` — `8 launches, of which 1 review and 2 judgments · 64 turns · 825,000 tokens`, or `nothing` |
| `servers`, `to launch`, `service` | (`serveurs`, `à lancer` before #940.) **Absent when nothing is served**: each server of an interface delivery (`starting` / `listening since …`, its page or `no page to open: …`), each held worktree of an app to launch (`held since …`, `no page in a browser: launch the app …`), and below them the screen (`screen: … (declared by the cook)`) and its sentence (`to look at: …`). See "Looking at an interface delivery in my browser" (`station-navigateur.md`) |
| `worktrees`, `drift`, `claude` | (`dérive` before #940.) **Absent when there is nothing to say**: the worktrees the runtime could not tidy up (`PR still open`, `work not pushed`, `cleanup failed`, "What is left after a cook" in [`pass-merge.md`](pass-merge.md)); the measures that crossed a declared threshold (`tests 622 for a threshold of 500`, "The measures reading"); under partition, the last tidying of the transcripts (`project transcripts: 1,027 kept (112 MB), 12 removed (48 MB) …`, "The project's transcripts are tidied" in [`cloison-et-arbitre.md`](cloison-et-arbitre.md)) |
| `latest events` | (`derniers événements` before #940.) The last fifteen, in the format of `run log`, without heartbeats or readings; `none` on an empty log |

### What awaits the chef

The kitchen never blocks on you: what awaits you piles up, the oldest first, and the rest
moves on. Each entry **names the gesture that unblocks it** — or says that none is known for its
reason — and leaves **on its own** as soon as the log carries the decision taken, including on GitHub.
Closing a PR without merging it is only half a decision: the entry does not leave, it changes.

| Entry | The gesture | What removes it |
|---|---|---|
| ``green delivery, not merged for lack of a `merge` grant`` · ``… the `merge` grant lapsed on its own on …`` (`no-grant`) | merge its PR by hand; or enable the grant for the next ones: `npm --prefix runtime run grant -- enable merge` | the merge by hand, which the pass notes (`merge.done`); the ticket leaving the rail (`ticket.left`); a cook restarted on the ticket. Its PR closed without merge replaces it with `PR closed without merge` |
| `green delivery that touches its judges` · `… what the project opens up (<files>)` (`review-required`) | read it, then merge it by hand | likewise |
| `green delivery, merge refused by GitHub (…)` (`merge-refused`) | lift what GitHub refuses, then merge by hand | likewise |
| `escalated by the pass, red (still-red: returns-exhausted)` · `escalated by the manager, red` | to decide: merge its PR by hand, or remove `fire`; without a PR, remove `fire` or close the issue. Detail: `run pass -- <ticket>` | the merge by hand; the ticket leaving the rail, or returned to the rail (`ticket.released`). Its PR closed without merge replaces it likewise |
| `escalated by the pass, which could not judge it (unjudged: <cause>)` | to lift: what its issue says, then remove and set `fire` again; or merge by hand, or remove `fire` | likewise |
| `PR closed without merge` | the ticket still holds its place on the rail: remove `fire`, or close the issue | the ticket leaving the rail, or returned to the rail if it was 86; the PR reopened then merged by hand. A re-split ticket does not enter there |
| `no calibration` · `unreadable card` · `refused three times by the model` | an 86 from the station **with no return time**: set `model:` and `effort:`, fix the card, or — refused — rephrase or recalibrate then remove and set `fire` again | calibrated or fixed, the station returns it to the rail on its own; the ticket leaving the rail |
| ``no station provides `<capability>` `` · ``… `<a>` and `<b>` together`` (86 `no-station: …`) | declare a station that provides it with `station stations …` (read without restart); or remove it from the `requiert` line of the card | at restart, a declared station provides it; the card fixed; the station returns it to the rail on its own (`capabilities-reread`); the ticket leaving the rail |
| `BLOCKED: #N dropped (…)` | put #N back on the rail, or remove it from the card's `attend` line | #N back (`ticket.arrived`); the card fixed (`ticket.changed`); the ticket leaving the rail |
| `back from WAITING, picked up again by the chef (it was waiting for <who>: “<what>”)` | a ticket that was not set aside before waiting for a third party, picked up again (`waiting resume`): `/brigade arrived #<N>`, posted on the Kitchen board, sends it back to the kitchen; `waiting set <N> --what … --from …` puts it back to waiting; or remove `fire`. **A ticket in WAITING is never in this block**, whatever it waited for before: it waits for a third party, not for you | "it has arrived" (`ticket.resumed`, `kitchen`); put back in WAITING; the ticket leaving the rail |
| ``set aside by the manager, it carries `question` `` · `` `decision` `` · ``held back, it carries `blocked-on-human` `` | answer, decide or lift the hold, then remove the label; or close the issue | the label removed, the manager judges it; the issue closed (`manager.closed`) or launched by hand |
| `manager's judgment unreadable` · `manager's split unreadable` · `manager's question before splitting the epic` | edit the issue so that it is picked up again, or answer the question on the issue; for a ticket, set `fire`, `model:` and `effort:` by hand; or close the issue | the issue edited, your answer, the issue closed or launched by hand; any later decision of the manager that no longer sees an epic to split there |
| `Max connection missing` · `expired` | the line carries the station, not a ticket: `claude /login` under the service account — the kitchen resumes on its own | the successful pass of the renewal (`session.restored`); the "resume" (`kitchen.resumed`) |
| `Max session close to its expiry` · `Max session renewal failing (<nature>)` | the line carries the session, not a ticket: `claude /login` under the service account, then `run guardrails -- resume`. See "The Max session: renewal and alert" | the next successful renewal; the "resume" (`session.reconnected`) |
| `Max connection token close to its expiry` · `… EXPIRED` · `Max connection token creation date missing` / `unreadable` | the line carries `token`, not a ticket — a single one, announced thirty days before the long-lived token's expiry: remake the token (`claude setup-token` under the service account, through the Max connection step). See "The long-lived token's expiry" | the token remade, which carries a new creation date (`token.observed`) |
| ``BASE RED on <commit>, failing: <what fails> — its repair #N <what it became>`` | the line carries `base`, not a ticket, and is counted **since the turn to red**. **It appears only if the repair failed** — left the rail without service, passed up, or merged without putting the base back to green —: a replay, a repair that opens or that works are not your burden. What fails is what the gates name (`FAIL …`) at the last red check. The gesture: fix the base by hand — the pass replays it as soon as it moves; or relaunch the unserved repair (set `fire` on it again, or remove and set it); a red that is not down to the code is replayed: `run base -- replay` | the base back to green (`base.checked`, `green`): the kitchen restarts on its own, with no command; the repair relaunched, working again |
| ``setup impossible: the door refuses `<host>` (…)`` · ``setup impossible: `.claude/brigade/worktree-setup.sh` fails twice identically (<reason>)`` | the line carries `setup`, not a ticket — **a single one for the project**, whatever the number of held tickets —, and is counted since the blocking (`setup.blocked`). A refused host is declared in the project's `.claude/brigade/reseau`, one line per host, merged on the integration branch; with no refused host, the setup is to be fixed, then merged — the entry names the issue where to read what it said | the integration branch moving (`setup.unblocked`): the setups resume on their own, with no command. The same failure on the new base brings it back |
| ``tickets put aside: <cause> (<reason>, twice identically) — only one is taken again at a time…`` | the line carries `aside`, not a ticket — **a single one for the project**. It says the cause, the ticket that saw it and the gesture; it falls on its own when a cook leaves, when another cause appears or when the integration branch moves |

As soon as a delivery has been stopped for lack of a grant, the block ends with **the figure on which to
grant**: `without a grant, N green deliveries stopped: X merged by hand, Y closed without merge — Y
disagreements —, Z still open`. A PR closed without merge is a disagreement: you refused what
the pass would have merged. With the queue empty, the block does not carry this figure: the same line is read in
`run pass` (#931) and `run grant`, all in English.

**The block is always there, and it has an edge.** When nothing awaits you, it says so instead of
keeping silent — a silence could not be told from a failed read:

```
awaiting   nothing awaits the chef
end awaiting
```

**When the kitchen is idle because the rest of the rail needs a human** (#1751), the block says
so on one line under its head, which still reads `nothing awaits the chef` — the line is not a
decision, and nothing counts it:

```
awaiting   nothing awaits the chef
  kitchen idle — the rest of the rail needs a human: no station provides `macos` (#12); `enregistrement-ecran` (#13) — waiting behind them: #15, #16 — to unblock: attach a station that provides them, or lower those tickets — remove them from the `requiert` line of their cards — or close them
end awaiting
```

It is there when no ticket is taken or in pass, no queued ticket can leave — each awaits a
ticket of its card —, no 86 has a return time, and at least one ticket is set aside
`no-station: …` without being in the queue itself: the manager on takes such a ticket back
before you (`runtime/src/sans-capacite.ts` — a re-split, or a `gesture` card, which then enters
the queue and leaves the line). It names the missing capabilities with the tickets that ask for
them, then the queued tickets their cards hold behind them, following `awaits` from ticket to
ticket: a ticket that awaits an unrelated one is not named. The gesture: attach a station that
provides what is missing, or lower those tickets (the `requiert` line of their card), or close
them. As soon as one ticket can cook, the line goes. Manager off, each such ticket is already an
entry of the queue, with its gesture: the line does not repeat it. The app redraws it from the
board's `bilans` (`docs/runtime/tableau-de-cuisine.md`).

It starts at the **only line of the output that starts with `awaiting`** and ends at the **only
line that is exactly `end awaiting`**, bounds included; everything it carries between the two is
indented — an entry is two spaces in. Whoever wants to present it separately — the app, the second (the PO role, `/brigade:po`: a single
role under two names) — takes it by these two lines, without reading anything of what it says: not counting its entries, not looking for the empty line that follows it, not
recognizing a turn of phrase. **One single thing is read in it besides, and the app reads it** to sort its rail: the
ticket number **at the head** of an entry — two spaces, `#`, digits, two spaces (`  #12  for 2 d  …`). This
head does not change without the app changing (`docs/app.md`, "The rail"); an entry
that carries a station, `session`, `token`, `closing`, `base`, `setup`, `aside` or `breaker`, the tally of stops for lack of a grant and the `kitchen idle` line have none. The edge holds for the state itself: under `--follow`, the events
appended afterwards are not part of it.

**The block is in English** (#927), its edge, its count and each of its lines, in the words
of `docs/glossary.md` (§2 and §4); what is between backticks — a command, a label, a card key
like `attend` — keeps its name. A box from before still writes `attend` … `fin attend`, and its
lines in French: the app and the second read both edges (#926), and the app both languages where
it reads more than the number — the duration of the head, the `jeton`/`token` and `session` entries,
the `setup` entry.

- **Enabling the grant does not empty the queue**: it holds for the next deliveries, not for those
  already stopped, which remain to be merged by hand.
- **What the block does not count**: a ticket re-split by the manager (`manager-split`); an 86
  that has a return time; what waits without you (`STUCK`, `WITHHOLDING`, `MACHINE SATURATED`, the
  `base` block); the manager's other deviations, which are read in `run manager`.
- **What the manager awaits from you: closing the issue is enough** (`manager.closed`, noted at the next
  poll). These lines have no title. Manager off, nothing is polled: the queue keeps
  what it awaited until you turn it back on.

The command reads `$BRIGADE_STATE_DIR`, never writes, and answers while the runtime is running; on a log written by an older runtime,
it asks to restart it. `BRIGADE_BACKUP_MAX_AGE_HOURS`: a whole number of hours, 1 at least,
`48` by default, read in the environment of **whoever runs `status`**; badly written, refusal
(code 2). The mark does not change the exit code, and nothing alerts outside `status`.

### Facts, for a program

`status` and `rail` are written to be read by you. A program that draws — the app: one
pill per project, five counters, the rail — must deduce nothing from a sentence. It reads
`brigade <project> facts` (`npm --prefix runtime run facts` on the dev workstation): **the reading of
`status`, put otherwise**. The same projections, read once, by the same gesture — no port, no
API, no second truth.

**This shape is a contract.** A JSON object, on a single line; its fields, their order, its
words do not change without its reader changing, and `runtime/test/faits.test.ts` freezes it to the
character. Everything else the runtime says — `status`, `rail`, `station`, the log —
is text, and may be rephrased.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":1,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/benomite/brigade/issues/14","activite":{"fait":"lit","cible":"runtime/src/etat.ts","depuis":"2026-10-12T10:01:11.000Z"},"attente":null},{"ticket":21,"etat":"BLOQUÉ","titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21","activite":null,"attente":null}],"cooks":[{"ticket":14,"titre":"Le journal en ajout seul","station":"box/claude"}],"attend":[{"ticket":21,"titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21"}],"livres":[{"ticket":216,"titre":"Le relevé des mesures","url":"https://github.com/benomite/brigade/issues/216","livre":"2026-10-12T10:03:58.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/219","relecture":{"resume":"Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.","constats":[{"gravite":"remarque","fichier":"runtime/src/mesures.ts","constat":"Le seuil par défaut est répété dans deux fichiers."},{"gravite":"remarque","fichier":null,"constat":"À supprimer : l'ancien compteur, qui ne sert plus."}]}},{"ticket":201,"titre":"Les grants sous plafond","url":"https://github.com/benomite/brigade/issues/201","livre":"2026-10-12T07:12:40.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/207","relecture":{"resume":"Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.","constats":[]}},{"ticket":188,"titre":"Une fiche sans zone","url":"https://github.com/benomite/brigade/issues/188","livre":"2026-10-11T16:30:05.000Z","station":"box/claude","pr":null,"relecture":null}]}
```

(The field names and their values — `ouverte`, `pris`, `BLOQUÉ`… — are the contract's, and stay in French in the shape.
The titles, summaries and findings in the example are ticket and reviewer text.)

| Field | What it carries |
|---|---|
| `etat` | The project's state, as one word of the closed list below |
| `lu` | The box's time at the reading |
| `dernierTick` | The time of the last tick of the running runtime. `null`: runtime stopped, or no tick since its start |
| `compteurs.rail` | The queued tickets, `BLOQUÉ` included |
| `compteurs.auTravail` | The `pris` (taken) tickets |
| `compteurs.aLaPass` | The `en pass` (in pass) tickets |
| `compteurs.attend` | The decisions that await you: the figure on the head line of `status`'s `awaiting` block |
| `compteurs.livres24h` | The tickets served in the 24 h before `lu` — merged by the pass, merged by hand, or served without merge —, still on the rail or not. A ticket counts once |
| `dernierEvenement` | `seq`, `at`, `type` and `ticket` (`null` off ticket) of the last of `status`'s "latest events": neither heartbeat nor reading. Without its payload. `null` on an empty log |
| `rail` | Each ticket, in service order: `ticket`, `etat`, `titre`, `url` (its issue), `depuis` (the time it entered its current state — its take, its entry into the pass, its being queued again…; the app shows a Taken or Pass card's age from it), `activite` — what the kitchen is doing with it right now: `fait` (the gesture, in the chef's words), `cible` (the file or command it aims at, `null` if it aims at none), `depuis` (the time it started on it). **`null` for a ticket neither taken nor in pass, and for one the runtime does not know what is being done with.** See "What a cook is doing right now"; `attente` — for a ticket set aside (86), **what it waits for**: `raison` in plain words (`attend : setup du projet impossible`, `attend : quota du compte épuisé`, `attend : worktree impossible à préparer`…), `colonne` (the one it is in, like `etat`) and `retour` (the time of its return, `null` without); `null` for any other ticket; `tiers` — for a ticket in WAITING (`etat`: `WAITING`), **what it awaits from a third party**: `quoi` (in the chef's words), `qui`, `depuis` (its being put on hold), `relance` (when to come back to it) and `aLArrivee` (what "it has arrived" will make of it, in plain words); `null` for any other ticket. **A ticket set aside `no-station` is read as WAITING too** (#1752): what it awaits is an action the chef does not do with a button, attach a station to the project. Its `etat` and `attente.colonne` say `WAITING`, `quoi` says `a station that provides <capability> — attach one to the project`, `qui` `a human, the chef`, `depuis` the time it was set aside, and **`relance` is `null`** — nobody put it on hold, so there is nothing to resume or send back; `aLArrivee` says it goes back on the rail by itself once a station provides the capability. It stays 86 in the log and in `status`; `revenu` — for a ticket come back from WAITING into TODO, **why**, in the runtime's words: `relance du 21/10 : pas de réponse` or `nouveau sur l'issue — de <qui>`; `null` for any other, and for a ticket the chef picked up themself; `raison` — **for the ticket at the top of the queue only** (the first queued one, in the order the rail serves it), why it does not leave: `zone held by #12 (runtime/src)`, `awaiting #7`, or `machine saturated` when every station is; `null` for any other ticket, and for the top one when it leaves; `captures` — **for an interface ticket in pass or served**, the screen before and after of its last delivery (see "Looking at an interface delivery in my browser"): `complet` (each screen has its two captures — `false` also when there is none) and `ecrans`, each with `ecran`, `avant` and `apres`, the address of the capture at the delivered commit, `null` when the cook did not deliver it. **Absent for any other ticket**, and when the box does not know its repository |
| `cooks` | The cooks in progress, those `station` shows under "cooks en cours", in its order — station by station, the oldest first: `ticket`, `titre` (the ticket's), `station`. An empty list when none is running. The title is the rail's: empty (`""`) if the ticket left it during the cooking |
| `attend` | The tickets that `status`'s `awaiting` block names, one per entry, in the block's order: `ticket`, `titre`, `url`. **It is the address that opens the issue**: the rail's for a ticket that is on it, otherwise the one **the box's repository** gives (`BRIGADE_GITHUB_REPO`) — the app composes none. The title is the rail's, **empty (`""`) for an issue that is not on it**: the log does not know it, and nothing goes to fetch it. `url` is `null` when the box does not know its repository. The Max connection, the version, the requested closing pass, the red base and the blocked setup, which belong to no ticket, are not in it — `compteurs.attend` counts them. An empty list when nothing awaits |
| `livres` | The tickets served in the 24 h before `lu` — **those `compteurs.livres24h` counts, one for one** —, the most recent first: `ticket`, `titre`, `url` (its issue), `livre` (the time of its service), `station` (the one that cooked it, `null` when none sent it to the pass — merged by hand with no cook, delivery off the rail), `pr` (the merged PR, `null` for a ticket served without merge), `relecture` (what the reviewer said of **what was served**, word for word: `resume`, its summary; `constats`, in its order, each with `gravite` — `remarque` or `bloquant` —, `fichier` — `null` when it names none — and `constat`, its text; a deletion it asks for is a `remarque` whose text starts with "À supprimer : "). `relecture` is `null` when no readable review concerns the served delivery: merged by hand without going through the pass, served without review, reviewed on a commit from before the one the pass last judged, or whose last review cannot be read — **nothing is put in its place**, not even a review of an earlier delivery. A red review merged by hand by the chef is theirs: its blocking findings are in it. **A ticket stays in it after its issue is closed**: it left the rail, not the list — it is reread in the log, title and address included. The title is the day's, empty (`""`) for a delivery the rail never carried; `url` is then the one the box's repository gives, or `null`. **An issue closed without having been served** — dropped, set aside — **is not in it**. `captures`: as on the rail, for an interface ticket — absent for any other. An empty list when nothing was served in 24 h |
| `stations` | The stations the project declares, in the order of their name, and what they do with **ordinary tickets** (see "Ordinary tickets on the chef's workstation"): `station`, `distante` (remote), `plafond` (its cooks at a time, at most — `null`: no limit), `ordinaires` (the chef's setting, `false` for a box station), `ensemble` (`true`: a remote station declared `distante+ensemble`, one more station of the project that takes the ordinary tickets alongside the box, not only when it is saturated; `false` for a box station), `bacASable` (what the station said of its workstation's sandbox: `disponible`, `raison` — `null` if it is —, `version` of its `claude` — `null` if it is not —, `depuis`; `null` as long as it has said nothing), `prendOrdinaires` (it takes some at this moment: always true for a box station; for a remote one, the setting and an available sandbox — and, unless it is `ensemble`, only when the box is saturated); then what it does with the project (#1183, see "Starting and stopping the kitchen, station by station" in [`station.md`](station.md)): `cuisson`, one word of a closed list — `refused` (this machine's station refuses the project, read in its `en-service` file through `BRIGADE_STATION_DIR` and `BRIGADE_PROJECT`; for a box station only), `stopped` (the chef stopped it with `station stop`, or stopped the whole kitchen), `saturated` (its machine can take no more; for a box station only), otherwise `cooking` —, the first true one winning; `arreteeDepuis` (the time of its `station stop`, `null` without — and under the mere "stop" of the whole kitchen); `refus` (`{ status, code, message, action }`, the refusal of [`station-machine.md`](station-machine.md); `null` outside `refused`); `cooks` (its cooks in progress, the oldest first — stopped, those finishing —, like those of the `cooks` field: `ticket`, `titre`, `station`). An empty list when none is declared |
| `corrections` | The proposed corrections of the project's guidance (see "Proposed corrections" below), the oldest first: `proposition` (the `seq` of the fact that carries it), `cause` and `titre` (the cause of the failures, its key and its sentence), `tickets` (those it made fail, each with `ticket` and `url` — the address the box's repository gives, `null` when it does not know it), `motif` (why this correction, in the model's words; `null` if it said nothing), `diff` (a unified diff, as `git apply` takes it), `fichiers` (those it touches), `base` (the commit of the integration branch it applies to), `cout.tokens` (what the proposal cost, counted like a cook's), `proposee` (the time of the proposal). **Absent when there is none**: the shape of a kitchen with no correction does not change. A discarded proposal is never in it, a decided proposal is no longer in it |
| `triage` | What the triage did each of the last seven days (UTC), the oldest first, today last — always seven entries: `day` (`YYYY-MM-DD`), `decidedAlone` (the cards it settled itself, one of its five actions done) and `sentToTodo` (the cards it let into TODO). A card the gate sends back to it counts for neither. A day with no outcome is `0` and `0`, never absent. Read from the log's `todo.triaged` events (`triagesParJour`), so it survives a restart. Absent from a runtime from before this field |
| `activiteCuisine` | What the project's kitchen did with its tickets in the last hour and the last day, each window up to the moment of the read included: `lastHour` and `lastDay`, each with `served` (merged, or served without a diff — a ticket escalated then merged by hand too), `sentBack` (handed back to a cook by the pass, the manager or the chef: `pass.returned`) and `escalated` (taken up to the chef by the pass: `pass.escalated`, except a ticket the manager split again, which awaits nothing from the chef). Each count is in tickets: sent back twice in the hour, one. Only the facts of the project count — `BRIGADE_PROJECT`, else the project of the log's last event. No activity: six `0`, never absent. Read from the log's events (`runtime/src/activite-cuisine/comptes.ts`), so it survives a restart. The app's Cooks tab shows the six numbers on top. Absent from a runtime from before this field |
| `cadence` | How fast the project's kitchen serves (#1811): `hours` — always 24 entries, the oldest first, each a whole UTC hour, the last one the hour in progress up to the read — each with `at` (the start of the hour), `served` (the tickets merged or served without a diff in that hour, a ticket counting once: `ticket.served`, `merge.done`) and `failed` (each pass that came back red — `pass.judged` with a `red` verdict — and each cook that ended without a follow-up — `cook.exited` with the outcome `failed`, `guard` or `stop`, the same list as the rail projection's `FINS_SANS_SUITE` —, one for one); an hour with nothing is `0` and `0`, never absent. `medianSeconds` — `taken` and `pass`: the median time, in seconds, a ticket stayed taken, then in pass, over the stays that started and ended in the 7 days before the read (a stay ends when the ticket changes state, the way the rail projection reads it: in pass, released, set aside, served, gone, or its cook ending `failed`, `guard` or `stop`); **`null` below 3 such stays** — nothing is usual yet. Only the facts of the project count — `BRIGADE_PROJECT`, else the project of the log's last event. Read from the log's events (`runtime/src/activite-cuisine/cadence.ts`), so it is right as soon as the app opens. The app draws `hours` as a small histogram at the top of the rail, and marks a Taken or Pass card that has been there more than twice its column's median. Absent from a runtime from before this field |
| `rolesCuisine` | The project's kitchen roles, always all of them and in this order: `manager`, `pass`, `reviewer`, `second judge`, `triage`, `closer` — each with `role`, `does` (one line on what it does) and `latest`, its latest action on the project: `what` (a short sentence composed by the runtime from the fields of the fact — `merged #12`, `reviewed #31: red, 2 findings`, `delivered a cleanup PR removing 140 lines` —, never command output nor a model's free text), `ticket` (`null` for a fact on no ticket, like the closer's) and `at`. **`latest` is `null` for a role that has not acted on the project yet.** The facts read per role: the manager's judgments, set-asides, reactions, splits and re-reads; the pass's verdicts, its merges (`by: pass`), served-without-diff, and its own returns, escalations and deferrals (author `pass` — a return written by the manager, the triage or the chef is not the pass's); the reviewer's reviews (`pass.reviewed`); the second judge's verdicts; the triage's actions (`todo.triaged`, except `back`); the closer's starts and ends. Only the facts of the project count — `BRIGADE_PROJECT`, else the project of the log's last event. Read from the log (`runtime/src/roles-cuisine/roles.ts`). The app's Cooks tab shows them under the calibration ceiling. Absent from a runtime from before this field |
| `coutDesGates` | What the project's gates cost against its budget (see "The cost of the gates, and its budget" below; `runtime/src/cout-des-gates.ts`): `budget` — `durationSeconds`, `cpuSeconds`, and `parLeChef` (`durationSeconds`, `cpuSeconds`: `true` when the chef set it, `false` when the default applies); `latest` — the project's last gate run, `null` if it never had one: `project`, `ticket` (`null` for the gates of the base), `runner` (`pass` or `cook`), `outcome` (`green`, `red`, `timeout`), `durationSeconds`, `cpuSeconds` (`null` when the run was cut and its CPU lost with it), `at`; `overBudget` — `true` when the last run's duration or CPU exceeds the budget, `false` without a run; `lastDay` — the runs of the 24 h before the read: `runs`, `durationSeconds`, `cpuSeconds` (a run with no CPU counts 0). `lastHour` — the same for the hour before the read. `averages` — `lastHour` and `lastDay`, what one run costs on average over each window: `durationSeconds` over all its runs, `cpuSeconds` over the runs that said their CPU — each `null` when there is none. `trend` — `durationSeconds` and `cpuSeconds`: the last hour's average against the last day's, `up` or `down` past 10 % of the day's (`ECART_DE_TENDANCE`), `steady` within, `null` when either average is missing. Only the runs of the project count — `BRIGADE_PROJECT`, else the project of the log's last event. Absent from a runtime from before this field |
| `reculs` | What each accepted correction did to its cause (see "Does a merged correction push back its cause?" below), the oldest first: `proposition` (the `seq` of the accepted proposal), `cause` and `titre`, `pr` (the correction's PR, `null` as long as it is not open, or if it never was), `etat` — `en-cours` (not merged yet: nothing is measured, neither before nor after), `non-mergee` (it will not be: not delivered, or PR closed without merge), `rien-a-comparer` (merged, with no finished ticket after it) or `mesuree`. Merged, it carries `mergee` (the merge time) and `avant`; measured, also `apres` and `recule` (`true`: the share went down; `false`: it stayed the same, or went up). `avant` and `apres` each say `tickets` (the finished tickets looked at), `atteints` (those the cause made fail at least once, in the order they finished), `essais` (the attempts it made fail there) and `part` (`atteints` over `tickets`, between 0 and 1). `avant` is `null` when no ticket was finished before the merge. **Absent when no correction was accepted** |
| `profils` | The proposed cook profiles that await you (see "Proposed profiles" below), the oldest first: `proposition` (the `seq` of the fact that carries it), `nom` (that of its file), `domaine` (the card zone found), `chiffres` — `tickets` (those of the window that carry the domain, each with `ticket` and `url`, the address the box's repository gives, `null` when it does not know it), `fenetre` (the served tickets looked at), `domaine` and `projet` (their share delivered on the first try: `premiers` over `retenus` merged, and `part` between 0 and 1), `ecart` (the points that separate them) and `seuils` (`fenetre`, `tickets`, `ecart`: the settings that had it proposed) —, `skills` (empty: you write them), `perimetre` (the zone), `carnet` (the starting lessons, each with `id`, `texte` and `retros`), `proposee` (the time of the proposal). **Absent when there is none.** A decided profile is no longer in it |
| `apprentissage` | What the cooks have taught the project (`runtime/src/apprentissage/projet.ts`), read from `BRIGADE_PROJECT` and `BRIGADE_REPO_DIR`: `lecons` — each with `id`, `texte`, `statut` (`provisoire`, from the log, or `promue`, from the repository's notebook), `date` (YYYY-MM-DD), `tickets` (those whose retro proposed or reconfirmed it), `origine` (where it was born: `{ "kind": "retro" }`, `{ "kind": "pass-send-back", "ticket": N }` or `{ "kind": "chef-correction", "ticket": N }` — see [`carnet-lecons.md`](carnet-lecons.md), "The notebook format"), `cooks` (how many received it, according to the project's `lessons` of `cook.launched` — see [`carnet-lecons.md`](carnet-lecons.md), "What a cook receives"), `progres` (see below) and, for a promoted one only, `url` (its line in the repository's notebook, on its integration branch; absent without `BRIGADE_GITHUB_REPO` or `BRIGADE_BASE_BRANCH`) — and `profils` — each with `nom`, `domaine`, `carnet` (`id`, `texte`, `etat`, `origine`), `tickets` and `progres`. `progres` (`apprentissage/progres.ts`) says whether learning pays: `{ avant, apres }`, the delivery of the merged tickets taken before, then from the day the lesson entered (its `date`) or the profile was accepted — each `{ retenus, premiers, premierCoup (0 to 1), essaisMoyens }`, measured like `measures` (first try = merge on a single attempt). **A side with no merged ticket is `null`**, neither 0 nor NaN. **Absent when the project has neither lesson nor profile**, or its notebook or a definition is unreadable |

Times are ISO 8601, UTC.

**The state of the project** — the first true one wins:

| Word | When | What `status` says of it |
|---|---|---|
| `éteinte` | (off) the runtime is stopped, or never started, according to the log | `runtime    stopped … ago`, `never started` |
| `arrêtée` | (stopped) your "stop" | `kitchen    STOPPED by the chef …` |
| `retenue` | (held) it is running, but nothing leaves any more: breaker open, Max connection missing or expired, no station declared, red base, project setup blocked with no remote station | `breaker OPEN`, the `connection` line, `stations   NONE DECLARED`, `base       RED since …`, `setup      BLOCKED` |
| `ouverte` | (open) none of the above | |

**The state of a ticket**: the word that `rail` and the shape write — `en attente`, `BLOQUÉ`, `pris`,
`en pass`, `servi`, `86`.
`status` has written the same in English since #940: `queued`, `BLOCKED`, `taken`, `in pass`, `served`, `86`.

These two lists are **closed**: a reader sets a color on them. They may
gain a word; a reader therefore shows a word it does not know as is, without color. The `type`
of the last event, for its part, is displayed and not interpreted: its list is not closed.

What the shape does not say, and why:

- **`ouverte` says what the log says.** A runtime killed without notice still appears to be running there,
  as in `status`. The shape does not conclude: it carries `lu` and `dernierTick`, whose gap the reader
  displays. Beyond a few cadences, `systemctl status brigade@<project>`.
- **No gauge, no percentage** — neither quota nor machine. The runtime does not know the account's
  consumption (`/usage` gives it) and quantifies the machine only when it saturates: what
  it says of it in a word stays in `status` and in `station`, and no number is derived from it.
  A cook has no gauge either: its turns, its duration, its tokens are in `status`.
- **The reviewer's reviews and the manager's judgments** are not in `cooks`: they are not
  a station's cooks, and `station` does not show them either.
- **An `86` that has a return time** — the quota — is in none of the five counters: it
  awaits neither a station nor you. It is in `rail`, with its state.
- **Why** the kitchen is held, what a ticket awaits, who holds it, since when: that is
  `status`. The log, the grants, the partition, the arbiter have no shape; of the station, only
  its cooks in progress have one.

The command reads `$BRIGADE_STATE_DIR`, takes no argument, never writes, and answers while
the runtime is running; on a log written by an older runtime, it asks to
restart it (code 1).

### Proposed corrections

When the same cause of failure comes back on several recent tickets, the runtime picks it out as a
**candidate for a correction** (`correction.candidate`, `runtime/src/correctif/detecter.ts`). For
a candidate, the model reads the cause, what the failed tickets say of it and the project's guidance
as the base carries it, and answers with a diff (`runtime/src/correctif/proposer.ts`). It is
launched like a manager judgment — no tool, outside any repository, under the guardrails — and its
cost is that of this launch, in tokens counted like a cook's.

**A correction touches only the project's guidance**: its `CLAUDE.md` at the root, its team docs under `docs/`, its gates (`.claude/brigade/gates.sh`). Neither its code, nor its tests, nor
how brigade works. The guard (`runtime/src/correctif/portee.ts`) reads the diff itself — it
refuses a deleted file, a renamed one, a changed mode, binary, a path outside the repository —, then
asks `git` which files it would touch and whether it applies as is to `origin/<base>`
(`git apply --check`, on a throwaway index: neither the clone nor its index moves). A single file
outside the guidance, or a diff that does not apply, and the proposal is **discarded**
(`correction.discarded`, which says why and does not keep the diff): `facts` never shows it.
Otherwise it is **proposed** (`correction.proposed`), and `corrections` carries it. A candidate has
only one conclusion. Nothing is applied: it is your "yes" that will do it.

**Nothing goes without your "yes"** (`runtime/src/correctif/decision.ts`). A proposal that
no one decides stays in `corrections`, and nothing is born of it — neither branch nor PR. Decided, it
leaves; it is decided only once, and a second gesture, the same or the other, writes nothing.

You answer on the project's **Kitchen board** (`docs/tableau-gestes.md`): a comment whose first line is
`/brigade correction yes <proposal>` or `/brigade correction no <proposal>`, with no `#` before the
number — it is what the two buttons of the card post, in the app. The box plays it at its next tick
(`trancherLaCorrection`) and answers under the comment in one line: done, with the cost of the answer,
or not done — no proposal under that number, or one already answered — and nothing is written.
`<proposal>` is the `proposition` of `corrections`.

| Your gesture | What happens |
|---|---|
| "yes" (`correction.accepted`) | the runtime prepares a branch like a cook's, commits **the proposed diff and only it** there, laid on the commit where the guard verified it (`base`), pushes it and opens a PR to the integration branch (`correction.started`, then `correction.delivered`, `runtime/src/correctif/livrer.ts`). The PR enters **in pass off the rail**, like that of a closing pass: merge with the base, gates, reviewer, CI, `merge` grant (see "The pass"). The reviewer reads it as a correction of the guidance; red, no cook takes it up, it is passed up to you (`still-red`, cause `off-rail`). A correction that touches the gates is never merged by the pass (`review-required`, cause `judge-modified`). At most one PR: a delivery that died with the runtime picks up at start the PR GitHub carries for its branch, or opens one if it had none. A diff that no longer commits, a branch that does not push, a PR GitHub refuses: `correction.undelivered`, which says why, and nothing is retried |
| "no" (`correction.refused`) | it leaves the queue. The "no" names, by their run, the attempts the cause made fail so far: **the same cause becomes a candidate again only with one more failed attempt** — and if it still reaches the threshold. The same failures, picked up again, do not make one again |

#### Does a merged correction push back its cause?

Once a correction's PR is merged (`merge.done` of the off-the-rail PR that `correction.delivered`
names), `facts` sets side by side, under `reculs`, **the share of tickets the cause made fail
before the merge, and after** (`runtime/src/correctif/recul.ts`). Only **finished** tickets
count — merged, or served without a diff:

- **before**: the last 20 finished before the merge;
- **after**: the first 20 **taken** after the merge, once finished. A ticket taken before the merge
  and finished after was cooked under the earlier guidance: it is on neither side. A ticket still
  in progress does not count.

Twenty is the detector's default window; `facts` does not read `BRIGADE_CORRECTION_WINDOW`.
Once the twenty "after" are finished, the measure no longer moves. The cause **recedes** when its share after
is lower than before; at an equal share, or higher, it does not recede. As long as the PR is not
merged, nothing is measured (`en-cours`); merged with no finished ticket after it, there is **nothing to
compare** (`rien-a-comparer`) — and not a zero share.

### Proposed profiles

When a card zone comes back often on the last served tickets and is delivered on the first
try markedly less there than the rest of the project (`runtime/src/profils/domaines.ts`: at least
`BRIGADE_PROFILE_MIN_TICKETS` tickets, 5 by default, among the last `BRIGADE_PROFILE_WINDOW`, 20,
and at least `BRIGADE_PROFILE_GAP_POINTS` points below the average, 20), the runtime makes of it a **proposed cook
profile** (`profile.proposed`, `runtime/src/profils/proposer.ts`): a name drawn from the zone
(`app/src/vue` gives `app-src-vue`), the figures that justify it with its tickets, and what the
profile would contain — skills (none: nothing the log carries says which, you
write them), its perimeter (the zone) and a starting notebook: the **promoted** lessons of the project's
notebook of which a retro names a ticket served in that zone (`#12`). `profils` carries it. A zone
has only one proposal at a time, and has none once its profile exists — accepted, or already defined
in the repository.

**A profile exists only if you say "yes"** (`runtime/src/profils/decision.ts`). A proposal
that no one decides stays in `profils`, and nothing is born of it. Decided, it leaves; it is decided
only once, and a second gesture, the same or the other, writes nothing.

You answer on the project's **Kitchen board** (`docs/tableau-gestes.md`), like a correction:
`/brigade profile yes <proposal>` or `/brigade profile no <proposal>`, with no `#` before the number —
it is what the two buttons of the card post, in the app. `<proposal>` is the `proposition` of
`profils`. The box plays it at its next tick (`trancherLeProfil`), in the project's clone on the box,
and answers under the comment in one line: done, or not done — no proposal under that number, one
already answered, or a definition already in the repository — and nothing is written.

| Your gesture | What happens |
|---|---|
| "yes" (`profile.accepted`) | the profile's definition is written into the project's repository, one file per profile: `.claude/brigade/profils/<name>.md` — its domain, its perimeter, its skills, the date of the "yes", the tickets that justified it, then its notebook in the project notebook's format. A definition already there is never replaced: the "yes" writes nothing, and the proposal still waits |
| "no" (`profile.refused`) | it leaves the queue. The "no" names the tickets of the domain that the log had served so far: **the domain is proposed again only if it crosses the thresholds again on other tickets** — the measure is redone as if those did not carry the zone. The same tickets, picked up again, do not bring it back |

### A profile at dispatch

A profile is a **preference, never a constraint** (`runtime/src/profils/preference.ts`). When
launching a ticket's cook — from here or from a remote station, first cook, resumption or send-back —,
the runtime rereads the definitions in `.claude/brigade/profils/` in the project's repository and looks for
those whose domain touches the card's zone (one owns the other, as for zones): the
most precise first (most segments), then by name. The first **whose cook is free**
wins: the cook starts under that profile and receives, after the project's lessons, the profile's notebook —
its name, its file, and its **promoted** lessons, each with its id; a lesson that left is not
given.

A profile's cook is **one at a time**: it is busy as long as a cook launched under it runs
for this project. Busy, or if no profile touches the zone, **the ticket does not wait for it**: it goes
at once with a generalist, without a notebook, and its instruction is the earlier one. The profile chooses
and holds no station: only the capability does. An unreadable definition is discarded, and
the runtime names it on its error output.

The log says it at launch: `profile.notebook-given`, in the station's name, with `run` (the
cook), `name` and `zone` (the profile and its domain), `file` (its definition, relative to the repository) and
`lessons` (the ids of the notebook lessons given — `[]` for a still-empty notebook). A generalist
has none.

### The Kitchen board, on GitHub

The runtime publishes what `status` says in the project's own repository: one issue titled
**Kitchen board**, pinned, whose body is the board (`runtime/src/tableau/`) — the queue with each
gesture, the kitchen's state, and a machine block for the apps. It carries the labels
`kitchen-board`, by which it is found again, and `hors-cuisine`, so that neither the rail nor the
manager takes it as a ticket. Its format, field by field — including what the project's rail view
draws from it (#1693) — is in [`tableau-de-cuisine.md`](tableau-de-cuisine.md). On each tick (once a minute) the runtime rereads the board and
**rewrites the body only if what it says changed**: the reading time, the durations it gives
("for 4 min") and the runtime's last tick are not a change, so a quiet kitchen writes nothing. Only the body is edited —
no comment, no mention: a refresh notifies nobody. Each call goes through the GitHub budget
(`station-machine.md`), as a kitchen call, under the manager's identity when roles have one.

A station publishes one board for each project it serves (#1662): each project's kitchen
(`runtime/src/station/cuisine.ts`) publishes its own board, in its own repository, as the
single-project runtime does. The gestures posted under a project's board are played on that
project's log. The chef is mentioned under that project's board. Its calls are counted to that
project in the station's counter, and that counter is the one `status` reads for `board cost`.

The issue is found by its label and its block, never by a stored number. Closed, it is reopened;
deleted or transferred, it is recreated; created, reopened, recreated — the service log says it
in one line. Pinning is checked at the first refresh, after each creation or reopening, then
hourly; refused (an App without the right), it is said once and retried an hour later. A refresh
that fails — GitHub unreachable, the budget holding the kitchen back — is said once, and retried
at the next tick.

## The measures reading

The gates say "it works", never "it is getting heavy". The reading sets side by side, **over
time**, what the log knows of the project's heaviness: it is the slope that reveals a drift.

`npm --prefix runtime run measures` shows them in slices of 10 merges; `-- --by 25`, of 25.

When a ticket among the last ten merges exceeds the drift's cost threshold (`BRIGADE_DRIFT_TICKET_TOKENS`,
declared only once), `measures` adds under the `CROSSED` line a `reason for the drift —` line per ticket:
the number of passes, the share of tokens lost to the send-back, and the send-backs restarted from zero for lack of resumption
(or "retries resumed"). A ticket passed once says its size in one go. Under the threshold, no motif.

| Column | What it says | Where it comes from |
|---|---|---|
| `merges`, `up to` | The slice: the rank of its merges, the day of the last. The axis is the **merge**, not the clock | `merge.done` |
| `tests`, `test suite` | The number of tests and the duration of their suite, at the slice's last delivery | `MESURE tests`, `tests_s` |
| `gates` | The duration of a delivery's gates — median of the slice | `MESURE gates_s` |
| `gates share` | What the gates weigh in a delivery's time, send-backs and rejudgments included, relative to that duration plus that of its cooks | `gates_s`, `durationMs` of `cook.exited` |
| `repo`, `docs` | The weight of what is committed, and of its markdown | `MESURE depot_octets`, `doc_octets` |
| `context` | What **each** cook loads for sure: the `CLAUDE.md` and its `@path` imports | `MESURE contexte_octets` |
| `thresholds`, `cap` | Under the tables: each declared threshold, `CROSSED` or not; and the gates' duration cap, if it was crossed | `drift.configured`, `gates.overCeiling` |
| `closing` | Under the thresholds, when one is crossed: the closing is proposed, with the crossed counter and its threshold. Nothing is launched — the pass that writes remains the chef's gesture; the crossing is entered in the log only once (`drift.crossed`) | `drift.crossed` |
| `slope` | By how much the measure was multiplied, from the first slice shown to the last | — |
| `turns` (second table) | A ticket's turns, all its cooks counted, by calibration: median, and over how many tickets | `cook.launched`, `cook.exited` |
| `tokens` (third table) | A ticket's tokens, the sum of all its launches, by calibration: median, over how many tickets, and the most expensive of the slice with its number. No threshold | `cook.launched`, `cook.exited` |
| `launches` (fourth table) | One ticket per line, for those launched more than once or one of whose launches delivered nothing: how many launches — of which how many send-backs that **resumed** the previous cook's session —, their tokens, and what they produced — `useful`, `lost` with their share. No threshold | `outcome` and `tokens` of `cook.exited`, `resumes` of `cook.launched` |

- **`—` means "the log does not know"**, never zero. Beyond twelve slices, only
  the last are shown; `--by` widens the window.
- **Expensive or lost: it is the cook's end that says so.** A launch delivered when its `cook.exited`
  says `ok` — the end the station gives the cook whose work it sends to the pass. Its tokens
  are `useful`: the price of the delivery, the pass's send-backs included. Any other end (`failed`,
  `guard`, `stop`, `refused`, `neutral`), or no end at all — died with the runtime — and its
  tokens are `lost`. A ticket at 650 k all of which is useful is expensive; the same with 450 k lost
  is a defect. A launch whose tokens the log does not know is counted and flagged (`2, of which
  1 with unknown tokens`), in neither of the two sums. A ticket never merged is not in the reading,
  whatever its launches cost.
- **Resumed or restarted from zero: the `launches` column says so.** A ticket one of whose send-backs resumed
  the previous cook's session carries `3, of which 1 resumed` (and the table's legend then says what
  `resumed` is); a ticket whose send-backs restarted from zero carries only its number there. The
  resumption changes nothing in the calculation: a resumed launch that delivers is `useful`, lost otherwise, like
  any other.
- **Only the deliveries the pass judged, then merged, count**; the consumption is that
  of the cooks, not of the Max account. A delivery judged then merged by hand behind another says
  nothing of the project's state, and no threshold is lifted on its word.
- The `cap` line counts the whole log: the merged deliveries whose last gates
  crossed their duration ceiling. The pass does not judge it: it is followed here.

### What the gates declare

The gates **may** print `MESURE  <name>=<number>` lines — a name in lowercase letters, digits
and underscores, a number with a point or a comma, alone on the line. The pass picks them up with the
verdict (`gates.measures` of `pass.judged`, `base.checked`): twenty at most, the last value
of a name wins. They judge nothing. The reading knows `tests`, `tests_s` (seconds),
`gates_s` (clock seconds), `depot_octets`, `contexte_octets` and `doc_octets`; any other name
is kept in the log and ignored. This repository's `.claude/brigade/gates.sh` declares all six.

Two other names are read by **a closing pass's tally**, and by it alone: `couverture`
(test coverage, as a percentage) and `verifications` (the number of checks the
gates run). They are its guardrails — see "The summary of a pass". Gates that do not
declare them leave these guardrails **unestablished**, never held; this repository's
do not declare them yet.

**One exception to the exit code, and only one: the duration ceiling.** Gates that give themselves
a ceiling and cross it write it on two lines — `durée des gates : <x> s de processeur …
pour un plafond de <n> s — … de trop`, then `FAIL  plafond des gates franchi : plus de <n> s de
processeur`. These two lines are the ones the runtime reads in the gates' output, so they stay French. The pass keeps the overrun (`gates.overCeiling`) and **does not judge it**: alone red,
it leaves the gates green. See "The gates' duration cap is not judged by the pass".

### Thresholds, and what warns you

A threshold is declared in the runtime's environment. **Only one has a default: the gates' duration**,
at `SEUIL_DUREE_GATES_PAR_DEFAUT` (`runtime/src/derive.ts`), 100 s — just above the 90 s that the
gates hold on a calm box; `BRIGADE_DRIFT_GATES_SECONDS` replaces it. It counts the gates'
execution, not the wait for their turn. The others, if not declared, signal nothing;
badly written, the runtime refuses to start.
`BRIGADE_DRIFT_TESTS` (number of tests), `BRIGADE_DRIFT_TESTS_SECONDS` (suite duration),
`BRIGADE_DRIFT_GATES_SECONDS` (duration of the last delivery's gates), `BRIGADE_DRIFT_CONTEXT_KB`
(context, in KB) and `BRIGADE_DRIFT_REPO_MB` (repository, in MB) are crossed when the measure
exceeds them; `BRIGADE_DRIFT_MERGES`, when the number of merges since the last closing
reaches it; `BRIGADE_DRIFT_GROWTH_PERCENT` — **the slope** —, when `tests`, `test suite`, `repo`,
`context` or `docs` has grown by more than this percentage in ten merges.

Each of these thresholds, the cost ones below, `BRIGADE_CORRECTION_*` and `BRIGADE_PROFILE_*` can also be
set by the project in `.claude/brigade/projet.json` (`drift`, `correction` and `profile`, see
[`../reglages.md`](../reglages.md)); the file's value wins over the box's, key by key.

Two thresholds concern **cost**, in tokens, over the last ten merges, and are set
**by gesture**, not by a variable (`station seuil-ticket <integer>` and `station seuil-perdus <integer>`):
the ticket threshold — the tokens of the most expensive ticket, all its launches counted — and the lost one —
the sum of the tokens of the launches that delivered nothing. Crossed when exceeded, named in the `drift` block with their value and
their threshold. **No default value**: it is the chef's quota. A crossed cost threshold is only read
— it turns nothing red, stops no cook and blocks no delivery.

One last signal concerns **send-backs**: the share of tickets delivered on the first try over the last served tickets. Under the threshold, `status`'s `drift` block
adds a line — "4/10 tickets delivered on the first try (threshold 50%)". At or above the threshold,
or as long as the window is not full, nothing. It is set like the cost thresholds, by gesture:
`station seuil-renvois <percentage>` (50 by default) and `station fenetre-renvois <tickets>`
(10 by default). It is only read, and writes neither `drift.crossed` nor a log line.

Thresholds enter the log when they change (`drift.configured`). When a merge makes one
cross, the runtime writes `drift.crossed` and a line in `journalctl -u brigade@<project>`,
**once**; back under its threshold, or the threshold removed, `drift.cleared`. In between, the `drift` block
of `status` reminds you. Nothing is stopped, no issue is opened.

### The cost of the gates, and its budget

**Each run of a project's gates writes what it cost** to the log, `gates.ran`
(`runtime/src/events/gates.ts`): the project and the ticket in its envelope — no ticket for the gates
of the base —, the time of the record, `runner` (who ran them: `pass`, or `cook` — the cook's own runs,
played through the station's launcher and written at the end of the cook, see "The cook's gates
reach the log" in [`station.md`](station.md)), `outcome`, `durationMs` — the
wall-clock time of the gates script, the worktree setup not counted — and `cpuMs` — user + system CPU
of the script **and of every process it waited for**, workers of the test runner included, read by
`times` from the shell that waits for the script. Gates cut at their cap, or by the runtime stopping,
take their CPU with them: `cpuMs` is then `null`. A setup that fails launches no gates and writes nothing.
`tree` and `config` are the fingerprint of what the run judged — the code tree, and a digest of the
gates configuration —: the pass reuses a green run on the same fingerprint instead of playing its
gates, and that reuse writes **no** `gates.ran`, so it costs nothing here (see "The same gates are
not played twice on the same code" in [`pass.md`](pass.md)).

**The budget is per project, a chef's decision**, set by gesture and read without a restart:
`station budget-gates <seconds>` (wall-clock duration) and `station budget-gates-cpu <seconds>` (CPU).
Unset, the default applies: **100 s** of duration — the drift threshold of the gates' duration,
`SEUIL_DUREE_GATES_PAR_DEFAUT` — and **400 s** of CPU — four full cores over that duration, half of
an 8-core box, so that three suites at once do not saturate it. `station remove budget-gates` brings
the default back. The last run is **over budget** when its duration or its CPU exceeds the budget.
`facts` gives all this in `coutDesGates`. Nothing is stopped or judged on it: no gates are seen red
for being over budget.

**Two kinds of run, two budgets.** The budget above judges **the gates of a ticket**, which play only
the tests the change touches. **The full run on the base** (a `gates.ran` with no ticket), which plays
everything to catch what the selection missed, is never judged by it: it always costs more, by far
(about 700 s of CPU for brigade). It has **its own, larger budget**, per project too:
`station budget-base <seconds>` and `station budget-base-cpu <seconds>`
(`BRIGADE_GATES_BASE_BUDGET_SECONDS`, `BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS`). Unset, the default is
four times the ticket budget: **400 s** of duration and **1600 s** of CPU. In `coutDesGates`, the
top-level `budget`, `latest`, `overBudget`, `lastDay`, `lastHour`, `averages` and `trend` read the runs
of tickets only; `base` — `{ budget, latest, overBudget }`, same shapes — reads the runs of the base
against the base budget.

**Over budget, the kitchen opens a ticket on the project, on its own** (`runtime/src/budget-des-gates.ts`).
Right after it writes a run's `gates.ran`, the pass reads the latest run against the budget of its kind
(a ticket's gates against the ticket budget, the full run on the base against the base budget): over it —
duration, CPU, or both — and with no budget ticket of the project still open, it creates one on GitHub,
titled "Bring the gates of a ticket of <project> back under their budget: …" or, for the base, "Bring the
full run of the gates of <project> on the base back under its budget: …" — the ticket says which kind
went over, and a base ticket never asks to fit the full run into the ticket budget, nor a ticket
one to fit the full suite. Its body gives the measured
wall-clock and CPU, the budget of each (set by the chef or default), which dimension is exceeded and
by how much, the run that did it, and the criteria: back under budget, no test removed, skipped or
weakened. It carries `fire`, `prio:1` and `model:opus` / `effort:high`: the kitchen serves it before the
tickets of lower priority. **One at a time**: while the last one is on the rail (open on GitHub, with
`fire`, without `hors-cuisine`), a run over budget opens nothing more; once it is closed, gone — or
taken off the rail and left open —, the next run over budget writes `gates.budget-ticket-closed`
(`state`: `closed`, `gone` or `off-rail`) and opens a new one. While the last run is over budget and
no budget ticket is on the project's rail, `rail` says so in one line (`gates of <project> over budget
(…) and no budget ticket on the rail`). A run within budget never calls GitHub. The creation is announced in the log
before the call (`gates.budget-ticket-opening`), and the issue carries the mark
`<!-- brigade:budget-gates <project> <seq of the announcement> -->`: a lost answer, or a runtime killed
in between, finds the issue again by its mark — from a trusted author only — instead of opening it
twice. `gates.budget-ticket-opened` holds the ticket, the measures, the budget and the exceeded
dimensions and `run` (`ticket` or `base`; absent on older facts, read as `ticket`) (`runtime/src/events/gates.ts`). GitHub down: the pass says it once, and the next run over
budget tries again. `facts` gives the ticket in `coutDesGates.ticket` — `{ number, openedAt, exceeded, run }`,
null when there is none, or when the last one was seen closed —, for the queue to say the kitchen
opened it.

## The daily report of the decisions brigade told about

Every decision taken under `brigade decides and tells me` writes an entry (`autonomy.reported`).
`report` reads them back: those of the last 24 hours, grouped by kind of decision (in the table's
order), each with a one-line summary and a link to what was done. Nothing decided under `brigade decides` or
`I decide` is in it. A day without entries is a report that says so, not an error.

```sh
npm --prefix runtime run report   # read-only; exits 0 (an empty day too), 1 if the log cannot be read, 2 on a bad call
```

The data, for the app and the chef's channel, is `rapportDuJour(base, now)` in
`runtime/src/autonomie/rapport/rapport.ts`: `{ from, to, vide, groups: [{ row, title, entries: [{ seq, at, ticket, decision, summary, link }] }] }`.
