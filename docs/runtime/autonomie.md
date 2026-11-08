# Autonomy

A project's **autonomy table** says, for each kind of decision, what brigade may decide alone: the
chef's answer to "how much do I want to be asked?". Code: `runtime/src/autonomie/table.ts` (table,
profiles, changes), `decision/aiguillage.ts` (routing), `rapport/rapport.ts` (daily report). Words
from [`glossary.md`](../glossary.md).

## The seven rows

| Row | What it covers |
|---|---|
| **Screens** | Validating the captures of an interface change before merge |
| **Merge** | Merging a green delivery |
| **Specification** | Adjusting a ticket's criteria, splitting it again, closing a ticket judged useless |
| **Priorities** | Changing ticket priorities, posing tickets born in the kitchen |
| **Cost** | Raising a ticket's calibration, relaunching it beyond its resends, the share of the Max quota |
| **Dependencies** | Adding a library or a service (a database, Docker…) |
| **Publishing** | Releases and station updates |

Three more rows are always **locked** at `I decide`; no command or profile changes them, only a
delivery to the runtime: **Production** (any action on it), **Secrets** (reading or writing them),
**Published outside the repository**. A locked row always raises a card.

## The three positions

| Position | What brigade does |
|---|---|
| **brigade decides** | Applies it alone. No card, no trace beyond what applying it writes |
| **brigade decides and tells me** | Applies it and writes an entry saying what was done and where to see it; the daily report reads these |
| **I decide** | Applies nothing. Raises a card asking the chef, with its choices |

## What a row holds without a choice

A project with no table behaves as before it existed. A never-set row holds what the kitchen does
today: brigade decides for Screens, Merge, Specification, Cost, Publishing; I decide for Priorities and
Dependencies. A row on its default is not shown as chosen; the router sends its decisions down the old path
and writes nothing. The first time the chef sets the row, even to the same position, it is written.

## The three profiles

A profile sets the whole table at once; a row it does not name holds `brigade decides`. Afterwards
every row can still be changed alone.

| Row | prototype | client product | internal tool |
|---|---|---|---|
| Screens | brigade decides | I decide | brigade decides and tells me |
| Merge | brigade decides | brigade decides | brigade decides and tells me |
| Specification | brigade decides | I decide | brigade decides and tells me |
| Priorities, Cost, Dependencies, Publishing | brigade decides | brigade decides | brigade decides and tells me |
| Production, Secrets, Published outside the repository | I decide | I decide | I decide |

Applying a profile writes one `autonomy.changed` per row it moves, naming the profile. A row already
at its profile's position is not rewritten; a row still on its default is.

## How a change takes effect, and who made it

Every change is an **`autonomy.changed`** entry with its author: the row, the position held before
(`previous`, the default if none), the new position, and the profile that moved it (`null` for a
single-row change). The table is reread from the log on every read, so a change holds at the next
decision, no restart. A change the table does not allow (unknown row, position or profile, locked
row) is refused and nothing is written.

## Where to read it

- **The log.** `npm --prefix runtime run log -- <ticket>` or `… run log`: `autonomy.changed`,
  `autonomy.reported` (a decision under `brigade decides and tells me`), `autonomy.card-raised` (a
  card under `I decide`).
- **The daily report.** `npm --prefix runtime run report`, with `BRIGADE_STATE_DIR` set. Read-only:
  the last 24 hours of decisions told about, grouped by row in table order, each with a one-line
  summary and a link; a quiet day says so. Exit `0` printed (empty included), `1` log unreadable, `2`
  bad call. The app reads the same through `rapportDuJour`. Decisions under `brigade decides` leave
  no entry and `I decide` is a card, so neither appears.
