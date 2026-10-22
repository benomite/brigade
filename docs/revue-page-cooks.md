# Review of the Cooks tab, block by block

This page lists every block of the Cooks tab (built by `poserRail` in `app/src/vue/vue.js`), plus the two blocks
moving in from the Rail (*gates, latest run against budget* and *triage, day by day*). For each block it gives the
chef's development question it answers and one verdict. **Merging this PR is the chef's approval**: the later screen
tickets apply the list as merged. This ticket changes no screen.

Verdicts: **kept** (stays as a block), **merged into** another block (named), **folded** (behind one line, opened on
demand), **removed**. Words follow `docs/glossary.md`.

## The blocks

Rows are in the order of the proposed page (top to bottom). "Today" is the current position of the block.

| Block | Question answered | Verdict | Reason |
|---|---|---|---|
| Stations and their running cooks (today 4th; each cook is the card of its ticket, with its `STUCK` sign and why) | What is cooking right now? Why is nothing cooking (stopped, saturated, refused)? What is stuck, and why? | kept | The only block that answers the first questions of the page; it goes to the top, and the stop/start button of each station stays on its line. |
| Project card (today 3rd: kitchen state, counters, running cooks, last event) | What state is the kitchen in? | merged into *Stations and their running cooks* | Its state, counters and running cooks repeat the station lines, and its cooks are already the cards there; its kitchen state and last event become the first line of that block. |
| Cap on cooks (today in each station line, and again in the raw reading of `station`) | How many cooks at once? | merged into *Stations and their running cooks* | One place to read and set it: the station line that it limits; the copy in the raw reading goes. |
| Tickets, last hour and last day (today 1st: served, sent back, escalated, six numbers) | Is the kitchen delivering? Does anything need me? | kept | Six numbers that tell at a glance whether work flows; goes right under the stations. Collapses to one line (« nothing served, sent back or escalated in the last day ») when all six are 0. |
| Gates, last hour and last 24 h against the budget of a run (today 2nd) | Are the gates too slow? | merged into *Gates, latest run against budget* | Same question as the block moving in from the Rail, answered by the same `coutDesGates` facts: one block with the latest run, the base run, the hour and the day. |
| Gates, latest run against budget (moves in from the Rail: ticket run, base run, ticket the kitchen opened) | Are the gates too slow? Did the kitchen act on it? | kept | Absorbs the hour/day table above; shown in full only when over budget, or when the kitchen opened a ticket; otherwise a single line. Collapses to one line when there is no run yet. |
| Calibration ceiling (today 5th: how far the manager raises model and effort) | How high may the manager go on a ticket that stays red? | folded | A setting changed rarely; one line with the value in force and where it comes from, opened to change it. |
| Roles (today 6th: manager, pass, reviewer, second judge, triage, closer, each with its last action) | Who did what last? Is a role silent? | folded | Reassurance more than a decision; one line (« 6 roles, last action 12 min ago »), opened for the list. |
| Pages served (today 8th: worktree and port of each served ticket, those with no card) | Where do I open what a cook is serving? | merged into *Stations and their running cooks* | A served page belongs to the cook that serves it; it becomes a line on that cook's card. A page with no card stays listed under the stations. Absent when nothing is served. |
| Triage, day by day (moves in from the Rail: cards decided alone / sent to TODO per day) | Is the triage sparing me work, day after day? | folded | A history to compare days, not a state; one line with today's two numbers, opened for the days. Collapses to one line when there is no day yet. |
| What the cooks learned (today 7th: lessons and profiles) | What did the kitchen learn about this project? | folded | A history to browse, not a decision; one line with the counts (« n lessons, n profiles »), opened for the list. A single sentence when the project has neither. |
| Raw reading of `station` (today 9th: the cap, the machine saturated or not, the quota, the button that writes the cap into the second) | Is the machine or the quota the limit? | folded | A raw reading: what it says that matters (saturated, quota) is already the station word of the first block; one line, opened for the raw output. |

## Proposed order

1. **Stations and their running cooks** — what is cooking, what is stuck, and why nothing is cooking. Nothing else comes before it.
2. **Tickets, last hour and last day** — one line when empty.
3. **Gates, latest run against budget** — one line when under budget or with no run yet.
4. Folded behind one line each, in this order: **Calibration ceiling**, **Roles**, **Triage, day by day**, **What the cooks learned**, **Raw reading of `station`**.

## Folded and collapsed

- **Folded behind one line** (shown closed, with one summary line): Calibration ceiling, Roles, Triage day by day, What the cooks learned, Raw reading of `station`.
- **Collapse to one line when empty**: Tickets last hour and last day (six « 0 »), Gates latest run against budget (no run yet), Triage day by day (no day), What the cooks learned (no lesson, no profile), Pages served (nothing served).
- **Removed**: none. Three blocks disappear as blocks because their content moves: the project card, the cap on cooks, and the hour/day gates table.

## Not touched

The narrow (phone) Cooks tab keeps the station lines, the activity, the gates, the roles and what was learned, as today (`poserCuisineEtroite`); it follows the same order and verdicts when the screen tickets apply this list.
