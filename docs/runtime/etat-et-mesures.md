## The state of the kitchen

**The kitchen is a state, per project, on the box** — not a screen, and not the step of a ticket:

| The word | What it names |
|---|---|
| a project's **kitchen** | its state: `ouverte`, `retenue`, `arrêtée`, `éteinte` (open, held, stopped, off — "The state of the project", below). It is what `guardrails -- stop` stops and `resume` reopens (`kitchen.stopped`, `kitchen.resumed`) |
| **`en cuisine`** | the step of a ticket that a cook holds (`pris` on the rail, `taken`): in an epic's ticket list and in `pass` |
| **All projects** | the app's overview screen (`docs/app.md`). Closing the app stops no kitchen, and stopping a kitchen does not close it |

One command to know where the project stands, without opening the database:
`npm --prefix runtime run status` — followed by `-- --follow [<ticket>]`, it stays open and
adds one line per event.

The last line before the follow, `todo`, counts the cards that entered TODO over a period, by
kind (`product`, `design`): `-- --days <N>` sets it, 7 by default. A card refused at the door
(`todo.refused`), or entered before the two kinds, counts nowhere.

| Block | What it says |
|---|---|
| `nothing cooks` | **Very first line, absent otherwise.** The base is red and its repair ticket is working on it: `nothing cooks: base red since <duration> ago, repair #N in progress`. **Outside the `awaiting` block**: nothing waits for the chef during the repair. It disappears on return to green; a failed repair no longer carries it (the `base` line of `awaiting` replaces it). The app sets it on the project's tile |
| `fault` | **Absent unless the kitchen is idle with cards on the rail** (`runtime/src/cuisine-oisive.ts`). Above everything but `emergency` and `nothing cooks`: `fault      IDLE KITCHEN for <duration> — no cook has run, with <N> cards on the rail: #12, #14`. Four conditions hold together: cards are on the rail (`queued`, `BLOCKED` or `86`); no cook has run for **30 minutes** (`OISIVE_APRES_MS`) — none running, taken or in pass, the latest mark being the end of the last cook (pass reviews included), the runtime's start, the last service, or the project switched back on; the project is not off (runtime running, no "stop", switch on, not every station stopped); and not every card waits for a capability or a third party (`WAITING`, `no-station: …`, `station-absent: …`, or queued only behind such tickets). The cards named are those that should cook. When some await other tickets, the line names the **root of each wait chain**: `— wait chain: #44, #45, #46, #47 → #43 (off the rail, issue still open: label \`fire\` removed)` — the waiting cards, then the root and where it is; chains are separated by ` · `. The second relays this line at opening (`commands/po.md`) |
| `STUCK RAIL` | **Absent unless `fire` tickets have gone untaken by any manager for more than five minutes** (#3358, `runtime/src/rail-bloque/`), on a GitHub-only station only: no manager claim, no `model:` or `effort:` label, no manager comment. Right under the head of the `awaiting` block: `  STUCK RAIL  8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped. Start the station.` — the count, the time since `fire` was put on the oldest, the cause read from the account's station registrations (no station serves the project; stopped, offline, out of GitHub quota; the manager runs but takes nothing; not known), then the gesture when one exists. The tickets read with the station's `gh`; a read that fails says `not checked: …` on the same line. The app's `status`, its rail and the second's queue write the same sentence |
| `project` | The log's project, or `unknown — empty log` |
| `github` | **Absent unless GitHub limits the account's calls.** `GitHub is rate-limiting calls, back around HH:MM`, by the box's clock. See "The calls to GitHub, on the account's real quota, and waiting out the limit" (`station-machine.md`) |
| `github` (write budget) | **Absent unless the write pacer holds writes.** `held by the GitHub write budget — N of 450 in the last hour, next write at HH:MM`. GitHub refused nothing (#2226, `station-machine.md`) |
| `runtime` | `running according to the log`, `stopped <duration> ago`, or `never started`. A runtime killed without notice still appears running: the **age of the last tick** betrays it. Beyond a few cadences: `systemctl status brigade@<project>` |
| `kitchen` | The chef's "stop" and the breaker: `open` or `STOPPED by the chef <duration> ago`, then `breaker closed (… failures in a row, opens at N)` or `breaker OPEN for <duration>` |
| `connection` | **Absent while the Max connection holds.** Otherwise, per station: `Max MISSING` or `EXPIRED`, since when, the reason, and the gesture — `claude /login` under the service account; the kitchen resumes within the minute. No ticket is taken until then. See "Max connection expired" |
| `setup` | **Absent unless the project's setup is blocked.** `BLOCKED for <duration> on <commit>` — no setup is launched until the integration branch moves. Cause and gesture are in the `awaiting` block (`setup` entry). See "The worktree setup comes before the cook" |
| `base` | **Absent unless the base is red** (or its check is held because it cannot be fetched). Red, it holds the whole kitchen: since when, on which commit, the check that could not be played, the replay requested. With no request in progress, the last line is the gesture: `npm --prefix runtime run base -- replay`. See "The base is judged alone" |
| `backup` | The last successful backup (`backup.completed`): age, name, last event. `TOO OLD`: older than `BRIGADE_BACKUP_MAX_AGE_HOURS`. `NEVER DONE`: none in the log. Both: `systemctl status brigade-sauvegarde@<project>` |
| `awaiting` | **Always there**, from its `awaiting` line to its `end awaiting` line, **in English** (words from `docs/glossary.md`). Nothing awaiting: `nothing awaits the chef`. See "What awaits the chef" |
| `stuck` | **Absent unless a delivery is stuck in pass.** One line per card in pass, delivered and never judged, with **no active pass** for more than **15 minutes** (`COINCEE_APRES_MS`): `stuck      #644 in pass for 42 min with no active pass — delivered, never judged: \`brigade espace pass 644 --relaunch\``. A card whose own pass runs, that waits its turn, or delivered under 15 minutes ago is not listed. See "Relaunching a stuck delivery" ([`pass-merge.md`](pass-merge.md)) |
| `rail` | The count by state (`3 taken · 2 in pass · 6 queued · 2 BLOCKED · 4 86 · 1 WAITING · 1 served`, `empty` with no ticket), then each ticket in service order. A taken ticket carries two durations: since the taking, and **no progress** (`by box/claude since 5 min, no progress since 5 min, lease 5 min left`). `STUCK: ` when half its lease has passed with no progress, or the lease expired (`lease expired since 4 min`) and it is still taken. A `queued` ticket that does not leave says what it waits for and since when: `awaiting #18`, `zone held by #31 (…)`, `withheld by box/claude (…)`. `BLOCKED`: what it waited for was dropped (`#21 dropped (…)`) or frozen (`blocked by #36 (86 with no return time, not judged by the pass)`). **A ticket that waits, directly or step by step, for a `WAITING` ticket is `WAITING` too**: its line names the one it waits for and the one in `WAITING` on its own — `waits for #15 (WAITING, behind #14) — back on the rail on its own once it waits for no ticket in WAITING — since 2 min`. Nothing is written to the log. In pass or served: `since 3 d, cooked by box/claude`. An 86: `since 5 min (quota), back in 4 h 56`, `no return time`, or `back at the next tick`. A ticket in pass whose gates were cut on a saturated machine ends with `— gates replayed later: machine saturated, no test failing` |
| `cooks` | How many run (`3 running`, `none running`), and each station's cap with its source (`box/claude: 3 at most — 8 cores`, `box/playwright: 2 at most — declared`, `5 at most — set by you, replaces 3 (8 cores)`, `no limit — set by you, …`; see "Several cooks at once"). **A stuck cook is named** (`— 2 STUCK: #14, #22`). Below: `MACHINE SATURATED for … on <resources> — …` with each lacking resource, its level and threshold, and the memory threshold's source (`default: 10% of the machine's 32,050 MB`, `set by BRIGADE_MIN_FREE_MEMORY_MB`; see "The memory guard"); `<station> WITHHOLDING for …` with the reason; `ARBITER UNREACHABLE for …`. Then one line per cook, **the worst first**; judgments and reviews at the end, with no branch. Turns and tokens are those of the last reading, with its age (`12 turns of 100 · 184,000 tokens of 2,000,000 (reading 2 min ago)`, or `turns and tokens: no reading yet`); then what the cook is doing (`right now: reading runtime/src/etat.ts, since 2 min`). Runtime stopped: `… with no end in the log — runtime stopped: …` — a cook still listed died with it |
| `consumed` | What all launches together consumed — cooks, reviews, judgments — over `in flight`, `5 h` (the Max quota window), `24 h`: `8 launches, of which 1 review and 2 judgments · 64 turns · 825,000 tokens`, or `nothing` |
| `worktrees`, `drift`, `claude` | **Absent when nothing to say**: the worktrees the runtime could not tidy up ("What is left after a cook" in [`pass-merge.md`](pass-merge.md)); the measures that crossed a declared threshold ("The measures reading"); under partition, the last tidying of the transcripts ([`cloison-et-arbitre.md`](cloison-et-arbitre.md)) |
| `latest events` | The last fifteen, in the format of `run log`, without heartbeats or readings; `none` on an empty log |

### What awaits the chef

The kitchen never blocks on you: what awaits you piles up, the oldest first, and the rest
moves on. Each entry **names the gesture that unblocks it** — or says none is known — and leaves **on its own** once the log carries the decision, including on GitHub.
Closing a PR without merging it is only half a decision: the entry changes instead of leaving.
Only a product choice or a gesture only you can make enters it: a delivery still red, or
one the pass could not judge for a technical cause (`ci-silent`, `review-unreadable`,
`worktree-lost`…), stays on the rail, 86, and its line says what the kitchen does with it (`pass.md`, "A technical
escalation goes to the kitchen").

| Entry | The gesture | What removes it |
|---|---|---|
| `green delivery that touches its judges` · `… what the project opens up (<files>)` (`review-required`) | read it, then merge by hand. It enters only once reviewed end to end (second judge rendered, card let through by the triage), never when the pass takes it back after a `not weakened` (`pass.md`, "The merge card of a delivery to review") | likewise |
| `green delivery, merge refused by GitHub (…)` (`merge-refused`) | lift what GitHub refuses, then merge by hand | likewise |
| `escalated by the pass, which could not judge it (unjudged: secrets-unavailable)` | set the secrets, then remove and set `fire` again; or merge by hand, or remove `fire`. Detail: `run pass -- <ticket>` | the merge by hand; the ticket leaving or returned to the rail (`ticket.released`). Its PR closed without merge replaces it likewise |
| `PR closed without merge` | the ticket still holds its place: remove `fire`, or close the issue | the ticket leaving the rail, or returned to it if 86; the PR reopened then merged by hand. A re-split ticket does not enter |
| `no calibration` · `unreadable card` · `refused three times by the model` | an 86 **with no return time**: set `model:` and `effort:`, fix the card, or — refused — rephrase or recalibrate then remove and set `fire` again | calibrated or fixed, the station returns it to the rail; the ticket leaving the rail |
| `BLOCKED: #N dropped (…)` | put #N back on the rail, or remove it from the card's `attend` line | #N back (`ticket.arrived`); the card fixed (`ticket.changed`); the ticket leaving the rail |
| `back from WAITING, picked up again by the chef (it was waiting for <who>: “<what>”)` | a ticket picked up again by the chef's own gesture (`waiting resume`) — **never by its follow-up date, a new comment or a box update**: `/brigade arrived #<N>` on the Kitchen board sends it back to the kitchen; `waiting set <N> --what … --from …` puts it back to waiting; or remove `fire`. **A ticket in WAITING is never in this block** | "it has arrived" (`ticket.resumed`, `kitchen`); put back in WAITING; the ticket leaving the rail |
| ``set aside by the manager, it carries `question` `` · `` `decision` `` · ``held back, it carries `blocked-on-human` `` | answer, decide or lift the hold, then remove the label; or close the issue | the label removed; the issue closed (`manager.closed`) or launched by hand |
| `manager's judgment unreadable` · `manager's split unreadable` · `manager's question before splitting the epic` | edit the issue so it is picked up again, or answer the question on it; for a ticket, set `fire`, `model:` and `effort:` by hand; or close the issue | the issue edited, your answer, the issue closed or launched by hand; any later manager decision that sees no epic to split |
| `Max connection missing` · `expired` | the line carries the station, not a ticket: `claude /login` under the service account | the renewal (`session.restored`); the "resume" (`kitchen.resumed`) |
| `Max session close to its expiry` · `Max session renewal failing (<nature>)` | the line carries the session: `claude /login` under the service account, then `run guardrails -- resume`. See "The Max session: renewal and alert" | the next renewal; the "resume" (`session.reconnected`) |
| `Max connection token close to its expiry` · `… EXPIRED` · `Max connection token creation date missing` / `unreadable` | the line carries `token` — a single one, announced thirty days before expiry: remake it (`claude setup-token` under the service account). See "The long-lived token's expiry" | the token remade (`token.observed`) |
| ``BASE RED on <commit>, failing: <what fails> — its repair #N <what it became>`` | the line carries `base`, counted **since the turn to red**. **Only if the repair failed** (left the rail without service, passed up, or merged without putting the base back to green); a replay or a repair that opens or works is not your burden. Fix the base by hand — the pass replays it when it moves; or relaunch the unserved repair (set `fire` again); a red not down to the code: `run base -- replay` | the base back to green (`base.checked`): the kitchen restarts; the repair relaunched |
| ``setup impossible: the door refuses `<host>` (…)`` · ``setup impossible: `.claude/brigade/worktree-setup.sh` fails twice identically (<reason>)`` | the line carries `setup` — **a single one for the project**, counted since `setup.blocked`. A refused host is declared in `.claude/brigade/reseau`, one line per host, merged on the integration branch; otherwise fix the setup, then merge — the entry names the issue | the integration branch moving (`setup.unblocked`). The same failure on the new base brings it back |
| ``tickets put aside: <cause> (<reason>, twice identically) — only one is taken again at a time…`` | the line carries `aside` — **a single one for the project**: cause, ticket and gesture; it falls when a cook leaves, another cause appears or the integration branch moves |

**The block is always there, and it has an edge.** When nothing awaits you, it reads `awaiting   nothing awaits the chef`, then `end awaiting`.

A rail with only WAITING cards is empty for the kitchen, and that is normal (`rail       empty — 2 WAITING, normal: nothing on it for a cook`, no `fault` line). Cards a cook could take, with no cook running for 30 min, are a fault.

**A held kitchen enters the block, once** (#2281, `runtime/src/retenue/`). When **nothing has been served for 30 minutes**
(`RETENUE_APRES_MS`) while tickets wait for the kitchen — claimable, or in pass; not those that wait for you, a third
party or another ticket —, the runtime writes `kitchen.held` to the log and the block gets one entry:
`  kitchen  for 42 min  HELD: nothing served while 2 tickets wait (#12, #13) — cause: … — to lift: …`. The 30 minutes
count from the latest of: the last service, the kitchen's opening (runtime start, project switched back on), and the
moment the waiting tickets started to wait. The cause is the first that holds of: the breaker (`to lift:` its `Resume`
button), the GitHub limit or the box's reserve for your gestures, the GitHub write budget (both say `nothing to do: it
lifts on its own around HH:MM`; the limit stays the cause **while the station's counter still records refused calls**
in the last five minutes, even once the `backAt` GitHub announced has passed: `calls still refused at HH:MM, whatever
the HH:MM announced`, #2429), the red base with its failing checks named (`to lift: fix the base by hand…`), on the
GitHub-only state the deliveries in pass whose PR head has no concluded CI (#2456: `cause: 2 deliveries in pass wait for
a CI on their PR head (#757, #759), and no check has started there — to lift: check that the project's CI runs on its
PRs…`, or `still running: brigade/gates — nothing to do`), the tickets' own reasons (#2429: `#2187 waits on #2186, set
aside: <reason>`, on the old path's rail and on the GitHub-only turn, where the claim gate reads the card's `attend` and
the set-aside ticket's last station comment; `#2383 is claimable but not claimed, the claim gate skipped it: zone held by
#N`, `capability missing…` or `its calibration (model, effort) is incomplete`; the gate does not claim a ticket that
waits on a set-aside one, `served-elsewhere` or `blocked-on-human`), or `cause unknown`, with no gesture — only when none of
these applies. Later passes of the same hold write nothing; a new cause rewrites the entry, keeping
its start. When the kitchen serves again — or nothing waits any more, or you stop the kitchen —, `kitchen.hold-lifted`
is written and the entry leaves the block. On the old path the waiting tickets are read from the rail; on the
GitHub-only state from what the station's round reads on GitHub (its tickets, the base's checks, its merges). The
GitHub limit and the write budget are read from the station's call counter (`BRIGADE_STATION_DIR`), not on the dev
workstation. A red base is not announced at once (`runtime/src/retenue/relance-base.ts`, #2283): the failed jobs of the base are re-run once per hold, and `kitchen.held` (hence the entry and the Telegram alert) is written only if the base is still red after the re-run; the other causes re-run nothing. The station's service log says each transition (`kitchen held — …`, `kitchen no longer held (served)`).

The block starts at the **only line that starts with `awaiting`** and ends at the **only
line exactly `end awaiting`**, bounds included; between them everything is
indented — an entry is two spaces in. Whoever presents it separately — the app, the second (the PO role, `commands/po.md`) — takes it by these two lines. **The app reads one thing besides**, to sort its rail: the
ticket number **at the head** of an entry — two spaces, `#`, digits, two spaces (`  #12  for 2 d  …`). This
head does not change without the app changing (`docs/app.md`, "The rail"); an entry
that carries a station, `session`, `token`, `closing`, `base`, `setup`, `aside`, `breaker` or `kitchen`, has none. Under `--follow`, later events
are not part of the block.

**The block is in English** (words of `docs/glossary.md`, §2 and §4); what is between backticks keeps its name. A box from before still writes `attend` … `fin attend` in French: the app and the second read both.

- **Not counted**: a ticket re-split by the manager; an 86 with a return time; what waits without you (`STUCK`, `WITHHOLDING`, `MACHINE SATURATED`, the `base` block); the manager's other deviations, read in `run manager`.
- **What the manager awaits from you**: closing the issue is enough (`manager.closed`). Manager off, nothing is polled.

The command reads `$BRIGADE_STATE_DIR`, never writes, and answers while the runtime runs; on an older log it asks to restart the runtime (code 1). `BRIGADE_BACKUP_MAX_AGE_HOURS`: whole hours, 1 at least, `48` by default, read in the environment of whoever runs `status`; badly written, refusal (code 2). Nothing alerts outside `status`.

### Facts, for a program

`status` and `rail` are written for you. A program that draws — the app: one
pill per project, five counters, the rail — must deduce nothing from a sentence. It reads
`brigade <project> facts` (`npm --prefix runtime run facts` on the dev workstation): **the reading of
`status`, put otherwise** — the same projections, read once; no port, no
API, no second truth. It takes no argument, and reads and answers like `status`.

**This shape is a contract.** A JSON object, on a single line; its fields, their order, its
words do not change without its reader changing, and `runtime/test/faits.test.ts` freezes it to the
character. Everything else the runtime says is text, and may be rephrased.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":1,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/benomite/brigade/issues/14","activite":{"fait":"lit","faitEn":"reading","cible":"runtime/src/etat.ts","depuis":"2026-10-12T10:01:11.000Z"},"attente":null},{"ticket":21,"etat":"BLOQUÉ","titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21","activite":null,"attente":null}],"cooks":[{"ticket":14,"titre":"Le journal en ajout seul","station":"box/claude"}],"attend":[{"ticket":21,"titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21"}],"livres":[{"ticket":216,"titre":"Le relevé des mesures","url":"https://github.com/benomite/brigade/issues/216","livre":"2026-10-12T10:03:58.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/219","relecture":{"resume":"Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.","constats":[{"gravite":"remarque","fichier":"runtime/src/mesures.ts","constat":"Le seuil par défaut est répété dans deux fichiers."},{"gravite":"remarque","fichier":null,"constat":"À supprimer : l'ancien compteur, qui ne sert plus."}]}},{"ticket":201,"titre":"Les grants sous plafond","url":"https://github.com/benomite/brigade/issues/201","livre":"2026-10-12T07:12:40.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/207","relecture":{"resume":"Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.","constats":[]}},{"ticket":188,"titre":"Une fiche sans zone","url":"https://github.com/benomite/brigade/issues/188","livre":"2026-10-11T16:30:05.000Z","station":"box/claude","pr":null,"relecture":null}]}
```

(Field names and values — `ouverte`, `pris`, `BLOQUÉ`… — are the contract's and stay in French.
Titles, summaries and findings are ticket and reviewer text.)

| Field | What it carries |
|---|---|
| `etat` | The project's state, one word of the closed list below |
| `lu` | The box's time at the reading |
| `dernierTick` | The last tick of the running runtime. `null`: runtime stopped, or no tick since its start |
| `compteurs.rail` | The queued tickets, `BLOQUÉ` included |
| `compteurs.auTravail` | The `pris` (taken) tickets |
| `compteurs.aLaPass` | The `en pass` (in pass) tickets |
| `compteurs.attend` | The decisions that await you: the figure on the head line of `status`'s `awaiting` block |
| `compteurs.livres24h` | The tickets served in the 24 h before `lu` (merged by the pass, by hand, or served without merge), still on the rail or not; each counts once |
| `dernierEvenement` | `seq`, `at`, `type` and `ticket` (`null` off ticket) of the last of `status`'s "latest events", without payload. `null` on an empty log |
| `rail` | Each ticket, in service order: `ticket`, `etat`, `titre`, `url`, `depuis` (when it entered its current state; **for a Taken ticket, the start of its stay in the column**, kept across relaunches after `cook.exited` or `cook.interrupted`), `essais` (**Taken only**: the attempts of that stay, oldest first, each `depuis`, `jusqua` (`null` while it runs), `arret` (the guard's reason — `duration`, `tokens`, `idle`, `lease`… —, the cook's outcome — `failed`, `ok`, `neutral`… —, the kitchen's stop — `stop`, `move` —, or `interrupted`; `null` for the current one) and `enCours` (`true` for the current one only)), `activite` — what the kitchen is doing with it now: `fait` (in French), `faitEn` (in English; `thinking` reads `in the kitchen`; absent from an older runtime), `cible` (file or command, `null` if none), `depuis`; **`null` for a ticket neither taken nor in pass, and when unknown** (see "What a cook is doing right now"); `attente` — for a ticket set aside (86), **what it waits for**: `raison` in plain words (`attend : setup du projet impossible`…), `colonne` (like `etat`) and `retour` (`null` without) — and for a queued ticket in `WAITING` behind one that is, `raison` names it, `colonne` `WAITING`, `retour` `null`; `null` otherwise; `tiers` — for a WAITING ticket, **what it awaits from a third party**: `quoi`, `qui`, `depuis`, `relance` and `aLArrivee` (what "it has arrived" will make of it); `null` otherwise. **A ticket set aside `no-station` is read as WAITING too**: `etat` and `attente.colonne` say `WAITING`, `quoi` says ``a station that provides `<capability>` — attach one to the project``, `qui` `a human, the chef`, **`relance` is `null`**, and `aLArrivee` says it returns to the rail by itself once a station provides the capability. It stays 86 in the log; `revenu` — for a ticket come back from WAITING into TODO, **why** (`relance du 21/10 : pas de réponse`); `null` otherwise and when the chef picked it up; `raison` — **for the ticket at the top of the queue only**, why it does not leave (`zone held by #12 (runtime/src)`, `awaiting #7`, `machine saturated`); `null` otherwise; `captures` — **for an interface ticket in pass or served**, the screens of its last delivery (see "Looking at an interface delivery in my browser"): `complet` (each screen has both captures) and `ecrans`, each with `ecran`, `avant` and `apres` (capture address at the delivered commit, `null` if not delivered). **Absent for any other ticket**, and when the box does not know its repository |
| `cooks` | The cooks in progress, as `station` shows them, in its order: `ticket`, `titre` (the rail's, `""` if the ticket left it), `station`. Empty when none runs |
| `attend` | The tickets `status`'s `awaiting` block names, in its order: `ticket`, `titre`, `url` (the rail's, otherwise from **the box's repository** `BRIGADE_GITHUB_REPO`; `null` if unknown). The title is the rail's, **`""` for an issue not on it**. Entries that belong to no ticket (Max connection, version, closing pass, red base, blocked setup) are not in it — `compteurs.attend` counts them. Empty when nothing awaits |
| `livres` | The tickets served in the 24 h before `lu` — **those `compteurs.livres24h` counts, one for one** —, most recent first: `ticket`, `titre`, `url`, `livre` (service time), `station` (the one that cooked it, `null` when none sent it to the pass), `pr` (merged PR, `null` if served without merge), `relecture` (what the reviewer said of **what was served**, word for word: `resume`; `constats`, each with `gravite` — `remarque` or `bloquant` —, `fichier` (`null` if none) and `constat`; a requested deletion is a `remarque` starting with "À supprimer : "). `relecture` is `null` when no readable review concerns the served delivery (merged by hand without the pass, served without review, reviewed on an earlier commit, last review unreadable) — **nothing is put in its place**. A red review merged by hand carries its blocking findings. **A ticket stays in it after its issue is closed**, reread in the log (title is the day's, `""` if the rail never carried it; `url` from the repository, or `null`). **An issue closed without being served is not in it**. `captures`: as on the rail. Empty when nothing was served in 24 h |
| `cuisineOisive` | The `fault` line of `status`: `depuis` (the mark the idleness is counted from) and `cartes` (the tickets that should cook, in rail order). `null` unless the four conditions hold. Between `retenues` and `stations` |
| `stations` | The declared stations, by name, and what they do with **ordinary tickets** (see "Ordinary tickets on the chef's workstation"): `station`, `distante`, `plafond` (cooks at most, `null`: no limit), `ordinaires` (the chef's setting, `false` for a box station), `ensemble` (`true`: a remote station declared `distante+ensemble`, taking ordinary tickets alongside the box; `false` for a box station), `bacASable` (the station's sandbox report: `disponible`, `raison`, `version` of its `claude`, `depuis`; `null` while it said nothing), `prendOrdinaires` (it takes some now: always true for a box station; for a remote one, the setting and an available sandbox, and unless `ensemble`, only when the box is saturated); then, see "Starting and stopping the kitchen, station by station" in [`station.md`](station.md): `cuisson`, a closed list — `refused` (this machine's station refuses the project, read in its `en-service` file through `BRIGADE_STATION_DIR` and `BRIGADE_PROJECT`; box only), `stopped` (`station stop`, or the whole kitchen stopped), `saturated` (box only), otherwise `cooking` —, first true wins; `arreteeDepuis` (time of its `station stop`, `null` without or under the whole-kitchen "stop"); `refus` (`{ status, code, message, action }` of [`station-machine.md`](station-machine.md); `null` outside `refused`); `cooks` (its cooks in progress, oldest first); `fournit` (what it declares it provides), `presente` (the main station sees it: always `true` for a box station; a remote one has shown itself and not gone quiet — an absent one takes no ticket), `vueLe` (its last request, `null` for a box station or a remote one never seen). Empty when none is declared |
| `agents` | What the kitchen runs right now **besides the ticket cooks** (#1971; `runtime/src/agents-en-cours.ts`), the pass first in rail order, then the manager, the triage and the closer in start order: `role` (`pass`, `manager`, `triage` or `closer`), `station` (the project's first non-remote station — the main station —, `null` when none), `ticket` (the one it judges, splits or triages, `null` for the closer), `fait` (what it does, in English: for the pass, its working phase as the rail card says it — `running the gates`, `review in progress`, `judging`, `merging`; a delivery that waits for the pass, for its gates cut on a saturated machine, or for you does not run it; for the manager, from its run's prefix — `qualifying the issue`, `splitting the epic`, `deciding what follows a red ticket`, `re-reading a held issue`, `judging`; `triaging the card` for the triage; `closing: cleaning up the project` for the closer) and `depuis` (when it started, at the box's clock). The manager's and the closer's are their launches with no end in the log (`cook.launched` under the station `manager` or `closer`); the reviewer and the second judge are the pass's. Empty when nothing runs, and when the runtime is stopped |
| `triage` | What the triage did each of the last seven days (UTC), oldest first, today last — always seven entries: `day` (`YYYY-MM-DD`), `decidedAlone` (cards it settled itself) and `sentToTodo` (cards it let into TODO). A card sent back to it counts for neither. From `todo.triaged`. Absent from an older runtime |
| `activiteCuisine` | The last hour and day, each window up to the read: `lastHour` and `lastDay`, each with `served` (merged, or served without a diff), `sentBack` (`pass.returned`, by the pass, manager or chef) and `escalated` (`pass.escalated`, except a ticket the manager split again). Counts are in tickets (sent back twice in the hour: one). Project facts only (`BRIGADE_PROJECT`, else the last event's project). No activity: six `0`. From `runtime/src/activite-cuisine/comptes.ts`; the app's Cooks tab shows the six numbers. Absent from an older runtime |
| `cadence` | `hours` — 24 entries, oldest first, each a whole UTC hour, the last in progress — each with `at`, `served` (`ticket.served`, `merge.done`; a ticket counts once, in the first hour served) and `failed` (each red `pass.judged` plus each `cook.exited` with outcome `failed`, `guard` or `stop`, one for one); an empty hour is `0` and `0`. `medianSeconds` — `taken` and `pass`: the median stay in each state over the stays that started and ended in the 7 days before the read; **`null` below 3 stays**. Project facts only. From `runtime/src/activite-cuisine/cadence.ts`; the app draws `hours` as a histogram and marks a Taken or Pass card older than twice its column's median. Absent from an older runtime |
| `rolesCuisine` | All kitchen roles, in this order: `manager`, `pass`, `reviewer`, `second judge`, `triage`, `closer` — each with `role`, `does` (one line) and `latest`: `what` (a short sentence composed from the fact's fields — `merged #12`, `reviewed #31: red, 2 findings` —, never command output nor free model text), `ticket` (`null` for a fact on no ticket) and `at`. **`latest` is `null` for a role that has not acted.** Facts per role: the manager's judgments, set-asides, reactions, splits, re-reads; the pass's verdicts, merges (`by: pass`), served-without-diff, and its own returns, escalations and deferrals (author `pass`); the reviewer's reviews (`pass.reviewed`); the second judge's verdicts; the triage's actions (`todo.triaged`, except `back`); the closer's starts and ends. Project facts only. From `runtime/src/roles-cuisine/roles.ts`; shown under the Cooks tab's calibration ceiling. Absent from an older runtime |
| `coutDesGates` | What the gates cost against the budget (see "The cost of the gates, and its budget"; `runtime/src/cout-des-gates.ts`): `budget` — `durationSeconds`, `cpuSeconds`, `parLeChef` (`durationSeconds`, `cpuSeconds`: `true` if set by the chef); `latest` — the last gate run, `null` if none: `project`, `ticket` (`null` for the base), `runner` (`pass` or `cook`), `outcome` (`green`, `red`, `timeout`), `durationSeconds`, `cpuSeconds` (`null` if cut), `at`; `overBudget` — `true` when the last run exceeds the budget; `lastDay` and `lastHour` — `runs`, `durationSeconds`, `cpuSeconds` (no CPU counts 0); `averages` — `lastHour` and `lastDay`, one run's average (`durationSeconds` over all runs, `cpuSeconds` over those that said their CPU; `null` when none); `trend` — `durationSeconds` and `cpuSeconds`: last hour's average against the day's, `up` or `down` past 10 % (`ECART_DE_TENDANCE`), else `steady`, `null` if an average is missing. Project runs only. Also `base` and `ticket` (see that section). Absent from an older runtime |
| `github` | The limit GitHub imposes on the account, the same for every project of the station (#2144; `runtime/src/github-limite.ts`): `limit` (`primary`, `secondary-writes`, `secondary-concurrency`), `since` and `backAt` (ISO, from the refusal's headers). Absent when calls pass; it leaves once `backAt` has passed and a call succeeds (see `station-machine.md`, "Which limit") |
| `apprentissage` | What the cooks taught the project (`runtime/src/apprentissage/projet.ts`), from `BRIGADE_PROJECT` and `BRIGADE_REPO_DIR`: `lecons` — each `id`, `texte`, `statut` (`provisoire` from the log, `promue` from the repository's notebook), `date`, `tickets` (whose retro proposed or reconfirmed it), `origine` (`{ "kind": "retro" }`, `{ "kind": "pass-send-back", "ticket": N }` or `{ "kind": "chef-correction", "ticket": N }` — [`carnet-lecons.md`](carnet-lecons.md), "The notebook format"), `cooks` (how many received it, per `lessons` of `cook.launched`), `progres` and, for a promoted one, `url` (its notebook line on the integration branch; absent without `BRIGADE_GITHUB_REPO` or `BRIGADE_BASE_BRANCH`) — and `profils` — each `nom`, `domaine`, `carnet` (`id`, `texte`, `etat`, `origine`), `tickets`, `progres`. `progres` (`apprentissage/progres.ts`): `{ avant, apres }`, merged tickets taken before, then from the day the lesson entered (`date`) or the profile was accepted — each `{ retenus, premiers, premierCoup (0 to 1), essaisMoyens }`, measured like `measures`. **A side with no merged ticket is `null`**. **Absent when the project has neither lesson nor profile**, or its notebook or a definition is unreadable |

Times are ISO 8601, UTC.

**The state of the project** — the first true one wins:

| Word | When | What `status` says of it |
|---|---|---|
| `éteinte` | (off) the runtime is stopped, or never started, according to the log | `runtime    stopped … ago`, `never started` |
| `arrêtée` | (stopped) your "stop" | `kitchen    STOPPED by the chef …` |
| `retenue` | (held) running, but nothing leaves: breaker open, Max connection missing or expired, no station declared, red base, project setup blocked with no remote station | `breaker OPEN`, the `connection` line, `stations   NONE DECLARED`, `base       RED since …`, `setup      BLOCKED` |
| `ouverte` | (open) none of the above | |

**The state of a ticket**: the word `rail` and the shape write — `en attente`, `BLOQUÉ`, `pris`,
`en pass`, `servi`, `86`. `status` writes them in English: `queued`, `BLOCKED`, `taken`, `in pass`, `served`, `86`.

These two lists are **closed**: a reader sets a color on them. They may
gain a word; a reader shows an unknown word as is, without color. The `type`
of the last event is displayed, not interpreted: its list is not closed.

What the shape does not say:

- **`ouverte` says what the log says.** A runtime killed without notice still appears to be running;
  the reader displays the gap between `lu` and `dernierTick`.
- **No gauge, no percentage** — neither quota nor machine. The runtime does not know the account's
  consumption (`/usage` gives it). A cook has no gauge either: turns, duration and tokens are in `status`.
- **The reviewer's reviews and the manager's judgments** are not in `cooks`.
- **An `86` with a return time** — the quota — is in none of the five counters. It is in `rail`, with its state.
- **Why** the kitchen is held, what a ticket awaits, who holds it, since when: that is
  `status`. The log, the partition, the arbiter have no shape; of the station, only
  its cooks in progress have one.

### A profile at dispatch

A profile is a **preference, never a constraint** (`runtime/src/profils/preference.ts`). When
launching a ticket's cook — here or remote, first cook, resumption or send-back —,
the runtime rereads `.claude/brigade/profils/` and looks for
profiles whose domain touches the card's zone (one owns the other, as for zones): the
most precise first (most segments), then by name. The first **whose cook is free**
wins: the cook starts under that profile and receives, after the project's lessons, the profile's notebook —
its name, its file, and its **promoted** lessons, each with its id.

A profile's cook is **one at a time**: busy while a cook launched under it runs
for this project. Busy, or if no profile touches the zone, **the ticket does not wait**: it goes
at once with a generalist, without a notebook. The profile holds no station: only the capability does. An unreadable definition is discarded, and
named on the runtime's error output.

The log says it at launch: `profile.notebook-given`, with `run` (the
cook), `name` and `zone`, `file` and
`lessons` (the ids given — `[]` for an empty notebook). A generalist has none.

### No Kitchen board

No runtime writes a Kitchen board any more (#2061): the app's rail view and TODO read the project's issues,
labels and PRs on GitHub ([`github-seul.md`](github-seul.md)). The old board issue (#1683, label `kitchen-board`)
is no longer refreshed and can be closed.

## The measures reading

The gates say "it works", never "it is getting heavy". The reading sets side by side, **over
time**, what the log knows of the project's heaviness: the slope reveals a drift.

`npm --prefix runtime run measures` shows them in slices of 10 merges; `-- --by 25`, of 25. Since #2707 the merges
are the first-parent commits of the clone's integration branch (`BRIGADE_REPO_DIR`, `origin/BRIGADE_BASE_BRANCH`,
the last 100, not fetched), and their cooks what the GitHub-only cooks' streams say (`<state>/github-seul/`): the
log no longer sees a merge since #2061. A GitHub-only delivery declares no gates measure, so those columns stay empty.

At the end, `measures` adds the CI duration of the last 10 merged PRs (`runtime/src/measures/ci-duration.ts`, from `BRIGADE_GITHUB_REPO`): per merge, the start of the first check of the merge commit to the end of the last, then the median beside the 60 s target, and the worst. A merge over target is marked `OVER TARGET`. With fewer than 10 merges, or a failed GitHub call, the section is one line saying so; nothing else changes.

After the tables, `measures` gives the `retries` and `failures` blocks of the last
merged tickets (`--last <n>`, 20 by default): the share delivered on the first try, the attempts per ticket, and
the cause of each failed attempt. They are read from `.claude/brigade/temps-tickets.json` of the clone
(`BRIGADE_REPO_DIR`), not from the log, which no longer sees a merge since #2061: at each merge the station reads
the ticket's issue on GitHub and writes its quality with its time (`qualite`, `runtime/src/qualite-github.ts`,
#2707) — a `brigade:renvoi` comment is a delivery sent back to a cook, with its reason, classed by the words the
station writes it with (`RAISONS_DE_RENVOI`, shared by both) — for a red CI, by the failed steps it names when it
names them (#3028), else by the names of the red checks —, a `brigade:echec` comment a cook without a delivery,
whose free-text reason is not classed (`other`), and a `prio:0` ticket with a `brigade:base-rouge` mark a repair of
main, with the checks its body names. After each merge, the station also gives their quality to up to 10 recent
tickets recorded without one (merged before #2707, or whose issue GitHub did not return), in place; until then such
a ticket is not counted, never counted as a first try.

Before it, `measures` gives two lines on the GitHub account over the last 7 days (`runtime/src/mesures-github.ts`): the rate-limited minutes and the peak writes per minute. The GitHub call layer notes each write as it leaves, once the pause has passed, and each limit episode GitHub declares (every minute from `since` to `backAt` counts), in `<BRIGADE_STATION_DIR>/appels-github/minutes.db`, next to the counter. Nothing noted reads as 0 and 0; a minute older than 7 days is forgotten.

When a ticket among the last ten merges exceeds the drift's cost threshold (`BRIGADE_DRIFT_TICKET_TOKENS`),
`measures` adds under the `CROSSED` line a `reason for the drift —` line per ticket:
the number of passes, the share of tokens lost to the send-back, and the send-backs restarted from zero
(or "retries resumed"). A ticket passed once says its size in one go. Under the threshold, no motif.

| Column | What it says | Where it comes from |
|---|---|---|
| `merges`, `up to` | The slice: the rank of its merges, the day of the last. The axis is the **merge**, not the clock | `merge.done` |
| `tests`, `test suite` | The number of tests and the duration of their suite, at the slice's last delivery | `MESURE tests`, `tests_s` |
| `gates` | The duration of a delivery's gates — median of the slice | `MESURE gates_s` |
| `gates share` | What the gates weigh in a delivery's time, send-backs and rejudgments included | `gates_s`, `durationMs` of `cook.exited` |
| `repo`, `docs` | The weight of what is committed, and of its markdown | `MESURE depot_octets`, `doc_octets` |
| `context` | What **each** cook loads for sure: the `CLAUDE.md` and its `@path` imports | `MESURE contexte_octets` |
| `thresholds`, `cap` | Under the tables: each declared threshold, `CROSSED` or not; and the gates' duration cap, if crossed | `drift.configured`, `gates.overCeiling` |
| `closing` | When a threshold is crossed: the closing is proposed, with the crossed counter and threshold. Nothing is launched — the pass that writes remains the chef's gesture; the crossing is logged once (`drift.crossed`) | `drift.crossed` |
| `slope` | By how much the measure was multiplied, from the first slice shown to the last | — |
| `turns` (second table) | A ticket's turns, all its cooks counted, by calibration: median, and over how many tickets | `cook.launched`, `cook.exited` |
| `tokens` (third table) | A ticket's tokens, summed over its launches, by calibration: median, tickets, and the most expensive of the slice with its number. No threshold | `cook.launched`, `cook.exited` |
| `launches` (fourth table) | One ticket per line, for those launched more than once or with a launch that delivered nothing: how many launches — of which send-backs that **resumed** the previous session —, their tokens, and `useful` or `lost` with their share. No threshold | `outcome` and `tokens` of `cook.exited`, `resumes` of `cook.launched` |

- **`—` means "the log does not know"**, never zero. Beyond twelve slices, only
  the last are shown; `--by` widens the window.
- **Expensive or lost: the cook's end says so.** A launch delivered when its `cook.exited`
  says `ok`; its tokens are `useful`, send-backs included. Any other end (`failed`,
  `guard`, `stop`, `refused`, `neutral`), or none, and its
  tokens are `lost`. A ticket at 650 k all useful is expensive; the same with 450 k lost
  is a defect. A launch with unknown tokens is counted and flagged (`2, of which
  1 with unknown tokens`), in neither sum. A ticket never merged is not in the reading.
- **Resumed or restarted from zero:** `3, of which 1 resumed`; only the number when restarted from zero. A resumed launch that delivers is `useful`, lost otherwise.
- **Only the deliveries the pass judged, then merged, count**; the consumption is
  the cooks', not the Max account's. A delivery merged by hand behind another says
  nothing of the project's state.
- The `cap` line counts the whole log: the merged deliveries whose last gates
  crossed their duration ceiling. The pass does not judge it.
- There is no `flaky` block any more (#2707): it counted the CI reruns of the log's pass
  (`pass.ci-rerun-passed`), which nothing writes since #2061.

### What the gates declare

The gates **may** print `MESURE  <name>=<number>` lines — a lowercase name (letters, digits,
underscores), a number with a point or a comma, alone on the line. The pass picks them up with the
verdict (`gates.measures` of `pass.judged`, `base.checked`): twenty at most, the last value
of a name wins. They judge nothing. The reading knows `tests`, `tests_s` (seconds),
`gates_s` (clock seconds), `depot_octets`, `contexte_octets` and `doc_octets`; any other name
is kept in the log and ignored. This repository's `.claude/brigade/gates.sh` declares all six.

Two other names are read by **a closing pass's tally** alone: `couverture`
(coverage, %) and `verifications` (number of checks run). They are its guardrails — see "The summary of a pass". Gates that do not
declare them leave these guardrails **unestablished**, never held.

**One exception to the exit code: the duration ceiling.** Gates that give themselves
a ceiling and cross it write it on two lines — `durée des gates : <x> s de processeur …
pour un plafond de <n> s — … de trop`, then `FAIL  plafond des gates franchi : plus de <n> s de
processeur`. The runtime reads these two lines, so they stay French. The pass keeps the overrun (`gates.overCeiling`) and **does not judge it**: alone red,
it leaves the gates green. See "The gates' duration cap is not judged by the pass".

### Thresholds, and what warns you

A threshold is declared in the runtime's environment. **Only one has a default: the gates' duration**,
`SEUIL_DUREE_GATES_PAR_DEFAUT` (`runtime/src/derive.ts`), 100 s;
`BRIGADE_DRIFT_GATES_SECONDS` replaces it. It counts the gates'
execution, not the wait for their turn. Undeclared, the others signal nothing;
badly written, the runtime refuses to start.
`BRIGADE_DRIFT_TESTS` (number of tests), `BRIGADE_DRIFT_TESTS_SECONDS` (suite duration),
`BRIGADE_DRIFT_GATES_SECONDS` (last delivery's gates duration), `BRIGADE_DRIFT_CONTEXT_KB`
(context, KB) and `BRIGADE_DRIFT_REPO_MB` (repository, MB) are crossed when the measure
exceeds them; `BRIGADE_DRIFT_MERGES`, when the merges since the last closing
reach it; `BRIGADE_DRIFT_GROWTH_PERCENT` — **the slope** —, when `tests`, `test suite`, `repo`,
`context` or `docs` has grown by more than this percentage in ten merges.

These thresholds, the cost ones below, `BRIGADE_CORRECTION_*` and `BRIGADE_PROFILE_*` can also be
set by the project in `.claude/brigade/projet.json` (`drift`, `correction` and `profile`, see
[`../reglages.md`](../reglages.md)); the file's value wins over the box's, key by key.

Two thresholds concern **cost**, in tokens, over the last ten merges, and are set
**by gesture** (`station seuil-ticket <integer>` and `station seuil-perdus <integer>`):
the tokens of the most expensive ticket, all its launches counted, and the tokens of the launches that delivered nothing, summed. Crossed when exceeded, named in the `drift` block. **No default**: it is the chef's quota. A crossed cost threshold is only read
— it turns nothing red, stops no cook and blocks no delivery.

One last signal concerns **send-backs**: the share of tickets delivered on the first try over the last merged tickets
whose quality is recorded with their time (see "The measures reading", #2707). Under the threshold, `status`'s `drift` block
adds a line — "4/10 tickets delivered on the first try (threshold 50%)". At or above it,
or while the window is not full, nothing. Set by gesture:
`station seuil-renvois <percentage>` (50 by default) and `station fenetre-renvois <tickets>`
(10 by default). It is only read, and writes neither `drift.crossed` nor a log line.

Thresholds enter the log when they change (`drift.configured`). Whether a merge makes one
cross is no longer read from the log, which has not seen a merge since #2061: the closer's pass
reads it on the clone and leaves it in `<state>/derive-github.json`, with the merges since the
last closing (`closer-github-passe/derive-github.ts`); `status`, `closing` and its reading for the
app read that file (#2707). Nothing is stopped, no issue is opened.

### The cost of the gates, and its budget

**Each run of a project's gates writes what it cost** to the log, `gates.ran`
(`runtime/src/events/gates.ts`): the project and ticket in its envelope (none for the base's gates),
`runner` (`pass`, or `cook` — written at the end of the cook, see "The cook's gates
reach the log" in [`station.md`](station.md)), `outcome`, `durationMs` — the
wall-clock time of the gates script, worktree setup not counted — and `cpuMs` — user + system CPU
of the script **and every process it waited for**. Gates cut at their cap, or by the runtime stopping, lose their CPU: `cpuMs` is `null`.
A setup that fails launches no gates and writes nothing.
`tree` and `config` fingerprint what the run judged: the pass reuses a green run on the same fingerprint instead of playing its
gates, and that reuse writes **no** `gates.ran` (see "The same gates are
not played twice on the same code" in [`pass.md`](pass.md)).

**The budget is per project, a chef's decision**, set by gesture and read without a restart:
`station budget-gates <seconds>` (wall-clock) and `station budget-gates-cpu <seconds>` (CPU).
Unset: **100 s** of duration and **400 s** of CPU (four cores over that duration). `station remove budget-gates` brings
the default back. The last run is **over budget** when its duration or CPU exceeds the budget.
`facts` gives this in `coutDesGates`. Nothing is stopped or judged on it.

**Two kinds of run, two budgets.** The budget above judges **the gates of a ticket**, which play only
the tests the change touches. **The full run on the base** (a `gates.ran` with no ticket) always costs more (about 700 s of CPU for brigade) and has **its own, larger budget**, per project:
`station budget-base <seconds>` and `station budget-base-cpu <seconds>`
(`BRIGADE_GATES_BASE_BUDGET_SECONDS`, `BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS`). Unset, four
times the ticket budget: **400 s** and **1600 s** of CPU. In `coutDesGates`, the
top-level `budget`, `latest`, `overBudget`, `lastDay`, `lastHour`, `averages` and `trend` read the tickets' runs
only; `base` — `{ budget, latest, overBudget }`, same shapes — reads the base's runs.

**Over budget, the kitchen opens a ticket on the project, on its own** (`runtime/src/budget-des-gates.ts`).
After it writes a run's `gates.ran`, the pass reads the latest run against the budget of its kind:
over it, and with no budget ticket of the project still open, it creates one on GitHub,
titled "Bring the gates of a ticket of <project> back under their budget: …" or, for the base, "Bring the
full run of the gates of <project> on the base back under its budget: …". Its body gives the measured
wall-clock and CPU, each budget, the exceeded dimension and
by how much, the run that did it, and the criteria: back under budget, no test removed, skipped or
weakened. It carries `fire`, `prio:1` and `model:opus` / `effort:high`. **One at a time**: while the last one is on the rail (open on GitHub, with
`fire`, without `served-elsewhere`), a run over budget opens nothing; once it is closed, gone — or
taken off the rail and left open —, the next run over budget writes `gates.budget-ticket-closed`
(`state`: `closed`, `gone` or `off-rail`) and opens a new one. While the last run is over budget and
no budget ticket is on the rail, `rail` says so in one line (`gates of <project> over budget
(…) and no budget ticket on the rail`). A run within budget never calls GitHub. The creation is announced in the log
(`gates.budget-ticket-opening`), and the issue carries the mark
`<!-- brigade:budget-gates <project> <seq of the announcement> -->`: a lost answer, or a runtime killed
in between, finds the issue again by its mark — from a trusted author only — instead of opening it
twice. `gates.budget-ticket-opened` holds the ticket, the measures, the budget, the exceeded
dimensions and `run` (`ticket` or `base`; absent on older facts, read as `ticket`). GitHub down: the pass says it once, and the next run over
budget retries. `facts` gives the ticket in `coutDesGates.ticket` — `{ number, openedAt, exceeded, run }`,
null when none, or when the last was seen closed.

### The time of each served ticket

On the GitHub-only state, the station times each ticket it merges, **from the issue's filing to its merge**
(`runtime/src/temps-ticket/mesure.ts`, #2342, from the claim until #2662). The start is the issue's
`createdAt`, read on GitHub at the merge with the first time `fire` was set: when `fire` came more than an
hour after the filing (`RAIL_PLUS_TARD_MS`), the issue was filed earlier and put on the rail later, and the
time starts at `fire`, with no qualification wait. GitHub unreadable at the merge, it starts at the claim, as
before. Epics are never merged, so never measured; their sub-tickets are.

At the merge, the record goes to `.claude/brigade/temps-tickets.json` in the project's clone
(`BRIGADE_REPO_DIR`), an object `{resume, tickets}`. `tickets` holds one record per ticket,
`{ticket, depuis, claimedAt, mergedAt, attenteQualification, attentePrise, cuissonsRatees, cuisson, cuissonTests,
renvois, attentePasse, revue, ci, merge, phases, perdu}`: timestamps are ISO, durations whole seconds, `phases` the
ticket's phases in the order it went through them, `{nom, minutes}` (one decimal), each cook on its own line, and
`perdu` its lost time (#2670, below), `{attente, ratees, renvois}` in seconds.
`resume` sums up the recent tickets (below): `{n, medianMin, p75Min, perduMedianMin, lostTimeMaxMin,
phaseLaPlusLongue: {nom, medianMin, partPct}, perteLaPlusLourde: {nom, medianMin, partPct} | null}` — their count,
median and 75th percentile from filing to merge in whole minutes, their median lost time (one decimal) and the
project's threshold for it, the phase they spent the most time in, with its median per ticket and its share of
their total, and the loss that weighs most (null when they lost nothing), with its median per ticket (one
decimal) and its share of their lost time. The 75th
percentile is the value at rank ⌈0.75·(n−1)⌉ (numpy's `higher`): of 40 tickets, the 31st. A ticket
recorded again replaces its earlier record; a file still in the bare-array shape of before #2662 is read, and
rewritten as the object at the next merge. Records of before #2662 have no `depuis`: they count from the claim.

Each phase runs from the moment it starts to the next one, the last to the merge, so they add up to the
filing-to-merge time (from `fire` for an issue put on the rail more than an hour after its filing: a threshold
of the station's own, `RAIL_PLUS_TARD_MS`): `attenteQualification` (`qualification wait`) from the filing to `fire`;
`attentePrise` (`claim wait`) until a station claims it — a free place, a dependency, a held zone —, and again
after each cook that delivered nothing; `cuissonsRatees` (`failed cook`) the cooks that stopped without a
delivery, a stop the cook did not cause (quota, station restarted, a wait) included; `cuisson` (`cooking`) the cook that delivered, of which `cuissonTests` is what the cook's tests and
gates took when its cooker says it — 0 for the station's own cooks, whose gates no launcher measures since the
old path went (#2061) —; `renvois` (`send-back`) from a send-back to the next cook; `attentePasse` until the
review starts; `revue` until its verdict; `ci` until the merge is asked of GitHub, a branch update included;
`merge` until GitHub merged it. The station keeps its marks in memory: a phase it did not see — another station
reviewed it, or the runtime restarted — is 0, never estimated. Its claim, though, is read from GitHub at the merge
with the filing: the first claim comment (`brigade:prise`, by the repo, any station) posted since `fire`. Claim wait
ends there, and the time from that claim to the first phase the station saw is cooking. Before #2732 that whole time
was claim wait: any station merges, so a ticket cooked by another station, or before a restart, lost hours it had
spent cooking. Since #2954 the station also reads what followed that claim on the issue, from the repo's comments
since `fire`: each claim (`brigade:prise`) opens a cooking, each ticket given back without a delivery (`brigade:lache`
or `brigade:echec`) turns it into a failed cook followed by a claim wait — the rule of `rater` —, as does a new
claim on a cooking nothing gave back (a cook that died with its station, no release posted), each send-back
(`brigade:renvoi`) opens one; the last claim before the station's first mark, when that mark is a cooking, is the
station's own and the same cooking. Before #2954 a cook killed by its station's restart, then claimed again, was a
send-back: BOBL-tech/calculus-workspace#694 and #696, delivered on the first try, counted 31 and 35 min of
send-backs; and the station's own claim, posted seconds before its mark, split off 0.1 min of send-back on most
tickets. The bound on the claim wait (#2784) holds only the wait before the first claim: the wait after a cook
given back no longer gets the measure of its ticket rejected. With no claim readable, the time from the filing to
the first phase seen stays claim wait. The record keeps that claim (`priseAt`, null when none is readable). A recent record without it was measured
before #2732: after each merge the station reads its claim from GitHub and corrects it the same way, a few at a
time (#2734) — #2709, merged eight minutes before #2732, kept 309 of its 310 min as claim wait and opened a
correction on its own. The station also does it at each turn, before the lost-time rule reads the times
(#2870): on a project with no merge since, BOBL-tech/espace#822 kept 8.2 of its 8.3 min as claim wait, claimed
1.9 min after `fire`, and opened a correction on its own. An issue GitHub does not return is not read again while
the station runs; a read that fails is retried at the next turn. When the filing cannot be read from GitHub at the merge, the time runs from the
claim and the station warns of it. The station replays nothing: only the tests replay a ticket from its
recorded GitHub history (`runtime/test/temps-ticket/rejeu.ts`), through the same measure (`mesurer`), the
same failed-cook rule (`rater`) and the same reading of the comments (`faitsDePrise`): its claims, failures and releases, send-backs (`brigade:prise`, `brigade:echec`,
`brigade:lache`, `brigade:renvoi`), `in-pass` set and the approving verdict (`brigade:verdict … approve`, on the
PR) mark its phases, the review inside the pass wait — GitHub does not record when a review starts — and the
merge request inside the CI. `runtime/test/fixtures/temps-tickets-40` holds the recorded history of brigade's 40
tickets served on 2026-11-06 and 07 (with the epics and the issue closed unmerged of that span, which the replay
leaves out): replayed, median 14 min, p75 47 min, and claim wait the slowest phase (54 %, a median of 5 min per
ticket).

**A ticket's lost time** (#2670) is all of its time except the cook that delivered — its last cooking — and the
pass, CI and merge of that merged delivery. It splits into four losses: `qualification` (`waiting for the manager's
judgement`), the qualification wait, from filing to `fire`; `attente` (`waiting for a claim`), every claim wait;
`ratees` (`failed cooks`); `renvois` (`send-backs`), each send-back and, before the delivered cook, the cooking, pass
wait, review and CI of a delivery that was sent back. The record's `perdu.attente` holds both waits, as before: the
qualification loss is its `attenteQualification`, the claim wait the rest. Until #3422 both counted as waiting for a
claim: the 15 min BOBL-tech/mirrorlab#732 waited between its filing and the manager's `fire` read as a wait for a
cook. Its cause is corrected in the manager: a new issue is judged before the rest of the manager's turn
(`docs/runtime/manager.md`, "A new issue is judged first"). A record of before #2670 has no `perdu`: its waits, failed cooks and send-backs stand for it. Replayed, the 40 tickets of
2026-11-06 and 07 lost a median 7.7 min, 57 % of it waiting for a claim.

**Over the lost-time threshold, a correction ticket** (`runtime/src/temps-max/`, #2515, on lost time since
#2670). The project's threshold is `lostTimeMaxMin` in `.claude/brigade/projet.json`, in minutes, **2 by
default**. It replaced the max of a ticket's whole time (`tempsMaxTicketMin`, 10 min), which no longer exists
nor is read: a ticket has no fixed size — 10 min is too short to refactor half the database, far too long to
re-center a title — while the time it loses is waste whatever its size. At each turn, the
GitHub-only station reads these records in its clone and takes the median lost time of the recent tickets —
the last 10 merged, and every one merged in the 24 h before the last. Over the threshold, it opens one
issue on the rail: `fire`, `prio:0` (it goes before the whole rail), `model:opus`, `effort:medium` (`high` until
#2575: the ten corrections #2535 to #2573 cooked a median 10.9 min each, so each one added to the recent
tickets a ticket over the max it was there to bring down), with the median lost time, the loss that weighs
most — waiting for the manager's judgement, waiting for a claim, failed cooks or send-backs — with its total, its
share of the lost time, its median per ticket and how many tickets it hit, the four losses, and the tickets concerned, the ten that lost
the most to it first. **One open at a time**, whatever the turns or the stations: before opening, the station looks on
GitHub for an open issue by a trusted author that carries the marker `<!-- brigade:temps-max -->` (changed in
the last 30 days), and opens nothing if there is one. Two stations that open one together keep the oldest
and close the other. Once it is closed, a median still over the threshold opens a new one — **but not before the
last served correction has 20 tickets of its own** (#2577, #2868): until 20 tickets were claimed and merged after
the merge of the last correction closed and recorded in these times, the median is still that of
the tickets before it and says nothing of it, so nothing opens (`a-l-essai`, with the number still missing; the station then reads GitHub
again only once they are there), and the next measure counts only those tickets. The "Quality before time" ticket follows the same rule with its own last served ticket (`en-attente`; #2868): after the loop of 2026-11-07/08 (27 quality and 8 lost-time tickets in a night, on a 96-ticket window that the previous ticket had almost entirely counted). The station notes the wait in `attente-des-tickets.json` of its state directory and `status` says it in one line, `quality: waiting for N more merged tickets since #<last>` (`lost time: …` for the other). Reopened two minutes after each merge on the same 24 h window, the
correction was opened twelve times in 9 h 30 (#2535 to #2577): eleven of the 60 recent tickets, each `prio:0`
ahead of the whole rail, looking for a cause the previous one had just fixed. A correction closed without a
merge holds nothing back. For a served project, the correction is filed on `benomite/brigade` (#2783) and its
merge is never in the project's times: it is served when its issue on the brigade is closed (its `closed_at`),
and a project ticket bearing the same number is not it (#2809) — before, no correction of a served project was
ever on trial, and each one reopened as soon as the previous one closed, on the tickets claimed before its fix. The rule holds only once the station runs it: #2580 opened two minutes after #2577
merged, from a station still on the code before it, whose update comes much later; the same turn on the
code of today opens nothing (`test/temps-max/station.test.ts`). In the cook sessions claimed after #2573
and #2575 merged (#2575, #2577), cooking was 5 to 7 min of `claude`: the window's median of 9 min is that
of the tickets cooked before them. At or under the threshold, nothing is opened and GitHub is not read. `status` says four
figures, one line each, value then threshold and red over it (`runtime/src/chiffres-du-projet.ts`, #2672): the median and
p75 lost time (`lostTimeMaxMin`), the median cooking over estimate (`cookingOverEstimateMax`), the first-try rate
(`premierCoupMinPourcent`) and the repairs of main per merged PR (`REPARATIONS_PAR_MERGE_MAX`) — these two
over the recent tickets whose `qualite` the station recorded at their merge, from GitHub (#2707). The station publishes
them with the ticket times (`temps.chiffres`) and their summary (`temps.resume`: median, p75, slowest phase — null when no ticket merged in the last 24 h, `runtime/src/mesures/resume-servi.ts`), with what weighs most on each (the 5 tickets with the most lost time or
most over their estimate, the most frequent send-back reasons and broken checks); the app's rail band and Health tab
show them from those values. TODO's informative part names each of the
last 10 tickets that lost over twice the threshold, with its heaviest loss.

On `benomite/brigade` itself, the times hold only the tickets this station merged. A quality or lost-time
ticket that is closed, in none of these times, and closed by a merged PR (another station merged it) is served
when its issue is closed (#2979); one closed without a merged PR — a duplicate the station closed, an issue
closed as not planned — holds nothing back. Before, #2963, merged by another station, waited for nothing, and
#2979 reopened on the nine conflict send-backs #2963 had counted.
#3019 opened on those same nine conflicts (#2921 ×5, #2922 ×3, #2930 ×1), all cooked on 2026-11-08 before
#2963's fix (4a17e71, merged as #2965 at 23:02 UTC) held a zone's companions at the claim gate; of the measured
tickets claimed after that merge, #2977 and #2985, none was sent back for a conflict. Replayed on #3019's
evidence, with #2963 and #2979 closed by merged PRs out of the station's times, main's gate returns `en-attente`
on #2979 (19 tickets missing), and the code before #2979, which dated neither, opens a ticket.
Nothing to correct on main.
A merged PR is the one GitHub says closed the issue, or else the merged PR of its cook's branch
(`cook/<n>-github`), as an epic reads its tickets (#3083): the station that merges closes the issue at once
(#2467), often before GitHub does, and that closing carries no merge commit. Before, #3080, merged by another
station, waited for nothing, and #3083 reopened on the two repairs of main (#3066, #3068) #3080 had counted.
#3028, measured on BOBL-tech/mirrorlab, names "red gates: type check" for three red-CI send-backs (#651, #20,
#612), but no failed step was read: their reasons name the one red check, `Lint + Format + Typecheck + Tests
(+ e2e:critical si label e2e)`, a job that runs four steps. `causeDuRenvoi` (`runtime/src/qualite-github.ts`)
tests `types?` before `tests` on the check names, so this job read "type check" whichever step failed. Which step
was red on `db59a30`, `a437316` and `9572273` is in mirrorlab's CI logs, which the cook of #3028 could not read.
Since #3028 the station names the failed steps of each red job in the send-back, and the cause is read from them:
`(failed step: Format)` is "other", `(failed step: Typecheck)` "type check". The three send-backs counted keep their
cause. The same fix turned the `app` pattern of `causeDuRenvoi` back into a word match: since #2707 it held two
backspace characters where `\b` was meant, so no red-CI send-back was ever classed "red gates: app tests".
#3157, measured on BOBL-tech/espace, names "other" as the first send-back reason: five of its nine send-backs
(#830, #845, #846, #886, #879) read `the CI is red on …: brigade/gates`. espace runs no CI on its PRs, and a
station plays its gates on the PR head and posts their verdict as the commit status `brigade/gates` (#2456). That
status is no GitHub Actions job: no failed step was read, and the send-back named the check alone, which no cause
matches. Since #3157 the send-back names what made the gates red, read from the status the station posted — its
summary is their first `FAIL` line (`echecDesGates`, `runtime/src/github-etat/gates-de-la-tete.ts`) —, and the cause
is read from it as from a job's steps: `tests du runtime en échec` is "red gates: runtime tests". The five send-backs
counted keep their cause.

The quality ticket (`runtime/src/alerte-qualite.ts`, #2680) that opens instead of the time tickets is not opened
again for the send-backs a quality ticket already counted (#2804): each one names, in a hidden marker, the recent
tickets it counted (`brigade:qualite-comptes`), and while the window holds no other, nothing opens (`deja-servie`).
A quality ticket opened before that marker existed counted every such ticket merged before it was opened (#2813):
#2805, served, had #2813 opened on the very 13 send-backs of BOBL-tech/espace it had counted, all cooked on
2026-11-05 and 06, before the cook's instruction learned the reviewer's blocking rules (#2770, #2789, #2797, #2803)
and before a blocked cook went to the chef (#2805).
The rule holds only once the station runs it, like the time correction's (#2580): #2819, then #2825, opened
on those same 13 send-backs from a station still on 0.20261107.201514+g8e64144, older than #2804 and #2813 —
neither body carries the `brigade:qualite-comptes` marker. The station installs at most one version per 60 min,
so each quality ticket served before the update reopened the next. On the code of #2813, the same window with
#2805, #2813, #2819 and #2825 closed opens nothing (`deja-servie`), and a send-back merged after the last of
them opens one. The cause they name, blocking review, is corrected in the cook's instruction (#2770, #2789,
#2797, #2803, #2812, #2819) and by a blocked cook going to the chef (#2805); none of the 13 was cooked under it.
#2829 is the fifth, from the same station: no marker, and none of the measure's rule (#2824) in its body, while
0.20261107.212204+g0cf609d, which holds #2804, #2813 and #2819, was still draining in. Nothing to correct on main.

A quality or lost-time ticket carries its evidence (`runtime/src/preuve-mesure.ts`, #2839): the cook that takes
it reads neither the project's issues, nor its `temps-tickets.json`, nor the station's journal, and stopped
blocked on #2832 and #2837. When it files one, the station appends an "Evidence" section, gathered from the
project's GitHub and its own journal: every recent ticket measured, with the reason of each send-back and failed
cook its station comments give; for the lost time, also each ticket's filing, `fire` and first claim, its four losses,
and the journal events of the measured window (`station.held`, `station.released`…, without the runtime's
heartbeat), 40 at most. Over 40, the events cited are those in the claim waits of the five tickets that waited
longest for a claim (#3156): from filing — or from `fire` set over an hour later, as the measure counts it — to the
first claim, and from each cook given back to the next claim, as GitHub dates them. Each of these waits gets an
equal share, the longest wait first, taken from its first and its last events in turn — what opened it and what
lifted it —, and the events cited are listed in the journal's order (#3422). The first 40 of BOBL-tech/espace's
window all fell in its first hour, and #840's 40 min wait for a claim, an afternoon later, had no line to say it.
With a share per ticket, its waits laid end to end, the lines of BOBL-tech/mirrorlab#706 all fell in its 45 s
before its first claim, and its 549 min wait after a cook given back had none. With no wait read on GitHub, the
first 40 of the window.
The lost time counts as a failed cook every cook given back without a delivery, so its evidence also names the
stops the quality does not count as a try — a block the manager answered, a stop on an open ticket, a stop the
cook did not cause —, each with the cook's words (#3036), when its station comment quotes them — in English only:
words the cook wrote in French and nothing translated are not quoted (#3033). Before, BOBL-tech/mirrorlab#670 read
"first try" over 5 min of failed cooks, and the cook's question that cost them was written nowhere in the ticket.
It also names, with their station, the cooks given back to another station or to the next round with no wait: a
station that cannot run the ticket's gates (#3057), a station whose base branch is missing on the remote (#2876),
a cook stopped with its station (#2543) (#3422). BOBL-tech/mirrorlab#706 read "first try" over 6 min of failed
cook, then waited 549 min for a claim, and its evidence did not say which stop had given it back.
A read that fails is named on its line, with its error: the ticket is filed all the same.
When the measured project is not the one the ticket is filed on (a served project's loss, filed on the brigade,
#2783), the cook can reach neither its issues nor its state: the section copies the tickets (numbers, reasons),
their timestamps and the journal events in full, names each ticket by its project (`owner/repo#101`, never a bare
`#101`) and points to no issue list or state path (#2840).

The rule each quality ticket carries (`runtime/src/garde-correction.ts`) also keeps its correction off the measure
that opened it (#2824): a send-back the ticket did not count is never counted away, by its claim date, its age or its
project. #2818 did just that — its cause already had its fix on main (#2812), and it made the gate count every
send-back claimed before the last quality ticket closed as counted — and the review sent it back as a silencer. Of the
tickets whose first commit came after #2812 merged (#2815, #2818, #2819), it is the only one sent back, and its send-back
is the blocking review #2824 counts on top of the 21 #2818 had counted. The measure is corrected
only when it reopens on the send-backs a served quality ticket already counted (#2804, #2813). When the cause is
already fixed on main and nothing was cooked since, the delivery says so with the evidence and changes nothing.
#2835, on the brigade itself, counted 38 send-backs; all but one were already counted, since they merged before
#2829 (unmarked) was opened. The one left is #2829's own: a docs-only delivery whose Windows tests went red on
`arbre.test.ts`. Its cause is a failed PowerShell read of the process table that ended the kill of a cook's tree,
and #2829 fixed it on main (`runtime/src/arbre.ts`). Nothing to correct on main.
#2846 counted 39 tickets. All but #2832 merged before #2835 was served (2026-11-07 21:59 UTC); its 22 blocking
reviews, the first reason it names, are among those #2835 had counted. The one left
is #2832's own, merged after (2026-11-08 01:01 UTC): its Windows tests went red on a `jusqua(…, 5000)` it had
added to `test/github-seul/garde-fous/garde-fous.test.ts`. `test/garde-duree/garde-duree.test.ts` refuses that
guard, but neither the gates nor the pull request's Linux CI played it: it is not in the closure of the files
#2832 changed (`.claude/brigade/tests-touches.mjs`), and only the Windows CI plays every file. #2832 lowered the
guard to 2 s on main (c3a6c79). The repository's `CLAUDE.md` said the gates refuse such a guard; it now says they
do so only through that file, which a change writing a guard plays by hand. No guard is changed.
#2858 counted 41 tickets: the 40 #2852 counted, and #2855. Its 23 blocking reviews, the first reason it names, are
the 23 #2852 counted (#2846's 22 and #2848's), whose fix — a cook keeps every case an existing test held (f5411cc) —
merged on 2026-11-08 at 03:55 UTC (fa89c71); of the two tickets cooked after it, #2854 was served first try and #2855
had no blocking review. Nothing to correct there. The send-backs left are #2855's own: a conflict with the base, and a
red CI that #2855 fixed on main by giving a git identity to the fake cook of `test/bac-a-sable/ecriture-brigade.test.ts`,
which committed under `process.env` (a3c5dd3). The station's global `git` config carries an identity; that commit
needs one the CI runner does not give. The repository's `CLAUDE.md` now says a test's `git`, and that of every child
it launches, runs under `ENV_GIT` (`test/outils.ts`), which carries one. No guard is changed.
#2859 (67% over 3 tickets, blocking review 2 times, conflict with the base once) carries no `brigade:qualite-comptes`
marker, none of #2824's rule and no "Evidence" section: it was filed by a station on code older than #2804. The box's
station runs 0.20261108.035547+gfa89c71 since 04:01 UTC (`/var/lib/brigade-station/etat.json`), which holds #2804, #2824
and #2839, and filed #2858, above, in the same hour with all three. With no marker and no evidence, #2859 names
neither its station nor its 3 tickets. The last blocking review on the brigade is #2848's, which #2852 counted and
corrected (merged 2026-11-08 03:55 UTC). The two tickets cooked after that, #2854 and #2855, passed their only review
green. #2855 was sent back twice, for a red CI and for a conflict: those are #2858's send-backs, whose fix is above.
Nothing to correct on main.
#2862 counted 42 tickets: the 41 #2858 counted, and #2859. Its 23 blocking reviews are #2858's, whose fix (f5411cc)
merged before the four tickets cooked since (#2854, #2855, #2858, #2859), none of them sent back by a review. The one
send-back left is #2859's conflict with the base: #2858 and #2859, two quality tickets cooked at once, both appended
here, and #2858 merged first (7840cd0); #2859 was redone on it (83a4ec6, merged as 6b65a0b). Two quality tickets open at
once is what the station's rule already refuses (`deja-ouverte`, #2680), and #2859 came from a station older than #2804,
above. No ticket was merged after #2859. Nothing to correct on main.
#2879 counted 85 tickets. Its first reason, 17 conflicts with the base, are all on tickets merged before #2862 was
served (the last, #2859's, is above), and so are its 16 blocking reviews and 7 red runtime tests. The one ticket
merged after #2862 that missed its first try is #2872, whose two failed cooks could not fetch a `v2` base branch:
#2876 fixed that on main (bc1a68e, merged as b45f9f1), and no ticket was merged after it. It opened because the box's station still runs
0.20261108.080450+gdd576d9 (`/var/lib/brigade-station/etat.json`), older than #2868 (merged as 6e89903): the next
version, 0.20261108.085053+ge90f46a, did not download (504). Replayed on these 85 tickets, with #2862 served at its
merge (05:22 UTC), dd576d9's gate opens a ticket and main's waits (`en-attente`, 17 more merged tickets since #2862).
Nothing to correct on main.
#2883 counted 88 tickets, on the same reasons: 17 conflicts with the base, 16 blocking reviews, 7 red runtime tests,
all on tickets merged before #2862 was served. The one ticket it measures that #2879 did not and that missed its first
try is #2873: two failed cooks on the missing `v2` base branch, both before its delivered cook (72f8e93, 09:51 UTC),
which ran while #2876's fix was merging (b45f9f1, 09:51 UTC). #2879 was served at 10:00 UTC (584620f) and no ticket was
merged after it. The box's station still runs dd576d9: the next version, 0.20261108.095107+gb45f9f1, did not download
either (504). Replayed on these 88 tickets with #2879 served at its merge, dd576d9's gate opens a ticket and main's
waits (`en-attente`, 20 merged tickets missing since #2879). Nothing to correct on main.
#2885 counted 90 tickets, on the same reasons again: 17 conflicts with the base, 16 blocking reviews, 7 red runtime
tests, all on tickets merged before #2862 was served. The two tickets it measures that #2883 did not are #2883, served
first try, and #2874, whose two failed cooks are on the missing `v2` base branch again: #2876's fix (bc1a68e) is not in
dd576d9, the version the box's station still runs. #2883 was served at 10:10 UTC (dcbd3a9) and no ticket was merged
after it. The next version, 0.20261108.095107+gb45f9f1, still did not download (504, checked at 10:10 UTC); at 10:14
UTC every station package under `releases/download/` answered 504, dd576d9's own included, while the release itself
read 200 from the API. Replayed on these 90 tickets with #2879 and #2883 served at their merges, dd576d9's gate opens a
ticket and main's waits (`en-attente`, 20 merged tickets missing since #2883). Nothing to correct on main.

#3130 measured 48 tickets, a median lost time of 35 min, 3953 of their 4648 lost minutes (85 %) waiting for a
claim. A ticket queued behind another on the same files is claimed the moment that one merges: #3112 45 s after
#3111 merged, #3113 1 s after #3115, #3116 2 s after #3113, #3114 2 s after #3116, #3117 1 s after #3114 — seven
tickets filed between 22:33:30 and 22:34:27 UTC on 2026-11-09, each of which wrote `site/index.html` or
`site/style.css` (their commits) —; #3014 41 s after #3013 (both wrote `app/src/vue/index.html`), #3098 38 s after
#3097 (`runtime/src/brigade-github.ts`). Each lost, as claim wait, the whole cooking, pass, CI and merge of those
before it. Filed seconds apart, as the manager files a split's tickets, they were chained by the split: its
instruction said that a second ticket on the same file awaits the first, and `separer` set that dependency itself
when the answer did not. Since #3130 the tickets of a split never await each other: `joindre`
(`runtime/src/decouper.ts`) joins two tickets whose zones overlap, or one that awaits another, into one ticket,
and the instruction asks the manager for just that (see "It splits epics", `manager.md`). The measure is unchanged.
This does not reach tickets filed one by one on the same files, which the claim gate still holds, the station's
place limit, nor the minute or two between `fire` and the claim of a ticket nothing holds (#3001 1.1 min, #3088
0.7 min, #3126 2.8 min). Whether the median goes back to 2 min is read on the tickets merged after this one,
under the trial rule above.

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

## The weekly kitchen summary (#3261)

Once a week, on the day the project's `weeklySummaryDay` names (`monday` to `sunday`, Monday when unset; UTC days),
each project's kitchen writes what it served over the seven days before, for a product owner
(`runtime/src/resume-hebdomadaire/`). The served tickets are the issues closed that week by a merged pull request, read
from GitHub; each becomes one line — its title without commit prefix, file path, commit hash or pull request wording,
led by "Fixed:" for a fix (a `bug` label or a title starting with fix) — under a theme: the epic the ticket names
(`Epic: #N`), else "Improvements" or "Fixes". The rewriting is a rule, not a model. Then, when tickets were counted, the
week's autonomy figures (#3222: served without a human, median lead time, sent back at least once), and last what waits
for the chef — the cards of their queue, the same ones the chef's mention reads (#2746).

The record — `{ project, weekStart, weekEnd, themes: [{ title, lines: [{ text, ticketNumber, ticketUrl }] }], autonomy?,
waiting: [{ text, ticketNumber, ticketUrl }], markdown }` — is kept in `<BRIGADE_STATE_DIR>/resume-hebdomadaire/<weekStart>.json`.
The chef is notified through the TODO cards' channel: a GitHub @-mention, which GitHub Mobile notifies. The summary has
no ticket to carry it, so an issue does — titled `Weekly kitchen summary — <project>, <weekStart> to <weekEnd>`, the
summary as its body —, closed at once so the kitchen never takes it for a ticket. A GitHub read that fails writes
nothing and is retried ten minutes later the same day; a summary written but not notified (no chef resolved, a refused
write) is only renotified; a summary file that does not read is left as is. Each case is said on the service log.

```sh
npm --prefix runtime run report -- --week 2026-11-02   # the stored summary of the week starting that day, as JSON; exits 1 if there is none
```

