# Claim wait on BOBL-tech/mirrorlab — diagnosis and fix (#3891)

*Ticket #3891, re-filed from BOBL-tech/mirrorlab#843.* The median lost time of the 11 recent tickets is 2.7 min, over
the threshold of 2 min (`lostTimeMaxMin`). The station's journal could not be read (the station was started without a
state directory), so everything below rests on the ticket's timestamps and on the code.

## Where claim wait is computed

`runtime/src/temps-ticket/mesure.ts`: `marquesDuDepot` lays out the marks of a ticket from its issue, and `mesurer`
(through `mesurerLeParcours`) adds the seconds of each `attentePrise` mark to the ticket's `attentePrise` and to its lost
time (`perdu.attente`). `rater` turns a cook's last cooking into a failed cook when it is given back without a delivery.

## Why #729 and #745 reach 1157 and 1067 min

Until this change `rater` pushed an `attentePrise` mark right after every failed cook, so all the time from the cook given
back to the next claim was a claim wait.

- #729: filed 2026-11-12T15:28:01Z, fire 15:28:37Z, first claim 15:29:18Z (about 1 min of real claim wait), merged
  2026-11-13T11:31:20Z. Five failed cooks (the last given back at 19:09 on 11-12), then the cook that delivered claimed
  at 2026-11-13T11:25:01Z. The night between 19:09 and 11:25 was blocked tickets (Postgres unreachable from the cook's
  sandbox, `node_modules` half removed) waiting for a new cook: 1157 min counted as claim wait.
- #745: filed 2026-11-12T16:34:52Z, fire 16:34:54Z, first claim 16:36:03Z, merged 2026-11-13T11:17:30Z. One failed cook
  (the branch diverged from the origin, given back at 17:45), the next claim at 2026-11-13T11:09:58Z: the 1067 min are
  the time between them.

That time is the aftermath of a failed cook, not the wait for a first claim. It is now counted as part of the failed
cook (`cuissonRatee`, `perdu.ratees`), which runs until the next claim. The lost time of each ticket is unchanged: only
its category changes. The measure is not removed or loosened, and `lostTimeMaxMin` stays at 2.

## Why the typical claim wait is 1 to 3 min

#762 3.4, #756 2.6, #766 2.7, #771 1.1 and #767 1.1 min are first claims taken after the ticket reached the rail. The
station loops over the project at `intervalleMs`, 120 s by default (`runtime/src/brigade-github.ts`, `options.intervalleMs
?? 120_000`), and the claim gate only picks a ticket at a turn: a ticket put on the rail just after a turn waits up to
one interval, 2 min, plus the cook's start (the claim comment is posted when the cook starts). The 1 to 3 min waits fit
that mechanism, but without the journal the turn times cannot be checked: this is an inference from the timestamps. The
shorter turn, `ATTENTE_PRESSEE_MS` (30 s), only follows a new fact (a delivery, a verdict, a merge), never a ticket
filed from outside. This wait is not changed by this ticket.

## Median recomputed on the 11 tickets after the fix

Lost times (min): 0.9, 1.1, 1.1, 1.4, 1.7, **2.7**, 3.4, 16.4, 27.1, 1115.1, 1197. The median is **2.7 min**, still over
2 min: re-attribution does not change totals, so it cannot lower the median. The median ticket is #756: 2.7 min lost, 2.6
of them claim wait (the station's turn interval above), i.e. about 96% of the lost time at the median. What changes is
the story: of the 2368 lost minutes, the claim wait falls from 2237 to about 20 min; the failed cooks rise from 80 to
about 2300 min (97%).

Remaining causes, one follow-up each (to be filed by the chef or the manager, not changed here):

1. Station turn interval of 120 s before a claim (typical claim wait, 1 to 3 min).
2. Failed cooks that wait a night for a new cook (#729, #745): the sandbox's missing Postgres access and the diverged
   branch, which the station should resolve itself.
