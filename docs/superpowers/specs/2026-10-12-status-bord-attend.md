# The `awaiting` block of `status`: always there, with an edge (#311)

Epic #294. Unblocks the first criterion of #296 ("a calm screen is not an empty screen").

## The problem

`status` names what awaits the chef (#191), but:

1. **when nothing awaits, it stays silent** — `decrireAttentes` returns an empty list. A silence cannot be
   told apart from a failed read, or from a missed block;
2. **the block has no edge** — its end is an empty line, and the output carries others. A
   reader (the app, the second) can only present it separately by interpreting lines, hence by
   deducing, which the epic forbids.

## What is decided

Manager's arbitration, recorded on the issue (2026-10-12):

- **The edge**: the head line does not change — it is the only line of the output that begins
  with `awaiting` — and the block gains an end line, alone on its line: `end awaiting`. The empty
  line that separates it from the rail stays, after it. Rejected: two pure delimiter rules, a
  style the output has nowhere.
- **The phrase**: `nothing awaits the chef`, in place of the count, on the head line. "The
  chef" and not "nobody": the block only counts what awaits the chef (`STUCK`, `WITHHOLDING`,
  the red base await without him).
- **The `without a grant` bilan** does not appear in an empty block: it is exactly two lines. The
  figure remains readable in `run pass` and `run grant`, as before.

```
awaiting     nothing awaits the chef
end awaiting
```

```
awaiting     2 decisions await the chef — the oldest since 2 d
  #12  since 2 d  green delivery, …
  without a grant, 4 green deliveries stopped: …
end awaiting
```

**The rule for a reader**: the block runs from the single line that begins with `awaiting` to the single
line that is exactly `end awaiting`, bounds included. Everything it carries between the two is indented
by two spaces: no entry, no ticket title can imitate a bound.

## What does not change

The rest of the output, line for line. The lines of the full block, apart from the added end line.

## Out of scope

- Having the app read the block (#318) and having the second relay the edge (#317) — including
  the sentences of `docs/app.md` and `commands/po.md` that still describe the block as "absent".
- A gauge, a score; a structured output; another command.

## Plan

1. Tests (`runtime/test/attend.test.ts`): the block is taken by its edge alone; empty queue, it says
   `nothing awaits the chef` in two lines, with no bilan. `status.test.ts`: the command says it
   once the decision is taken.
2. `runtime/src/attend.ts`: `decrireAttentes` always returns the block, closed by `end awaiting`.
3. `runtime/test/etat.test.ts`: the copied whole outputs gain the two lines.
4. `docs/runtime.md`, § "L'état de la cuisine" only.
