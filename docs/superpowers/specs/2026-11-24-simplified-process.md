# The simplified process — one kitchen for any project

Dated product spec, 2026-11-24. Written by the second with the chef, who validated it as **the specification of Brigade's process**. It replaces, where they disagree, the process parts of [`2026-11-23-autonomy-trust-control.md`](2026-11-23-autonomy-trust-control.md). The visual version is the chef's artifact « Process Brigade simplifié ».

## Why

On 2026-11-23 and 24 the kitchen looped for about 13 hours on every project of the box: tickets relaunched 13 to 32 times, a decision that never reached the chef, banners with no gesture, a finished delivery never pushed. The causes were not missing mechanisms but **too many mechanisms working against each other**: frozen acceptance tests nobody may fix, manager rewrites that reset the try count and throw away deliveries, the rail's invariant repair putting `fire` back on a ticket just set aside, a review that contradicts the manager, wall-clock guards on a loaded box, six ways for a ticket to wait. The chef: « I'll end up uninstalling Brigade. »

The answer is to **remove**, and to make what remains valid for **any project handed to the agents** — code, a video channel, accounting, a website.

## The plan of the kitchen

One row, in this order: **sources → backlog → manager → cooks → pass → served**. Above it, the **supervisor**. Below it, **one parking** for everything that waits for someone; the chef's TODO is the part of it that waits for the chef. The **closer** loops from what is served. Every new ticket, wherever it comes from, goes back to the backlog the same way.

The words stay the kitchen's: a cook is not a developer, the pass is where a dish is judged, *served* is what reached the table. Each project declares what these are for it, in its **project sheet**.

## The rules

1. **Everything goes through the backlog, and everyone writes to it the same way.** The chef and the second, an outside contributor, the calendar, and every agent of the kitchen (the manager when it splits, a cook outside its ticket, the supervisor, the closer): one gesture, open an issue. No source has a shortcut to the rail; no agent has its own ticket mechanism.
2. **One queue: the backlog, ordered by priority then age.** The rail is no longer a separate queue: it is the top of the backlog, what is calibrated and ready. An `idea` is never taken.
3. **The manager takes the next one itself** (chef's decision, 2026-11-24). It never takes an `idea`. It calibrates it just before a cook takes it, splits it, or parks it with a question for the chef. When nothing is left to cook, it tells the chef.
4. **Cooks have one trade: doing the ticket's work.** The project's tools specialise them, taken as the ticket needs (screenshots, browser, the project's CLI, a connector). No specialised cook: this replaces the design cook (#837).
5. **Each project trains its cooks.** A know-how file lives in the project: every cook reads it before starting and adds what it learned; the closer prunes it like code.
6. **A cook can be a human.** The chef, the second, the client, a colleague: a ticket only a human can do is taken by that human, on the same rail, through the same pass.
7. **The kitchen takes a ticket when it has room.** Places follow the machine's load. 2000 tickets is a long queue, never an outage.
8. **The pass is the only judge, by the house rules.** Automatic checks, a review, and the chef's opinion where the risk requires it. It serves one dish at a time. The cook tries its work; it does not judge it.
9. **House rules are locked.** No cook, manager or supervisor can skip a check because it suits them. Only the chef changes them, in the project sheet.
10. **Risk decides where the chef's opinion is required.** Each project ranks its actions: publishing, paying, writing to a client require it; fixing a typo never does. The three existing levels apply: observe, propose, act.
11. **A ticket may have stages, each through the pass.** One by default. Declared only when the work truly has stages (script, storyboard, render).
12. **Three tries per ticket, in total.** Each refusal goes back to the cook with its reason (the failing check by name). Nothing resets the count — no claim, rewrite or supervisor pass. At the third, the ticket is parked for the chef, with what was tried.
13. **One state for everything that waits: parked.** Who, for what, until when. Open at every step; the ticket resumes exactly where it was; nothing takes it before. Replaces WAITING, set aside, `blocked-on-human`, `decision`, `question` and the fault banners.
14. **The supervisor watches the whole kitchen.** Each ticket's progress, loops, load, what is served, tickets parked too long. It repairs an inconsistent state, parks a ticket that goes round in circles, opens a defect ticket. It never relaunches blindly; what it cannot fix, it parks for the chef.
15. **The closer tidies what is served.** Dead code, a stale doc, a duplicate: it tidies them itself, and its work goes through the pass like a cook's; what it cannot do alone becomes a ticket.
16. **The chef's TODO is the parking that waits for the chef, plus a journal of the day.** Every card has its buttons, and the chef's answer sends the ticket on.

## The project sheet

What each project declares; the plan does not change. Short by default.

| In the sheet | brigade, espace… | Labo Pop | Baloo | A website |
|---|---|---|---|---|
| The cook's work | code and its tests | an episode | an entry, a reconciliation | a page |
| Stages (one by default) | one | script → storyboard → voice → render | one | one |
| Tools | git, the project's CLI, screenshots | the Labo Pop engine | Baloo, Comptaweb | the CMS, the browser |
| House rules (locked pass checks) | tests, types, CI green | every claim cites a source; the bible is respected | balanced accounts; one receipt per entry | no broken link |
| Risks (chef's opinion required) | an interface; production data | publishing | a payment, a mail to the treasurer | going live |
| Served | the `main` branch | the published episode | the books | the live site |
| Recurring | the closer, daily | one episode a week | the month's close | — |
| Humans in the kitchen | the chef, on what only a human does | the chef, the voice-over | the treasurer | the client |

## What disappears

| Removed | Replaced by |
|---|---|
| The rail as a separate queue | The top of the backlog |
| The cook's gates plus the station's gates | The pass, only judge |
| WAITING, set aside, `blocked-on-human`, `decision`, `question`, fault banners | Parked |
| Frozen acceptance tests written before the code | The cook's tests, judged by the pass |
| Manager rewrites after failures | Three tries in total, then parked for the chef |
| The rail's invariant repair that puts `fire` back | Parked holds until its date or fact |
| One ticket mechanism per agent | One issue in the backlog |
| The design cook | The project's tools |
| A process written for code | The project sheet |

## Order of work

First what removes today's loops: **parked** (rule 13) and **three tries in total** (rule 12). Then the manager taking the next one (3) with the rail as the top of the backlog (2), the pass as only judge with locked house rules (8, 9), and the risk levels (10). Then the project sheet, the know-how file (5), human cooks (6), the calendar (1) and stages (11). The open autonomy tickets #4110, #4112, #4113, #4114 and #4116 are folded into this work.
