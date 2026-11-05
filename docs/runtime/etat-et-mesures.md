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
| `project` | The log's project, or `unknown — empty log` |
| `github` | **Absent unless GitHub limits the account's calls.** `GitHub is rate-limiting calls, back around HH:MM`, by the box's clock. See "The calls to GitHub, on the account's real quota, and waiting out the limit" (`station-machine.md`) |
| `github` (write budget) | **Absent unless the write pacer holds writes.** `held by the GitHub write budget — N of 450 in the last hour, next write at HH:MM`. GitHub refused nothing (#2226, `station-machine.md`) |
| `runtime` | `running according to the log`, `stopped <duration> ago`, or `never started`. A runtime killed without notice still appears running: the **age of the last tick** betrays it. Beyond a few cadences: `systemctl status brigade@<project>` |
| `kitchen` | The chef's "stop" and the breaker: `open` or `STOPPED by the chef <duration> ago`, then `breaker closed (… failures in a row, opens at N)` or `breaker OPEN for <duration>` |
| `connection` | **Absent while the Max connection holds.** Otherwise, per station: `Max MISSING` or `EXPIRED`, since when, the reason, and the gesture — `claude /login` under the service account; the kitchen resumes within the minute. No ticket is taken until then. See "Max connection expired" |
| `grant` | **Absent while no grant is in force or lapsed.** Active: expiry, what is left, uses. `ACTIVE`; `EXPIRING SOON` (under an hour, or a single use); `LAPSED` (the pass stops at the open PR until you grant again). See "The `merge` grant" |
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
| ``green delivery, not merged for lack of a `merge` grant`` · ``… the `merge` grant lapsed on its own on …`` (`no-grant`) | merge its PR by hand; or enable the grant for the next ones: `npm --prefix runtime run grant -- enable merge` | the merge by hand (`merge.done`); the ticket leaving the rail (`ticket.left`); a cook restarted on it. Its PR closed without merge replaces it with `PR closed without merge` |
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

Once a delivery has been stopped for lack of a grant, the block ends with **the figure on which to
grant**: `without a grant, N green deliveries stopped: X merged by hand, Y closed without merge — Y
disagreements —, Z still open`. A PR closed without merge is a disagreement. With the queue empty, the block omits it; `run pass` and `run grant` read the same line.

**The block is always there, and it has an edge.** When nothing awaits you, it reads `awaiting   nothing awaits the chef`, then `end awaiting`.

A rail with only WAITING cards is empty for the kitchen, and that is normal (`rail       empty — 2 WAITING, normal: nothing on it for a cook`, no `fault` line). Cards a cook could take, with no cook running for 30 min, are a fault.

**A held kitchen enters the block, once** (#2281, `runtime/src/retenue/`). When **nothing has been served for 30 minutes**
(`RETENUE_APRES_MS`) while tickets wait for the kitchen — claimable, or in pass; not those that wait for you, a third
party or another ticket —, the runtime writes `kitchen.held` to the log and the block gets one entry:
`  kitchen  for 42 min  HELD: nothing served while 2 tickets wait (#12, #13) — cause: … — to lift: …`. The 30 minutes
count from the latest of: the last service, the kitchen's opening (runtime start, project switched back on), and the
moment the waiting tickets started to wait. The cause is the first that holds of: the breaker (`to lift:` its `Resume`
button), the GitHub limit or the box's reserve for your gestures, the GitHub write budget (both say `nothing to do: it
lifts on its own around HH:MM`), the red base with its failing checks named (`to lift: fix the base by hand…`), on the
GitHub-only state the deliveries in pass whose PR head has no concluded CI (#2456: `cause: 2 deliveries in pass wait for
a CI on their PR head (#757, #759), and no check has started there — to lift: check that the project's CI runs on its
PRs…`, or `still running: brigade/gates — nothing to do`), or `cause unknown`, with no gesture. Later passes of the same hold write nothing; a new cause rewrites the entry, keeping
its start. When the kitchen serves again — or nothing waits any more, or you stop the kitchen —, `kitchen.hold-lifted`
is written and the entry leaves the block. On the old path the waiting tickets are read from the rail; on the
GitHub-only state from what the station's round reads on GitHub (its tickets, the base's checks, its merges). The
GitHub limit and the write budget are read from the station's call counter (`BRIGADE_STATION_DIR`), not on the dev
workstation. A red base is not announced at once (`runtime/src/retenue/relance-base.ts`, #2283): the failed jobs of the base are re-run once per hold, and `kitchen.held` (hence the entry and the Telegram alert) is written only if the base is still red after the re-run; the other causes re-run nothing. The station's service log says each transition (`kitchen held — …`, `kitchen no longer held (served)`).

The block starts at the **only line that starts with `awaiting`** and ends at the **only
line exactly `end awaiting`**, bounds included; between them everything is
indented — an entry is two spaces in. Whoever presents it separately — the app, the second (`/brigade:po`) — takes it by these two lines. **The app reads one thing besides**, to sort its rail: the
ticket number **at the head** of an entry — two spaces, `#`, digits, two spaces (`  #12  for 2 d  …`). This
head does not change without the app changing (`docs/app.md`, "The rail"); an entry
that carries a station, `session`, `token`, `closing`, `base`, `setup`, `aside`, `breaker` or `kitchen`, and the tally of stops for lack of a grant, has none. Under `--follow`, later events
are not part of the block.

**The block is in English** (words of `docs/glossary.md`, §2 and §4); what is between backticks keeps its name. A box from before still writes `attend` … `fin attend` in French: the app and the second read both.

- **Enabling the grant does not empty the queue**: it holds for the next deliveries; those already stopped remain to be merged by hand.
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
| `corrections` | The proposed corrections of the project's guidance (see "Proposed corrections"), oldest first: `proposition` (the `seq` of the fact that carries it), `cause` and `titre`, `tickets` (each `ticket` and `url`, `null` if repository unknown), `motif` (`null` if none), `diff` (unified, as `git apply` takes it), `fichiers`, `base` (the integration-branch commit), `cout.tokens`, `proposee`. **Absent when none**; a discarded or decided proposal is never in it |
| `triage` | What the triage did each of the last seven days (UTC), oldest first, today last — always seven entries: `day` (`YYYY-MM-DD`), `decidedAlone` (cards it settled itself) and `sentToTodo` (cards it let into TODO). A card sent back to it counts for neither. From `todo.triaged`. Absent from an older runtime |
| `activiteCuisine` | The last hour and day, each window up to the read: `lastHour` and `lastDay`, each with `served` (merged, or served without a diff), `sentBack` (`pass.returned`, by the pass, manager or chef) and `escalated` (`pass.escalated`, except a ticket the manager split again). Counts are in tickets (sent back twice in the hour: one). Project facts only (`BRIGADE_PROJECT`, else the last event's project). No activity: six `0`. From `runtime/src/activite-cuisine/comptes.ts`; the app's Cooks tab shows the six numbers. Absent from an older runtime |
| `cadence` | `hours` — 24 entries, oldest first, each a whole UTC hour, the last in progress — each with `at`, `served` (`ticket.served`, `merge.done`; a ticket counts once, in the first hour served) and `failed` (each red `pass.judged` plus each `cook.exited` with outcome `failed`, `guard` or `stop`, one for one); an empty hour is `0` and `0`. `medianSeconds` — `taken` and `pass`: the median stay in each state over the stays that started and ended in the 7 days before the read; **`null` below 3 stays**. Project facts only. From `runtime/src/activite-cuisine/cadence.ts`; the app draws `hours` as a histogram and marks a Taken or Pass card older than twice its column's median. Absent from an older runtime |
| `rolesCuisine` | All kitchen roles, in this order: `manager`, `pass`, `reviewer`, `second judge`, `triage`, `closer` — each with `role`, `does` (one line) and `latest`: `what` (a short sentence composed from the fact's fields — `merged #12`, `reviewed #31: red, 2 findings` —, never command output nor free model text), `ticket` (`null` for a fact on no ticket) and `at`. **`latest` is `null` for a role that has not acted.** Facts per role: the manager's judgments, set-asides, reactions, splits, re-reads; the pass's verdicts, merges (`by: pass`), served-without-diff, and its own returns, escalations and deferrals (author `pass`); the reviewer's reviews (`pass.reviewed`); the second judge's verdicts; the triage's actions (`todo.triaged`, except `back`); the closer's starts and ends. Project facts only. From `runtime/src/roles-cuisine/roles.ts`; shown under the Cooks tab's calibration ceiling. Absent from an older runtime |
| `coutDesGates` | What the gates cost against the budget (see "The cost of the gates, and its budget"; `runtime/src/cout-des-gates.ts`): `budget` — `durationSeconds`, `cpuSeconds`, `parLeChef` (`durationSeconds`, `cpuSeconds`: `true` if set by the chef); `latest` — the last gate run, `null` if none: `project`, `ticket` (`null` for the base), `runner` (`pass` or `cook`), `outcome` (`green`, `red`, `timeout`), `durationSeconds`, `cpuSeconds` (`null` if cut), `at`; `overBudget` — `true` when the last run exceeds the budget; `lastDay` and `lastHour` — `runs`, `durationSeconds`, `cpuSeconds` (no CPU counts 0); `averages` — `lastHour` and `lastDay`, one run's average (`durationSeconds` over all runs, `cpuSeconds` over those that said their CPU; `null` when none); `trend` — `durationSeconds` and `cpuSeconds`: last hour's average against the day's, `up` or `down` past 10 % (`ECART_DE_TENDANCE`), else `steady`, `null` if an average is missing. Project runs only. Also `base` and `ticket` (see that section). Absent from an older runtime |
| `github` | The limit GitHub imposes on the account, the same for every project of the station (#2144; `runtime/src/github-limite.ts`): `limit` (`primary`, `secondary-writes`, `secondary-concurrency`), `since` and `backAt` (ISO, from the refusal's headers). Absent when calls pass; it leaves once `backAt` has passed and a call succeeds (see `station-machine.md`, "Which limit") |
| `reculs` | What each accepted correction did to its cause (see "Does a merged correction push back its cause?"), oldest first: `proposition`, `cause` and `titre`, `pr` (`null` until open), `etat` — `en-cours`, `non-mergee` (not delivered, or PR closed without merge), `rien-a-comparer` (merged, no finished ticket after it) or `mesuree`. Merged, it carries `mergee` and `avant`; measured, also `apres` and `recule` (`true`: the share went down). `avant` and `apres` each say `tickets` (finished tickets looked at), `atteints` (those the cause made fail at least once), `essais` and `part` (`atteints` over `tickets`, 0 to 1). `avant` is `null` when no ticket finished before the merge. **Absent when no correction was accepted** |
| `profils` | The proposed cook profiles that await you (see "Proposed profiles"), oldest first: `proposition`, `nom`, `domaine` (the card zone), `chiffres` — `tickets` (each `ticket` and `url`, `null` if repository unknown), `fenetre` (served tickets looked at), `domaine` and `projet` (share delivered on the first try: `premiers` over `retenus`, `part` 0 to 1), `ecart` (points between them) and `seuils` (`fenetre`, `tickets`, `ecart`) —, `skills` (empty: you write them), `perimetre` (the zone), `carnet` (starting lessons, each `id`, `texte`, `retros`), `proposee`. **Absent when none.** A decided profile is no longer in it |
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
  `status`. The log, the grants, the partition, the arbiter have no shape; of the station, only
  its cooks in progress have one.

### Proposed corrections

> **Since #2061, nothing feeds this and nothing answers it**: the proposals were drawn from the tickets the old pass served, and the chef answered them on the Kitchen board, both removed ([`github-seul.md`](github-seul.md)). What follows describes what the log may still hold.

When the same cause of failure comes back on several recent tickets, the runtime picks it out as a
**candidate for a correction** (`correction.candidate`, `runtime/src/correctif/detecter.ts`). The
model reads the cause, what the failed tickets say of it and the project's guidance
as the base carries it, and answers with a diff (`runtime/src/correctif/proposer.ts`). It is
launched like a manager judgment — no tool, outside any repository, under the guardrails — and costs
that launch's tokens.

**A correction touches only the project's guidance**: its `CLAUDE.md` at the root, its team docs under `docs/`, its gates (`.claude/brigade/gates.sh`) — not its code, its tests, or
how brigade works. The guard (`runtime/src/correctif/portee.ts`) reads the diff — it
refuses a deleted file, a renamed one, a changed mode, binary, a path outside the repository —, then
asks `git` which files it would touch and whether it applies to `origin/<base>`
(`git apply --check`, throwaway index). One file
outside the guidance, or a diff that does not apply, and the proposal is **discarded**
(`correction.discarded`, which says why). Otherwise it is **proposed**
(`correction.proposed`), and `corrections` carries it. Nothing is applied until your "yes".

**Nothing goes without your "yes"** (`runtime/src/correctif/decision.ts`). An undecided proposal
stays in `corrections`. Decided, it leaves; it is decided only once.

You answered on the project's Kitchen board, which no runtime reads since #2061: the app's card says so, and
nothing is posted. `<proposal>` is the `proposition` of `corrections`.

| Your gesture | What happens |
|---|---|
| "yes" (`correction.accepted`) | the runtime prepares a branch like a cook's, commits **the proposed diff and only it** on the commit the guard verified (`base`), pushes it and opens a PR to the integration branch (`correction.started`, then `correction.delivered`, `runtime/src/correctif/livrer.ts`). The PR enters **in pass off the rail**, like a closing pass's: merge with the base, gates, reviewer, CI, `merge` grant (see "The pass"). The reviewer reads it as a correction of the guidance; red, no cook takes it up, it is passed up to you (`still-red`, cause `off-rail`). A correction that touches the gates is never merged by the pass (`review-required`, cause `judge-modified`). At most one PR: a delivery that died with the runtime picks up at start the PR GitHub carries for its branch, or opens one. A diff that no longer commits, a branch that does not push, a PR GitHub refuses: `correction.undelivered`, which says why; nothing is retried |
| "no" (`correction.refused`) | it leaves the queue. **The same cause becomes a candidate again only with one more failed attempt**, if it still reaches the threshold |

#### Does a merged correction push back its cause?

Once a correction's PR is merged (`merge.done` of the off-the-rail PR that `correction.delivered`
names), `facts` sets side by side, under `reculs`, **the share of tickets the cause made fail
before the merge, and after** (`runtime/src/correctif/recul.ts`). Only **finished** tickets
count — merged, or served without a diff:

- **before**: the last 20 finished before the merge;
- **after**: the first 20 **taken** after the merge, once finished. A ticket taken before the merge
  and finished after is on neither side. A ticket in progress does not count.

Twenty is the detector's default window; `facts` does not read `BRIGADE_CORRECTION_WINDOW`.
Once the twenty "after" are finished, the measure no longer moves. The cause **recedes** when its share after
is lower than before. Until the PR is merged, nothing is measured (`en-cours`); merged with no finished ticket after it, there is **nothing to
compare** (`rien-a-comparer`), not a zero share.

### Proposed profiles

> **Since #2061, nothing feeds this and nothing answers it**: the proposals were drawn from the tickets the old pass served, and the chef answered them on the Kitchen board, both removed ([`github-seul.md`](github-seul.md)). What follows describes what the log may still hold.

When a card zone comes back often on the last served tickets and is delivered on the first
try markedly less there than in the rest of the project (`runtime/src/profils/domaines.ts`: at least
`BRIGADE_PROFILE_MIN_TICKETS` tickets, 5 by default, among the last `BRIGADE_PROFILE_WINDOW`, 20,
and at least `BRIGADE_PROFILE_GAP_POINTS` points below the average, 20), the runtime makes a **proposed cook
profile** (`profile.proposed`, `runtime/src/profils/proposer.ts`): a name drawn from the zone
(`app/src/vue` gives `app-src-vue`), the figures that justify it, and what the
profile would contain — skills (none: you write them), its perimeter (the zone) and a starting notebook: the **promoted** lessons of the project's
notebook whose retro names a ticket served in that zone. `profils` carries it. A zone
has one proposal at a time, and none once its profile exists.

**A profile exists only if you say "yes"** (`runtime/src/profils/decision.ts`). An undecided
proposal stays in `profils`. Decided, it leaves; it is decided only once.

You answered on the Kitchen board, like a correction, which no runtime reads since #2061: the app's card says so,
and nothing is posted. `<proposal>` is the `proposition` of `profils`.

| Your gesture | What happens |
|---|---|
| "yes" (`profile.accepted`) | the definition is written into the project's repository, one file per profile: `.claude/brigade/profils/<name>.md` — its domain, perimeter, skills, the date of the "yes", the tickets that justified it, then its notebook in the project notebook's format. A definition already there is never replaced: the "yes" writes nothing, and the proposal still waits |
| "no" (`profile.refused`) | it leaves the queue. **The domain is proposed again only if it crosses the thresholds again on other tickets** |

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

`npm --prefix runtime run measures` shows them in slices of 10 merges; `-- --by 25`, of 25.

At the end, `measures` adds the CI duration of the last 10 merged PRs (`runtime/src/measures/ci-duration.ts`, from `BRIGADE_GITHUB_REPO`): per merge, the start of the first check of the merge commit to the end of the last, then the median beside the 60 s target, and the worst. A merge over target is marked `OVER TARGET`. With fewer than 10 merges, or a failed GitHub call, the section is one line saying so; nothing else changes.

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
- The `flaky` block, before the CI duration, lists **the tests green only on the CI rerun** over the last 10 merges
  (`runtime/src/tests-rejoues.ts`): each test by its name, how many times a rerun passed with it
  failing before, and its tickets — the most frequent first. A rerun counts for a merge when it is on
  that ticket, before its merge and after its previous one. A job whose log named no test counts
  under its job name (`job “runtime-windows” (no test named)`). From `pass.ci-rerun-passed` ("The
  pass", [`pass.md`](pass.md)).

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

One last signal concerns **send-backs**: the share of tickets delivered on the first try over the last served tickets. Under the threshold, `status`'s `drift` block
adds a line — "4/10 tickets delivered on the first try (threshold 50%)". At or above it,
or while the window is not full, nothing. Set by gesture:
`station seuil-renvois <percentage>` (50 by default) and `station fenetre-renvois <tickets>`
(10 by default). It is only read, and writes neither `drift.crossed` nor a log line.

Thresholds enter the log when they change (`drift.configured`). When a merge makes one
cross, the runtime writes `drift.crossed` and a line in `journalctl -u brigade@<project>`,
**once**; back under, or the threshold removed, `drift.cleared`. In between, the `drift` block
of `status` reminds you. Nothing is stopped, no issue is opened.

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
`fire`, without `hors-cuisine`), a run over budget opens nothing; once it is closed, gone — or
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

On the GitHub-only state, the station times each ticket it merges, from its claim to its merge
(`runtime/src/temps-ticket/mesure.ts`, #2342). At the merge, one record goes to
`.claude/brigade/temps-tickets.json` in the project's clone (`BRIGADE_REPO_DIR`), a JSON array of
`{ticket, claimedAt, mergedAt, cuisson, cuissonTests, attentePasse, revue, ci, merge}`: timestamps are ISO,
durations whole seconds. A ticket recorded again replaces its earlier record.

Each phase runs from the moment the station enters it to the next one, the last to the merge, so the five
add up to the claim-to-merge time: `cuisson` from the claim (or a send-back) to the cook's delivery, of which
`cuissonTests` is what the cook's tests and gates took when its cooker says it — 0 for the station's own
cooks, whose gates no launcher measures since the old path went (#2061) —; `attentePasse` until the review starts; `revue` until its verdict; `ci` until the merge is asked of
GitHub, a branch update included; `merge` until GitHub merged it. The station keeps these marks in memory: a
phase it did not see — another station reviewed it, or the runtime restarted — is 0, never estimated, and a
claim it did not see starts the record at the first phase it saw.

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
