# Claim wait on benomite/brigade — diagnosis (#3446)

*Ticket #3446, filed by the station.* The median lost time of the project's 10 recent tickets is 19 min, over its
threshold of 2 min (`lostTimeMaxMin`). Waiting for a claim is 1467 of their 1625 lost minutes (90%), in all 10
tickets. The measure itself is the one #3422 left: `attentePrise`, from `fire` (or filing) to the first claim the
issue bears, and from each cook given back to the next claim (`marquesDuDepot`, `runtime/src/temps-ticket/mesure.ts`).
Nothing in it changes here.

## What holds a claim when nothing is wrong with the ticket

A ticket on the rail is claimed at the station's turn (`tour` in `runtime/src/brigade-github.ts`) unless something
holds it. Two holds stop **every** claim of the project, not one ticket's, and neither has a gesture that ends it:

1. **The station's places.** The turn takes no ticket once its cooks fill its places. Since #2061, the GitHub-only
   station (the only one) fixed them at start: its declared cap bounded by its machine's cores
   (`plafondDesCoeurs`: `max(1, ⌊(cores − 2) / 2⌋)`, 3 on 8 cores, the cores this worktree's machine reports). The
   chef's live cap, `station -- cooks <N>`, which `station.md` and `exploitation.md` document and `StationDeclaree.cooks`
   names, still wrote `station.capped` to the log, but nothing on the GitHub-only path read it; and the station no
   longer wrote `station.announced`, so `status` did not say the cap that held.
2. **The pass.** The turn takes no ticket while the project has 5 deliveries `in-pass` (`PASS_MAX`, #2300). A
   delivery the pass holds for the chef — the validation of its screen (`humanValidatesDesigns`, which this project
   sets, #3184) or the review of a sensitive ticket (#3223) — keeps `in-pass` until the chef answers, and took one
   of those 5 places all that time.

## What the evidence shows

From the merge commits of `main` (their commit dates, UTC) and the timestamps given on #3446:

- **Design deliveries stay in pass for hours.** Each delivery below carries before/after captures
  (`docs/captures/<n>/`), so the pass held it for its card. #3403's cook committed at 14:25 on 2026-11-12, its PR
  #3412 was merged at 09:54 the next day; #3399's at 13:42, PR #3404 merged at 22:33; #3358's at 10:59, PR #3366
  merged at 13:22; #3271's captures at 13:30, PR #3298 merged at 14:00, with a commit of #3271 from 21:11 the day before.
- **On 2026-11-12, claims resumed after merges.** #3372 was on the rail from 10:54:10. After #3367's claim at 11:06:05,
  the next cook the cited journal shows launched is #3379's, at 11:58:44 — 3 minutes after PRs #3365, #3375 and #3376
  were merged within 7 s, at 11:55. That fits a full pass, which a merge frees and presses a turn for (#2802); a
  merge also frees zones and dependencies, so it does not prove it.

What it does not show, and this diagnosis does not claim:

- **Which hold held each wait.** The station's journal was not readable from the cook, and the hold of a full pass
  writes no line (the turn stops on `PASS_MAX` with no `sauter`). So how many of the 1467 min were a full pass, and
  how many full places, is not measured.
- **#3372's 245 min** were not only a project-wide hold: tickets numbered after it were claimed first (#3379 at
  11:58, #3400 at 13:34, #3403 at 14:17), so a hold of its own (a held zone, a dependency, or the rail's priority)
  also kept it. The cited events do not name it.
- **#3228's 1032 min** are almost all after its first claim (17:53 on 2026-11-11), overnight, between its blocked cook,
  its send-backs and its cooks given back. What held it then is not in the cited events.
- **#3351 and #3361's cooks given back** by `macbook-air-de-benoit/claude`, whose base branch `v2` does not exist on
  the remote, are that station's configuration: it takes no more tickets until restarted with a base that exists
  (#2876). Nothing here changes it.

## The fix

- **The places are read at each turn** (`runtime/src/github-seul/places/places.ts`): the chef's cap once he has set
  one (`0`: no limit), otherwise the same default as before. At start the station announces itself
  (`station.announced`, with its declaration and its cores), so `status` and `station` say the cap and where it comes
  from. The default is not raised: how many cooks the box runs at once is the chef's to set, and he now can.
- **A delivery held for the chef takes no place of the pass** while its head is the one held
  (`pourLeChef` in `runtime/src/brigade-github.ts`). A delivery the pass is still reviewing, merging or waiting on CI
  for counts as before; one sent back after the chef's answer comes back as a new head and counts again.

## The checks

```sh
cd runtime && node --test test/github-seul/places/places.test.ts test/station/cuisine-github-seul.test.ts
cd runtime && node --test --test-name-pattern=3446 test/validation-design/validation-design.test.ts
```

The second fails on the code before the fix (no claim while one held delivery and four others are in pass) and
passes after it.

The median lost time of the next recent tickets is to be read once 10 tickets are merged after this fix: it is not
measured here. The station re-measures it over those tickets, and opens a new ticket if it is still above 2 min. If
the claim wait stays high while tickets arrive faster than the default cooks serve them, the lever is the chef's:
`station -- cooks <N>`, which the station now reads at its next turn. The default (the declaration bounded by the
cores, 3 on 8) is not changed here.
