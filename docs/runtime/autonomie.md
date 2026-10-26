# Autonomy

A project's **autonomy table** says, for each kind of decision, what brigade may decide alone.
It is the chef's answer to "how much do I want to be asked?". The code is in
`runtime/src/autonomie/table.ts` (the table, its profiles, its changes), `decision/aiguillage.ts`
(the routing of a decision) and `rapport/rapport.ts` (the daily report). The words are those of
[`glossary.md`](../glossary.md).

## The seven rows

Each row is a kind of decision. The table shows them in this order.

| Row | What it covers |
|---|---|
| **Screens** | Validating the captures of an interface change before merge |
| **Merge** | Merging a green delivery. This row is the `merge` grant (see "The Merge row" below) |
| **Specification** | Adjusting a ticket's criteria, splitting it again, closing a ticket judged useless |
| **Priorities** | Changing ticket priorities, posing tickets born in the kitchen |
| **Cost** | Raising a ticket's calibration, relaunching it beyond its resends, the share of the Max quota |
| **Dependencies** | Adding a library or a service (a database, Docker…) |
| **Publishing** | Releases and station updates |

Three more rows exist, always **locked** at `I decide`. No command and no profile changes them;
only a delivery to the runtime can, and it reads as a diff:

| Locked row | What it covers |
|---|---|
| **Production** | Any action on the project's production |
| **Secrets** | Reading or writing the project's secrets |
| **Published outside the repository** | Anything published outside the repository |

## The three positions

Each of the seven rows holds one position:

| Position | What brigade does with a decision of that kind |
|---|---|
| **brigade decides** | Applies it alone. No card, and no trace for the chef beyond what applying it writes |
| **brigade decides and tells me** | Applies it, and writes an entry saying what was done and where to see it. The daily report reads these entries |
| **I decide** | Applies nothing. Raises a card that asks the chef, with its choices |

A locked row always raises a card, whatever the table says.

## What a row holds without a choice

A project with no table behaves as before the table existed. A row the chef has never set holds
what the kitchen does today, read as the closest position:

| Row | Held by default |
|---|---|
| Screens | brigade decides |
| Merge | the `merge` grant: `I decide` without an active grant, `brigade decides` with one (see below) |
| Specification | brigade decides |
| Priorities | I decide |
| Cost | brigade decides |
| Dependencies | I decide |
| Publishing | brigade decides |

A row on its default is not shown as chosen. The router sends its decisions down the path the kitchen
already had, and writes nothing for them. The first time the chef sets the row, even to the same
position, it is written and no longer on its default.

## The three profiles

A profile sets the whole table at once, in one step. Each profile is a fixed table; a row it does
not name holds `brigade decides`. Afterwards, every row can still be changed alone, without touching
the others.

| Row | prototype | client product | internal tool |
|---|---|---|---|
| Screens | brigade decides | I decide | brigade decides and tells me |
| Merge | brigade decides | brigade decides | brigade decides and tells me |
| Specification | brigade decides | I decide | brigade decides and tells me |
| Priorities | brigade decides | brigade decides | brigade decides and tells me |
| Cost | brigade decides | brigade decides | brigade decides and tells me |
| Dependencies | brigade decides | brigade decides | brigade decides and tells me |
| Publishing | brigade decides | brigade decides | brigade decides and tells me |
| Production, Secrets, Published outside the repository | I decide | I decide | I decide |

Applying a profile writes one `autonomy.changed` entry per row it moves, each naming the profile.
A row already set to its profile's position is not written again; a row still on its default is.

## The Merge row and the `merge` grant

The Merge row is the `merge` grant. The grant stays the store, so nothing is migrated and
`brigade <project> grant` keeps working on the same data.

- **Reading.** Without an active grant, Merge reads `I decide`. With one, it reads the last
  `brigade` position set on the row since the grant was enabled, or `brigade decides` if none was.
  A grant enabled, lapsed or revoked before the table existed reads as the matching position, and
  no log entry is rewritten.
- **Setting.** `I decide` revokes the grant. A `brigade` position enables it when it is not active,
  with no deadline. The table does not cover a lapse: a grant that has lapsed is first written as
  lapsed, then the new position is applied.
- **Telling.** The grant does not say whether brigade tells the chef. That is the last
  `autonomy.changed` of the Merge row since the grant was enabled.

## How a change takes effect, and who made it

Every change is an **`autonomy.changed`** entry in the project's log, with its author. Its payload
names the row, the position it held before (`previous`, the default when nothing had been set), the
new position, and the profile whose application moved it (`null` for a change of that row alone).

The table is read again from the log on every read. Nothing is kept in memory, so a change holds at
the kitchen's next decision, with no restart and no rebuild.

A change the table does not allow is refused and nothing is written: an unknown row, an unknown
position, a locked row, an unknown profile.

## Where to read it

- **The log entry.** `npm --prefix runtime run log -- <ticket>` for a ticket, or
  `npm --prefix runtime run log` for the whole log. The entries are `autonomy.changed`,
  `autonomy.reported` (a decision under `brigade decides and tells me`) and `autonomy.card-raised`
  (a card under `I decide`).
- **The daily report.** `npm --prefix runtime run report`, with `BRIGADE_STATE_DIR` set. It is
  read-only and shows the last 24 hours of decisions taken and told about, grouped by row in the
  table's order, each with a one-line summary and a link. A quiet day says so. Exit codes: `0`
  printed (an empty day too), `1` the log cannot be read, `2` a bad call. The app reads the same data
  through `rapportDuJour`.

The report lists only decisions under `brigade decides and tells me`. A decision under
`brigade decides` leaves no entry, and one under `I decide` is a card, so neither appears in it.
