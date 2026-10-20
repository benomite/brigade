## The state of the kitchen

**The kitchen is a state, per project, on the box** — not a screen, and not a ticket's step:

| The word | What it names |
|---|---|
| a project's **kitchen** | its state: `ouverte`, `retenue`, `arrêtée`, `éteinte` (further down, "The state of the project"). It is what `guardrails -- stop` stops and `resume` reopens — in the log, `kitchen.stopped` and `kitchen.resumed` |
| **`taken`** | the step of a ticket that a cook holds (`taken` on the rail): in an epic's ticket list and in `pass` |
| **All projects** | the app's overview screen (`docs/app.md`). The app is a window on the Mac: closing it stops no kitchen, and stopping a kitchen does not close it |

A single command to know where the project stands, without opening the database:
`npm --prefix runtime run status` — followed by `-- --follow [<ticket>]`, it stays open and
adds one line per event.

The last line before the follow, `todo`, counts the cards that entered TODO over a period, by
type (`product`, `design`, `gesture`): `-- --days <N>` sets it, 7 days by default. A card
refused at the door (`todo.refused`) counts nowhere; with no entry, each type says 0.

```
awaiting   2 decisions await the chef — the oldest for 2 d
  #12  for 2 d  green delivery, not merged for lack of a `merge` grant — merge by hand: https://github.com/benomite/brigade/pull/31 — or enable the grant, for the next ones: `brigade brigade grant enable merge`  Le journal en ajout seul
  #21  for 3 h 02  BLOCKED: #17 dropped (label `fire` removed) — to unblock: put #17 back on the rail, or remove it from the `attend` line of the card  L'export du journal
  without a grant, 4 green deliveries stopped: 3 merged by hand, 0 closed without merge — no disagreement —, 1 still open
end awaiting
```

| Block | What it says |
|---|---|
| `nothing cooks` | **Very first line, absent otherwise.** The base is red and its repair ticket is working on it: `nothing cooks: base red since <duration> ago, repair #N in progress` (`rien ne cuit : base rouge depuis <durée>, réparation #N en cours` before #928 — the app reads both). A single line, **outside the `awaiting` block** — nothing waits for the chef there during the repair —, and the list of held tickets stays where it is. It disappears when the base returns to green; a failed repair no longer carries it: the `base` line of the `awaiting` block replaces it. The app puts it as is on the project's tile |
| `project` | (`projet` before #940.) The project of the log, or `unknown — empty log` on an empty log |
| `github` | **Absent as long as GitHub is not rate-limiting the account's calls.** Otherwise: `GitHub is rate-limiting calls, back around HH:MM` (`GitHub limite les appels, reprise vers HH:MM` before #940), in the box's time. See "The GitHub call budget, and waiting out a limit" (`station-machine.md`) |
| `runtime` | `running according to the log`, `stopped <duration> ago`, or `never started` — **according to the log**. A runtime killed without warning still appears to be running there: it is the **age of the last tick** that gives it away. Beyond a few cadences: `systemctl status brigade@<project>` |
| `kitchen` | (`cuisine` before #928.) The chef's "stop" and the breaker, like `run guardrails`: `open` or `STOPPED by the chef <duration> ago`, then `breaker closed (… failures in a row, opens at N)` or `breaker OPEN for <duration>` |
| `connection` | (`connexion` before #928.) **Absent as long as the Max connection holds.** Otherwise, per station: `Max MISSING` or `EXPIRED`, since when, the reason, and the action — `claude /login` under the service's account; the kitchen resumes by itself within the minute. No ticket is taken until then. See "Max connection expired" |
| `grant` | **Absent as long as no grant is valid or has lapsed on its own.** Active: its expiry, what is left of it, its uses. `ACTIVE`; `EXPIRING SOON`: less than an hour, or a single use. `LAPSED` (lapsed on its own): the pass stops at the open PR until you grant it again. See "The `merge` grant" |
| `setup` | **Absent as long as the project's setup is not blocked.** Blocked: `BLOCKED for <duration> on <commit>` — no setup is launched from here, for any ticket, as long as the integration branch does not move. The cause and the action are in the `awaiting` block (`setup` entry). See "The worktree setup comes before the cook" |
| `base` | **Absent as long as the base is not red** — unless its check is held because it cannot be fetched. Red, it holds the whole kitchen: since when, on which commit, the check that could not be played, the requested replay. With no request in progress, the last line is the action: `npm --prefix runtime run base -- replay`. See "The base is judged alone" |
| `backup` | (`sauvegarde` before #928.) The last successful backup (`backup.completed`): its age, its name, its last event. `TOO OLD`: the age exceeds `BRIGADE_BACKUP_MAX_AGE_HOURS`. `NEVER DONE`: the log carries none. In both cases: `systemctl status brigade-sauvegarde@<project>` |
| `awaiting` | **Always there**, from its `awaiting` line to its `end awaiting` line, **in English** — its edge, its count and each of its lines (words from `docs/glossary.md`); like all the rest of `status` since #940, from `project` to `latest events`. When nothing awaits you, it says so: `nothing awaits the chef`. See "What awaits the chef", below |
| `rail` | The count by state (`3 taken · 2 in pass · 6 queued · 2 BLOCKED · 4 86 · 1 WAITING · 1 served`, `empty` with no ticket), then each ticket in serving order. A taken ticket carries two durations: since it was taken, and **with no progress** (`by box/claude since 5 min, no progress since 5 min, lease 5 min left` — since its station saw its worktree move). `STUCK: `: half of its lease has passed with no progress, or its lease has expired (`lease expired since 4 min`) and it is still taken. A `queued` ticket that does not leave says what it is waiting for, then since when (`… — since 2 min`) — another ticket (`awaiting #18`), a held zone (`zone held by #31 (…)`), what is withholding its station (`withheld by box/claude (…)`); `BLOCKED`: what it was waiting for was dropped (`#21 dropped (…)`), or frozen (`blocked by #36 (86 with no return time, not judged by the pass)`, see "The rail"). In pass or served: `since 3 d, cooked by box/claude`. An 86: `since 5 min (quota), back in 4 h 56` — or `no return time`, `back at the next tick`. A ticket in pass whose gates were cut on a saturated machine ends with `— gates replayed later: machine saturated, no test failing` |
| `cooks` | How many are running (`3 running`, `none running`), and each station's cap with what sets it (`box/claude: 3 at most — 8 cores`, `box/playwright: 2 at most — declared`, `5 at most — set by you, replaces 3 (8 cores)`, `no limit — set by you, …`; see "Several cooks at once"). **If a cook is stuck, the line names it** (`— 2 STUCK: #14, #22`). Below, `MACHINE SATURATED for … on <resources> — …` with each missing resource — memory, processor, both —, what it has, its threshold, and where the memory one comes from (`default: 10% of the machine's 32,050 MB`, `set by BRIGADE_MIN_FREE_MEMORY_MB`; see "The memory guard"), `<station> WITHHOLDING for …` with the reason, and `ARBITER UNREACHABLE for …`. Then one line per cook, **the worst first** (`STUCK` after its ticket); judgments and reviews at the end, with no branch. Turns and tokens are those of the last reading, whose age is shown (`12 turns of 100 · 184,000 tokens of 2,000,000 (reading 2 min ago)`, or `turns and tokens: no reading yet`); the line ends with what the cook is doing (`right now: reading runtime/src/etat.ts, since 2 min`) when its reading says so. With the runtime stopped, the line says `… with no end in the log — runtime stopped: …`: a cook still listed died with it |
| `consumed` | (`consommé` before #940.) What all the launches together have consumed — cooks, reviews, judgments: `in flight`, `5 h` (the Max quota window), `24 h` — `8 launches, of which 1 review and 2 judgments · 64 turns · 825,000 tokens`, or `nothing` |
| `servers`, `to launch`, `service` | (`serveurs`, `à lancer` before #940.) **Absent when nothing is served**: each server of an interface delivery (`starting` / `listening since …`, its page or `no page to open: …`), each held worktree of an app to launch (`held since …`, `no page in a browser: launch the app …`), and below it the screen (`screen: … (declared by the cook)`) and its sentence (`to look at: …`). See "The delivery of an interface ticket" (`station-navigateur.md`) |
| `worktrees`, `drift`, `claude` | (`dérive` before #940.) **Absent when there is nothing to say**: the worktrees the runtime could not tidy (`PR still open`, `work not pushed`, `cleanup failed`, "What is left after a cook"); the measures that crossed a declared threshold (`tests 622 for a threshold of 500`, "The measures report"); under partition, the last tidying of transcripts (`project transcripts: 1,027 kept (112 MB), 12 removed (48 MB) …`, "The project's transcripts are tidied") |
| `latest events` | (`derniers événements` before #940.) The last fifteen, in the format of `run log`, without heartbeats or readings; `none` on an empty log |

### What awaits the chef

The kitchen never blocks on you: what awaits you piles up, the oldest first, and the rest
moves on. Each entry **names the action that unblocks it** — or says that none is known for its
reason — and leaves **by itself** as soon as the log carries the decision taken, including on GitHub.
Closing a PR without merging it is only a half-decision: the entry does not leave, it changes.

| Entry | The action | What removes it |
|---|---|---|
| ``green delivery, not merged for lack of a `merge` grant`` · ``… the `merge` grant lapsed on its own on …`` (`no-grant`) | merge its PR by hand; or enable the grant for the next ones: `npm --prefix runtime run grant -- enable merge` | the merge by hand, which the pass notes (`merge.done`); the ticket leaving the rail (`ticket.left`); a cook set off again on the ticket. Its PR closed without merge replaces it with `PR closed without merge` |
| `green delivery that touches its judges` · `… what the project opens up (<files>)` (`review-required`) | review it, then merge it by hand | likewise |
| `green delivery, merge refused by GitHub (…)` (`merge-refused`) | lift whatever GitHub refuses, then merge by hand | likewise |
| `escalated by the pass, red (still-red: returns-exhausted)` · `escalated by the manager, red` | to decide: merge its PR by hand, or remove `fire`; with no PR, remove `fire` or close the issue. Detail: `run pass -- <ticket>` | the merge by hand; the ticket leaving the rail, or returned to the rail (`ticket.released`). Its PR closed without merge replaces it likewise |
| `escalated by the pass, which could not judge it (unjudged: <cause>)` | to lift: what its issue says, then remove and re-apply `fire`; or merge by hand, or remove `fire` | likewise |
| `PR closed without merge` | the ticket still holds its place on the rail: remove `fire`, or close the issue | the ticket leaving the rail, or returned to the rail if it was 86; the PR reopened then merged by hand. A ticket that was split again does not enter it |
| `no calibration` · `unreadable card` · `refused three times by the model` | an 86 of the station **with no return time**: set `model:` and `effort:`, fix the card, or — if refused — reword or recalibrate then remove and re-apply `fire` | calibrated or fixed, the station returns it to the rail by itself; the ticket leaving the rail |
| ``no station provides `<capability>` `` · ``… `<a>` and `<b>` together`` (86 `no-station: …`) | declare a station that provides it with `station stations …` (read without a restart); or remove it from the card's `requiert` line | on restart, a declared station provides it; the card fixed; the station returns it to the rail by itself (`capabilities-reread`); the ticket leaving the rail |
| `BLOCKED: #N dropped (…)` | put #N back on the rail, or remove it from the card's `attend` line | #N back (`ticket.arrived`); the card fixed (`ticket.changed`); the ticket leaving the rail |
| `back from WAITING, picked up again by the chef (it was waiting for <who>: “<what>”)` | a ticket that was not set aside before waiting on a third party, picked up again (`attente -- reprendre`): `attente -- arrive <N>` sends it back to the kitchen; `attente -- poser <N> …` puts it back to waiting; or remove `fire`. **A WAITING ticket is never in this block**, whatever it was waiting for before: it waits for a third party, not for you | "it has arrived" (`ticket.resumed`, `kitchen`); put back in WAITING; the ticket leaving the rail |
| ``set aside by the manager, it carries `question` `` · `` `decision` `` · ``held back, it carries `blocked-on-human` `` | answer, decide or lift the hold, then remove the label; or close the issue | the label removed, the manager judges it; the issue closed (`manager.closed`) or launched by hand |
| `manager's judgment unreadable` · `manager's split unreadable` · `manager's question before splitting the epic` | edit the issue so that it is picked up again, or answer the question on the issue; for a ticket, set `fire`, `model:` and `effort:` by hand; or close the issue | the issue edited, your answer, the issue closed or launched by hand; any later manager decision that no longer sees an epic to split there |
| `Max connection missing` · `expired` | the line carries the station, not a ticket: `claude /login` under the service's account — the kitchen resumes by itself | the successful pass of the renewal (`session.restored`); the "resume" (`kitchen.resumed`) |
| `Max session close to its expiry` · `Max session renewal failing (<nature>)` | the line carries the session, not a ticket: `claude /login` under the service's account, then `run guardrails -- resume`. See "The Max session: renewal and alert" | the next successful renewal; the "resume" (`session.reconnected`) |
| `Max connection token close to its expiry` · `… EXPIRED` · `Max connection token creation date missing` / `unreadable` | the line carries `token`, not a ticket — a single one, announced thirty days before the long-lived token's expiry: redo the token (`claude setup-token` under the service's account, through the Max connection step). See "The long-lived token's expiry" | the token redone, carrying a new creation date (`token.observed`) |
| ``BASE RED on <commit>, failing: <what fails> — its repair #N <what it became>`` | the line carries `base`, not a ticket, and is counted **from the switch to red**. **It appears only if the repair failed** — left the rail unserved, escalated, or merged without putting the base back to green —: a replay, a repair that opens or that is working are not your concern. What fails is what the gates name (`FAIL …`) at the last red check. The action: fix the base by hand — the pass replays it as soon as it moves; or relaunch the unserved repair (re-apply `fire` to it, or remove it and re-apply it); a red that is not due to the code is replayed: `run base -- replay` | the base back to green (`base.checked`, `green`): the kitchen restarts by itself, with no command; the repair relaunched, working again |
| ``setup impossible: the door refuses `<host>` (…)`` · ``setup impossible: `.claude/brigade/worktree-setup.sh` fails twice identically (<reason>)`` | the line carries `setup`, not a ticket — **a single one for the project**, however many tickets are held —, and is counted from the block (`setup.blocked`). A refused host is declared in the project's `.claude/brigade/reseau`, one line per host, merged on the integration branch; with no refused host, the setup is to be fixed, then merged — the entry names the issue where to read what it said | the integration branch moving (`setup.unblocked`): setups resume by themselves, with no command. The same failure on the new base brings it back |
| ``tickets put aside: <cause> (<reason>, twice identically) — only one is taken again at a time…`` | the line carries `aside`, not a ticket — **a single one for the project**. It says the cause, the ticket that saw it and the action; it drops by itself when a cook leaves, when another cause shows up or when the integration branch moves |

As soon as a delivery has been stopped for lack of a grant, the block ends with **the figure on which
to grant**: `without a grant, N green deliveries stopped: X merged by hand, Y closed without merge — Y
disagreements —, Z still open`. A PR closed without merge is a disagreement: you refused what
the pass would have merged. With the queue empty, the block does not carry this figure: the same line is read in
`run pass` (#931) and `run grant`, all in English.

**The block is always there, and it has an edge.** When nothing awaits you, it says so instead of
staying silent — a silence could not be told apart from a failed reading:

```
awaiting   nothing awaits the chef
end awaiting
```

It begins at the **only line of the output that begins with `awaiting`** and ends at the **only
line that is exactly `end awaiting`**, bounds included; everything it carries between the two is
indented — an entry of two spaces. Whoever wants to present it separately — the app, the second (the PO role, `/brigade:po`: a single
role under two names) — takes it by those two lines, without reading anything it says: neither counting its entries, nor looking for the empty line that follows it, nor
recognizing a phrasing. **Only one thing is read in addition, and the app reads it** to sort its rail: the
ticket number **at the head** of an entry — two spaces, `#`, digits, two spaces (`  #12  for 2 d  …`). This
head does not change without the app changing (`docs/app.md`, "The number it reads there"); an entry
that carries a station, `session`, `token`, `closing`, `base`, `setup`, `aside` or `breaker`, and the tally of stops for lack of a grant, have none. The edge holds for the state itself: under `--follow`, the events
added afterwards are not part of it.

**The block is in English** (#927), its edge, its count and each of its lines, in the words
of `docs/glossary.md` (§2 and §4); what is between backticks — a command, a label, a card key
like `attend` — keeps its name. A box from before still writes `attend` … `fin attend`, and its
lines in French: the app and the second read both edges (#926), and the app both languages where
it reads more than the number — the head's duration, the `jeton`/`token` and `session` entries,
the `setup` entry.

- **Enabling the grant does not empty the queue**: it holds for the next deliveries, not for those
  already stopped, which remain to be merged by hand.
- **What the block does not count**: a ticket split again by the manager (`manager-split`); an 86
  that has a return time; what waits without you (`STUCK`, `WITHHOLDING`, `MACHINE SATURATED`, the
  `base` block); the manager's other deviations, which are read in `run manager`.
- **What the manager waits for from you: closing the issue is enough** (`manager.closed`, noted at
  the next poll). These lines have no title. With the manager off, nothing is polled: the queue keeps
  what it was waiting for until you turn it back on.

The command reads `$BRIGADE_STATE_DIR`, never writes,
and answers while the runtime is running; on a log written by an older runtime,
it asks to restart it. `BRIGADE_BACKUP_MAX_AGE_HOURS`: an integer number of hours, 1 at least,
`48` by default, read in the environment of **whoever launches `status`**; misspelled, it is refused
(code 2). The mark does not change the exit code, and nothing alerts outside `status`.

### The facts, for a program

`status` and `rail` are written to be read by you. A program that draws — the app: one
pill per project, five counters, the rail — must deduce nothing from a sentence. It reads
`brigade <project> facts` (`npm --prefix runtime run facts` on the dev workstation): **the reading of
`status`, put differently**. The same projections, read once, by the same action — no port, no
API, no second truth.

**This form is a contract.** A JSON object, on a single line; its fields, their order, its
words do not change without its reader changing, and `runtime/test/faits.test.ts` freezes it
to the character. Everything else the runtime says — `status`, `rail`, `station`, the log —
is text, and may be reworded.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":1,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/benomite/brigade/issues/14","activite":{"fait":"lit","cible":"runtime/src/etat.ts","depuis":"2026-10-12T10:01:11.000Z"},"attente":null},{"ticket":21,"etat":"BLOQUÉ","titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21","activite":null,"attente":null}],"cooks":[{"ticket":14,"titre":"Le journal en ajout seul","station":"box/claude"}],"attend":[{"ticket":21,"titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21"}],"livres":[{"ticket":216,"titre":"Le relevé des mesures","url":"https://github.com/benomite/brigade/issues/216","livre":"2026-10-12T10:03:58.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/219","relecture":{"resume":"Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.","constats":[{"gravite":"remarque","fichier":"runtime/src/mesures.ts","constat":"Le seuil par défaut est répété dans deux fichiers."},{"gravite":"remarque","fichier":null,"constat":"À supprimer : l'ancien compteur, qui ne sert plus."}]}},{"ticket":201,"titre":"Les grants sous plafond","url":"https://github.com/benomite/brigade/issues/201","livre":"2026-10-12T07:12:40.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/207","relecture":{"resume":"Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.","constats":[]}},{"ticket":188,"titre":"Une fiche sans zone","url":"https://github.com/benomite/brigade/issues/188","livre":"2026-10-11T16:30:05.000Z","station":"box/claude","pr":null,"relecture":null}]}
```

| Field | What it carries |
|---|---|
| `etat` | The project's state, in one word of the closed list below |
| `lu` | The box's time at the reading |
| `dernierTick` | The time of the last tick of the running runtime. `null`: runtime stopped, or no tick since its start |
| `compteurs.rail` | The queued tickets, `BLOQUÉ` included |
| `compteurs.auTravail` | The `pris` (taken) tickets |
| `compteurs.aLaPass` | The `en pass` (in pass) tickets |
| `compteurs.attend` | The decisions that await you: the figure on the head line of the `awaiting` block |
| `compteurs.livres24h` | The tickets served in the 24 h before `lu` — merged by the pass, merged by hand, or served without a merge —, still on the rail or not. A ticket counts once |
| `dernierEvenement` | `seq`, `at`, `type` and `ticket` (`null` outside a ticket) of the last of `status`'s "latest events": neither heartbeat nor reading. Without its payload. `null` on an empty log |
| `rail` | Each ticket, in serving order: `ticket`, `etat`, `titre`, `url` (its issue), `activite` — what the kitchen is doing with it right now: `fait` (the action, in the chef's words), `cible` (the file or command it aims at, `null` if it aims at none), `depuis` (the time it started on it). **`null` for a ticket neither taken nor in pass, and for one whose handling the runtime does not know.** See "What a cook is doing right now"; `attente` — for a ticket set aside (86), **what it is waiting for**: `raison` in plain words (`attend : setup du projet impossible`, `attend : quota du compte épuisé`, `attend : worktree impossible à préparer`…), `colonne` (the one it is in, like `etat`) and `retour` (the time of its return, `null` without one); `null` for any other ticket; `tiers` — for a WAITING ticket (`etat`: `WAITING`), **what it is waiting for from a third party**: `quoi` (in the chef's words), `qui`, `depuis` (when it was put on hold), `relance` (when to come back to it) and `aLArrivee` (what "it has arrived" will do to it, in plain words); `null` for any other ticket; `revenu` — for a ticket back from WAITING in TODO, **why**, in the runtime's words: `relance du 21/10 : pas de réponse` or `nouveau sur l'issue — de <qui>`; `null` for any other, and for a ticket the chef picked up himself; `captures` — **for an interface ticket in pass or served**, the before and after screen of its latest delivery (see "The delivery of an interface ticket"): `complet` (each screen has both captures — `false` also when there are none) and `ecrans`, each with `ecran`, `avant` and `apres`, the address of the capture at the delivered commit, `null` when the cook did not deliver it. **Absent for any other ticket**, and when the box does not know its repository |
| `cooks` | The cooks running, those `station` shows under "cooks en cours", in its order — station by station, the oldest first: `ticket`, `titre` (the ticket's), `station`. An empty list when none is running. The title is the rail's: empty (`""`) if the ticket left it during the cook |
| `attend` | The tickets the `awaiting` block of `status` names, one per entry, in the block's order: `ticket`, `titre`, `url`. **It is the address that opens the issue**: the rail's for a ticket that is on it, otherwise the one **the box's repository** gives (`BRIGADE_GITHUB_REPO`) — the app composes none. The title is the rail's, **empty (`""`) for an issue that is not on it**: the log does not know it, and nothing goes to fetch it. `url` is `null` when the box does not know its repository. The Max connection, the version, the requested closing pass, the red base and the blocked setup, which belong to no ticket, are not in it — `compteurs.attend` counts them. An empty list when nothing awaits |
| `livres` | The tickets served in the 24 h before `lu` — **those `compteurs.livres24h` counts, one for one** —, the most recent first: `ticket`, `titre`, `url` (its issue), `livre` (the time of its serving), `station` (the one that cooked it, `null` when none sent it to pass — merged by hand without a cook, delivery off the rail), `pr` (the merged PR, `null` for a ticket served without a merge), `relecture` (what the reviewer said about **what was served**, word for word: `resume`, its summary; `constats`, in its order, each with `gravite` — `remarque` or `bloquant` —, `fichier` — `null` when it names none — and `constat`, its text; a removal it asks for is a `remarque` whose text begins with "À supprimer : "). `relecture` is `null` when no readable review covers the delivery served: merged by hand without going through the pass, served without a review, reviewed on a commit from before the one the pass judged last, or whose last review is unreadable — **nothing is put in its place**, not even a review of an earlier delivery. A red review merged by hand by the chef is its own: its blocking findings are in it. **A ticket stays in it after its issue is closed**: it left the rail, not the list — it is reread from the log, title and address included. The title is the day's, empty (`""`) for a delivery the rail never carried; `url` is then the one the box's repository gives, or `null`. **An issue closed without having been served** — dropped, set aside — **is not in it**. `captures`: as on the rail, for an interface ticket — absent for any other. An empty list when nothing was served in 24 h |
| `stations` | The stations the project declares, in the order of their name, and what they do with **ordinary tickets** (see "Ordinary tickets on the chef's workstation"): `station`, `distante`, `plafond` (its cooks at a time, at most — `null`: no limit), `ordinaires` (the chef's setting, `false` for a box station), `bacASable` (what the station said about its workstation's sandbox: `disponible`, `raison` — `null` if it is —, `version` of its `claude` — `null` if it is not —, `depuis`; `null` as long as it has said nothing), `prendOrdinaires` (it takes some at this moment: always true for a box station; for a remote one, setting and sandbox available); then what it does with the project (#1183, see "Starting and stopping the kitchen, station by station" in [`station.md`](station.md)): `cuisson`, a word from a closed list — `refused` (the station of this machine refuses the project, read from its `en-service` file by `BRIGADE_STATION_DIR` and `BRIGADE_PROJECT`; for a box station only), `stopped` (the chef stopped it with `station stop`, or stopped the whole kitchen), `saturated` (its machine is at its limit; for a box station only), otherwise `cooking` —, the first true one winning; `arreteeDepuis` (the time of its `station stop`, `null` without one — and under the kitchen-wide "stop" alone); `refus` (`{ status, code, message, action }`, the refusal of [`station-machine.md`](station-machine.md); `null` outside `refused`); `cooks` (its cooks in flight, the oldest first — when stopped, those finishing —, like those of the `cooks` field: `ticket`, `titre`, `station`). An empty list when none is declared |
| `corrections` | The proposed corrections to the project's guidelines (see "Proposed corrections" below), the oldest first: `proposition` (the `seq` of the fact that carries it), `cause` and `titre` (the cause of the failures, its key and its sentence), `tickets` (those it made fail, each with `ticket` and `url` — the address the box's repository gives, `null` when it does not know it), `motif` (why this correction, in the model's words; `null` if it said nothing), `diff` (a unified diff, as `git apply` takes it), `fichiers` (those it touches), `base` (the integration-branch commit it applies on), `cout.tokens` (what the proposal cost, counted like a cook's), `proposee` (the time of the proposal). **Absent when there are none**: the form of a kitchen with no correction does not change. A discarded proposal is never in it, a decided proposal is no longer in it |
| `reculs` | What each accepted correction did to its cause (see "Does a merged correction push its cause back?" below), the oldest first: `proposition` (the `seq` of the accepted proposal), `cause` and `titre`, `pr` (the correction's PR, `null` as long as it is not open, or if it never was), `etat` — `en-cours` (not merged yet: nothing is measured, neither before nor after), `non-mergee` (it will not be: not delivered, or PR closed without merge), `rien-a-comparer` (merged, with no ticket finished after it) or `mesuree`. Merged, it carries `mergee` (the time of the merge) and `avant`; measured, also `apres` and `recule` (`true`: the share dropped; `false`: it stayed the same, or rose). `avant` and `apres` each say `tickets` (the finished tickets looked at), `atteints` (those the cause made fail at least once, in the order they finished), `essais` (the attempts it made fail there) and `part` (`atteints` over `tickets`, between 0 and 1). `avant` is `null` when no ticket was finished before the merge. **Absent when no correction has been accepted** |
| `profils` | The proposed cook profiles that await you (see "Proposed profiles" below), the oldest first: `proposition` (the `seq` of the fact that carries it), `nom` (that of its file), `domaine` (the card zone noted), `chiffres` — `tickets` (those of the window that carry the domain, each with `ticket` and `url`, the address the box's repository gives, `null` when it does not know it), `fenetre` (the served tickets looked at), `domaine` and `projet` (their share delivered on the first try: `premiers` out of `retenus` merged, and `part` between 0 and 1), `ecart` (the points separating them) and `seuils` (`fenetre`, `tickets`, `ecart`: the settings that made it proposed) —, `skills` (empty: you write them), `perimetre` (the zone), `carnet` (the starting lessons, each with `id`, `texte` and `retros`), `proposee` (the time of the proposal). **Absent when there are none.** A decided profile is no longer in it |
| `apprentissage` | What the cooks have taught the project (`runtime/src/apprentissage/projet.ts`), read from `BRIGADE_PROJECT` and `BRIGADE_REPO_DIR`: `lecons` — each with `id`, `texte`, `statut` (`provisoire`, from the log, or `promue`, from the repository's notebook), `date` (YYYY-MM-DD), `tickets` (those whose retro proposed or reconfirmed it), `cooks` (how many received it, according to `lessons` of the project's `cook.launched` — see [`carnet-lecons.md`](carnet-lecons.md), "What a cook receives"), `progres` (see below) and, for a promoted one only, `url` (its line in the repository's notebook, on its integration branch; absent without `BRIGADE_GITHUB_REPO` or `BRIGADE_BASE_BRANCH`) — and `profils` — each with `nom`, `domaine`, `carnet` (`id`, `texte`, `etat`), `tickets` and `progres`. `progres` (`apprentissage/progres.ts`) says whether learning pays: `{ avant, apres }`, the delivery of the merged tickets taken before, then from the day the lesson came in (its `date`) or the profile was accepted — each `{ retenus, premiers, premierCoup (0 to 1), essaisMoyens }`, measured like `measures` (first try = merge on a single attempt). **A side with no merged ticket is `null`**, neither 0 nor NaN. **Absent when the project has neither lesson nor profile**, or when its notebook or a definition is unreadable |

Times are in ISO 8601, UTC.

**The state of the project** — the first true one wins:

| Word | When | What `status` says about it |
|---|---|---|
| `éteinte` (off) | the runtime is stopped, or never started, according to the log | `runtime    stopped … ago`, `never started` |
| `arrêtée` (stopped) | your "stop" | `kitchen    STOPPED by the chef …` |
| `retenue` (held) | it is running, but nothing leaves any more: breaker open, Max connection missing or expired, no station declared, base red, project setup blocked without a remote station | `breaker OPEN`, the `connection` line, `stations   NONE DECLARED`, `base       RED since …`, `setup      BLOCKED` |
| `ouverte` (open) | none of that | |

**A ticket's state**: the word that `rail` and the form write — `en attente`, `BLOQUÉ`, `pris`,
`en pass`, `servi`, `86`.
`status` has written the same in English since #940: `queued`, `BLOCKED`, `taken`, `in pass`, `served`, `86`.

These two lists are **closed**: a reader puts a color on them. They may
gain a word; a reader therefore shows a word it does not know as is, without color. The `type`
of the last event, for its part, is displayed and not interpreted: its list is not closed.

What the form does not say, and why:

- **`ouverte` says what the log says.** A runtime killed without warning still appears to be running there,
  as in `status`. The form does not conclude: it carries `lu` and `dernierTick`, whose gap the reader
  displays. Beyond a few cadences, `systemctl status brigade@<project>`.
- **No gauge, no percentage** — neither quota nor machine. The runtime does not know the
  account's consumption (`/usage` gives it) and only puts a figure on the machine when it saturates: what
  it says of it in a word stays in `status` and in `station`, and no number is derived from it.
  A cook has no gauge either: its turns, its duration, its tokens are in `status`.
- **The reviewer's reviews and the manager's judgments** are not in `cooks`: they are not
  a station's cooks, and `station` does not show them either.
- **An `86` that has a return time** — the quota — is in none of the five counters: it
  waits for neither a station nor you. It is in `rail`, with its state.
- **Why** the kitchen is held, what a ticket waits for, who holds it, since when: that is
  `status`. The log, the grants, the partition, the arbiter have no form; of the station, only
  its running cooks have one.

The command reads `$BRIGADE_STATE_DIR`, takes no argument, never writes, and answers while
the runtime is running; on a log written by an older runtime, it asks to restart it
(code 1).

### Proposed corrections

When the same cause of failure comes back on several recent tickets, the runtime picks it up as a
**candidate for a correction** (`correction.candidate`, `runtime/src/correctif/detecter.ts`). For
a candidate, the model reads the cause, what the failed tickets say about it and the project's guidelines
as the base carries them, and answers with a diff (`runtime/src/correctif/proposer.ts`). It is
launched like a manager judgment — no tool, outside any repository, under the guardrails — and its
cost is that of this launch, in tokens counted like a cook's.

**A correction touches only the project's guidelines**: its `CLAUDE.md` at the root, its
team docs under `docs/`, its gates (`.claude/brigade/gates.sh`). Not its code, not its tests, not
how brigade works. The guard (`runtime/src/correctif/portee.ts`) reads the diff itself —
it refuses a deleted or renamed file, a changed mode, binary, a path outside the repository —, then
asks `git` which files it would touch and whether it applies as is to `origin/<base>`
(`git apply --check`, on a throwaway index: neither the clone nor its index moves). A single file
outside the guidelines, or a diff that does not apply, and the proposal is **discarded**
(`correction.discarded`, which says why and does not keep the diff): `facts` never shows it.
Otherwise it is **proposed** (`correction.proposed`), and `corrections` carries it. A candidate has
only one outcome. Nothing is applied: it is your "yes" that will do it.

**Nothing leaves without your "yes"** (`runtime/src/correctif/decision.ts`). A proposal that
nobody decides stays in `corrections`, and nothing is born of it — no branch, no PR. Decided, it
leaves it; it is decided only once, and a second action, the same or the other, writes nothing.

The action is `profile` — on the box, `brigade <project> profile yes|no <proposal>`, and it is what
the card's two buttons launch, in the app:

```sh
npm --prefix runtime run profile                       # the proposed profiles that await you, by number
npm --prefix runtime run profile -- yes <proposition>  # "yes": the definition is written into BRIGADE_REPO_DIR
npm --prefix runtime run profile -- no <proposition>   # "no": the proposal leaves the queue
```

`<proposition>` is the `proposition` of `profils`. It exits with `0` when the answer is written, or when
the proposal already was (it says so, `already answered`); with `1` when nothing is — no
proposal under that number, or a definition already there —, the reason on its last line; with `2` on
a call that cannot be read.

| Your action | What happens |
|---|---|
| "yes" (`correction.accepted`) | the runtime prepares a branch like a cook's, commits **the proposed diff and nothing else** on it, laid on the commit where the guard checked it (`base`), pushes it and opens a PR to the integration branch (`correction.started`, then `correction.delivered`, `runtime/src/correctif/livrer.ts`). The PR enters **in pass off the rail**, like that of a closing pass: merge with the base, gates, reviewer, CI, `merge` grant (see "The pass"). The reviewer reads it as a correction of the guidelines; red, no cook takes it up again, it escalates to you (`still-red`, cause `off-rail`). A correction that touches the gates is never merged by the pass (`review-required`, cause `judge-modified`). One PR at most: a delivery that died with the runtime picks up at startup the PR GitHub carries for its branch, or opens one if it had none. A diff that no longer commits, a branch that cannot be pushed, a PR GitHub refuses: `correction.undelivered`, which says why, and nothing is retried |
| "no" (`correction.refused`) | it leaves the queue. The "no" names, by their run, the attempts the cause has made fail so far: **the same cause becomes a candidate again only with one more failed attempt** — and if it still reaches the threshold. The same failures, picked up again, do not make another one |

#### Does a merged correction push its cause back?

Once a correction's PR is merged (`merge.done` of the off-the-rail PR that `correction.delivered`
names), `facts` sets side by side, under `reculs`, **the share of tickets the cause made fail
before the merge, and after** (`runtime/src/correctif/recul.ts`). Only **finished** tickets
count — merged, or served without a diff:

- **before**: the last 20 finished before the merge;
- **after**: the first 20 **taken** after the merge, once finished. A ticket taken before the merge
  and finished after was cooked under the earlier guidelines: it is on neither side. A ticket still
  in progress does not count.

Twenty is the detector's default window; `facts` does not read `BRIGADE_CORRECTION_WINDOW`.
Once the twenty "after" are finished, the measure no longer moves. The cause **recedes** when its share after
is lower than before; at an equal share, or a higher one, it does not recede. As long as the PR is not
merged, nothing is measured (`en-cours`); merged with no ticket finished after it, there is **nothing to
compare** (`rien-a-comparer`) — and not a zero share.

### Proposed profiles

When a card zone comes back often on the last served tickets and is delivered on the first
try markedly less there than in the rest of the project (`runtime/src/profils/domaines.ts`: at least
`BRIGADE_PROFILE_MIN_TICKETS` tickets, 5 by default, out of the last `BRIGADE_PROFILE_WINDOW`, 20,
and at least `BRIGADE_PROFILE_GAP_POINTS` points below the average, 20), the runtime makes of it a **proposed
cook profile** (`profile.proposed`, `runtime/src/profils/proposer.ts`): a name drawn from the zone
(`app/src/vue` gives `app-src-vue`), the figures that justify it with its tickets, and what the
profile would contain — skills (none: nothing the log carries says which, you write
them), its perimeter (the zone) and a starting notebook: the project notebook's **promoted** lessons
whose retro names a ticket served in that zone (`#12`). `profils` carries it. A zone
has only one proposal at a time, and has none once its profile exists — accepted, or already defined
in the repository.

**A profile exists only if you say "yes"** (`runtime/src/profils/decision.ts`). A proposal
that nobody decides stays in `profils`, and nothing is born of it. Decided, it leaves it; it is
decided only once, and a second action, the same or the other, writes nothing.

| Your action | What happens |
|---|---|
| "yes" (`profile.accepted`) | the profile's definition is written into the project's repository, one file per profile: `.claude/brigade/profils/<name>.md` — its domain, its perimeter, its skills, the date of the "yes", the tickets that justified it, then its notebook in the project notebook's format. A definition already there is never replaced: the "yes" writes nothing, and the proposal still waits |
| "no" (`profile.refused`) | it leaves the queue. The "no" names the domain's tickets the log had served so far: **the domain is proposed again only if it crosses the thresholds again on other tickets** — the measure is redone as if those did not carry the zone. The same tickets, picked up again, do not bring it back |

## The measures report

The gates say "it works", never "it is getting heavy". The report sets side by side, **over
time**, what the log knows about the project's heaviness: it is the slope that reveals a drift.

`npm --prefix runtime run measures` shows them in slices of 10 merges; `-- --by 25`, of 25.

When a ticket among the last ten merges exceeds the drift's cost threshold (`BRIGADE_DRIFT_TICKET_TOKENS`,
declared only once), `measures` adds under the `FRANCHI` line one `motif de dérive` line per ticket:
the number of passes, the share of tokens lost to the return, and the returns restarted from zero for lack of a resume
(or "resumed returns"). A ticket passed once states its size in one go. Under the threshold, no reason.

| Column | What it says | Where it comes from |
|---|---|---|
| `merges`, `jusqu'au` | The slice: the rank of its merges, the day of the last. The axis is the **merge**, not the clock | `merge.done` |
| `tests`, `suite` | The number of tests and the duration of their suite, at the slice's last delivery | `MESURE tests`, `tests_s` |
| `gates` | The duration of a delivery's gates — median of the slice | `MESURE gates_s` |
| `part gates` | What the gates weigh in a delivery's time, returns and re-judgments included, relative to this duration plus that of its cooks | `gates_s`, `durationMs` of `cook.exited` |
| `dépôt`, `doc` | The weight of what is committed, and of its markdown | `MESURE depot_octets`, `doc_octets` |
| `contexte` | What **each** cook loads for certain: `CLAUDE.md` and its `@path` imports | `MESURE contexte_octets` |
| `seuils`, `plafond` | Under the tables: each declared threshold, `FRANCHI` or not; and the gates' duration cap, if it was crossed | `drift.configured`, `gates.overCeiling` |
| `fermeture` | Under the thresholds, when one is crossed: the closing is proposed, with the counter crossed and its threshold. Nothing is launched — the pass that writes remains the chef's action; the crossing is entered in the log only once (`drift.crossed`) | `drift.crossed` |
| `pente` | By how much the measure was multiplied, from the first slice shown to the last | — |
| `tours` (second table) | A ticket's turns, all its cooks counted, by calibration: median, and over how many tickets | `cook.launched`, `cook.exited` |
| `tokens` (third table) | A ticket's tokens, the sum of all its launches, by calibration: median, over how many tickets, and the costliest of the slice with its number. No threshold | `cook.launched`, `cook.exited` |
| `lancements` (fourth table) | One ticket per line, for those launched more than once or one of whose launches delivered nothing: how many launches — of which how many returns **resumed** from the previous cook's session —, their tokens, and what they produced — `utiles`, `perdus` with their share. No threshold | `outcome` and `tokens` of `cook.exited`, `resumes` of `cook.launched` |

- **`—` means "the log does not know", never zero.** Beyond twelve slices, only
  the last ones are shown; `--by` widens the window.
- **Costly or lost: it is the cook's end that says so.** A launch delivered when its `cook.exited`
  says `ok` — the end the station gives the cook whose work it sends to pass. Its tokens
  are `utiles`: the price of the delivery, the pass's returns included. Any other end (`failed`,
  `guard`, `stop`, `refused`, `neutral`), or no end at all — dead with the runtime —, and its
  tokens are `perdus`. A 650 k ticket of which everything is useful is costly; the same with 450 k lost
  is a defect. A launch whose tokens the log does not know is counted and flagged (`2, of which
  1 with no known tokens`), in neither of the two sums. A ticket never merged is not in the report,
  whatever its launches cost.
- **Resumed or restarted from zero: the `lancements` column says so.** A ticket one of whose returns resumed
  the previous cook's session carries `3, of which 1 resumed` (and the table's legend then says what
  `resumed` is); a ticket whose returns restarted from zero carries only its number. The
  resume changes nothing in the computation: a resumed launch that delivers is `utile`, lost otherwise, like
  any other.
- **Only the deliveries the pass judged, then merged, count**; the consumption is that
  of the cooks, not of the Max account. A delivery judged then merged by hand behind another does not
  tell the project's state, and no threshold is lifted on its word.
- The `plafond` line counts the whole log: the merged deliveries whose last gates
  crossed their duration cap. The pass does not judge it: it is followed here.

### What the gates declare

The gates **may** print `MESURE  <name>=<number>` lines — a name in lowercase letters, digits
and underscores, a number with a point or a comma, alone on the line. The pass picks them up with the
verdict (`gates.measures` of `pass.judged`, `base.checked`): twenty at most, the last value
of a name wins. They judge nothing. The report knows `tests`, `tests_s` (seconds),
`gates_s` (wall-clock seconds), `depot_octets`, `contexte_octets` and `doc_octets`; any other name
is kept in the log and ignored. This repository's `.claude/brigade/gates.sh` declares all six.

Two other names are read by **a closing pass's bilan**, and by it alone: `couverture`
(test coverage, as a percentage) and `verifications` (the number of checks the
gates run). They are its guardrails — see "A pass's bilan". Gates that do not
declare them leave these guardrails **not established**, never held; this repository's gates
do not declare them yet.

**One exception to the exit code, and only one: the duration cap.** Gates that give themselves
a cap and cross it write it on two lines — `durée des gates : <x> s de processeur …
pour un plafond de <n> s — … de trop`, then `FAIL  plafond des gates franchi : plus de <n> s de
processeur`. The pass keeps the overshoot (`gates.overCeiling`) and **does not judge it**: alone red,
it leaves the gates green. See "The gates' duration cap is not judged by the pass".

### The thresholds, and what warns you

A threshold is declared in the runtime's environment. **Only one has a default: the gates' duration**,
at `SEUIL_DUREE_GATES_PAR_DEFAUT` (`runtime/src/derive.ts`), 100 s — just above the 90 s the
gates hold on a quiet box; `BRIGADE_DRIFT_GATES_SECONDS` replaces it. It counts
the gates' execution, not the wait for their turn. The others, if not declared, signal nothing;
misspelled, the runtime refuses to start.
`BRIGADE_DRIFT_TESTS` (number of tests), `BRIGADE_DRIFT_TESTS_SECONDS` (suite duration),
`BRIGADE_DRIFT_GATES_SECONDS` (gates duration of the last delivery), `BRIGADE_DRIFT_CONTEXT_KB`
(context, in KB) and `BRIGADE_DRIFT_REPO_MB` (repository, in MB) are crossed when the measure
exceeds them; `BRIGADE_DRIFT_MERGES`, when the number of merges since the last closing
reaches it; `BRIGADE_DRIFT_GROWTH_PERCENT` — **the slope** —, when `tests`, `suite`, `dépôt`,
`contexte` or `doc` has grown by more than this percentage in ten merges.

Two thresholds concern **cost**, in tokens, over the last ten merges, and are set **by
the action**, not by a variable (`station seuil-ticket <integer>` and `station seuil-perdus <integer>`):
the ticket threshold — the tokens of the costliest ticket, all its launches counted — and the lost
threshold — the sum of the tokens of the launches that delivered nothing. Crossed when exceeded, named in the `drift` block with their value and
their threshold. **No default value**: it is the chef's quota. A crossed cost threshold is only
read — it turns nothing red, stops no cook and blocks no delivery.

One last signal concerns **the returns**: the share of tickets delivered on the first try (the measure of
`measures`, see "returns") over the last served tickets. Under the threshold, the `drift` block of `status`
adds a line — "4/10 tickets delivered on the first try (threshold 50%)". At or above the threshold,
or as long as the window is not full, nothing. It is set like the cost thresholds, by the action:
`station seuil-renvois <percentage>` (50 if unset) and `station fenetre-renvois <tickets>`
(10 if unset). It is only read, and writes neither `drift.crossed` nor a log line.

The thresholds enter the log when they change (`drift.configured`). When a merge makes
one crossed, the runtime writes `drift.crossed` and a line in `journalctl -u brigade@<project>`,
**once**; back under its threshold, or the threshold removed, `drift.cleared`. In between, the `drift`
block of `status` recalls it. Nothing is stopped, no issue is opened.
