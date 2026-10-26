# Gestures on the Kitchen board

The chef can decide without a direct link to the box. They post a comment on the project's pinned
**Kitchen board** issue (`docs/runtime/etat-et-mesures.md`, "The Kitchen board, on GitHub"). The box
reads the board's new comments on each tick, once a minute. Each gesture it finds runs the same
runtime action as the chef's local gesture. The box then answers under it in one line: done, or why
not.

The code is in `runtime/src/tableau/gestes/`: `grammaire.ts` (the grammar), `gestes.ts` (reading,
authorization, execution, reply), `client.ts` (GitHub). The gestures that used to exist only on the
box are in `runtime/src/tableau/gestes-boite/` (`grammaire.ts`, `jouer.ts`), see "Box gestures".

## The grammar

A comment is a gesture when its **first line** starts with `/brigade`. The gesture is the first
word after it, then the ticket number. The `#` before the number is optional.

| Gesture | First line | Runs, like the local gesture |
|---|---|---|
| merge | `/brigade merge #<ticket>` | `rail merge <ticket>`: merges the delivery the queue asks you to merge by hand |
| send back to the kitchen | `/brigade send-back #<ticket> [reason]` | `rail send-back <ticket> [reason]`: a cook takes the delivery again and reads your reason |
| set aside | `/brigade set-aside #<ticket>` | `rail remove <ticket>`: the ticket leaves the rail and its issue loses `fire` |
| answer a card | `/brigade answer #<ticket> <answer>` | `rail answer <ticket> <answer>`: your own words, written on the ticket's issue |
| pick a card's choice | `/brigade choose #<ticket> <choice number>` | `rail choose <ticket> <n>`: the card's choice `n`, counted from 1 |
| it arrived, back to the kitchen | `/brigade arrived #<ticket>` | no local gesture: the ticket leaves WAITING (or TODO, when it came back from WAITING) and goes back on the rail, queued, without going through TODO |

The reason of a `send-back` and the answer of an `answer` run to the end of the comment: the rest of
the first line, then the next lines. `merge`, `set-aside` and `arrived` take nothing after the number, and
`choose` takes one number.

A first line that does not start with `/brigade` is not a gesture. The comment is a conversation:
the box does not read it, and does not answer it.

## Box gestures

Five more gestures, which used to exist only on the box, take no ticket number. Each runs the same
command as the one typed on the box, on the project's log, and answers with the command's own line.

| Gesture | First line | Runs, like the local gesture |
|---|---|---|
| cooks cap | `/brigade cooks <N \| auto>` | `station -- cooks <N>`: the cap of simultaneous cooks of every station, `0` for no limit, `auto` to return to the default |
| stop / resume | `/brigade stop`, `/brigade resume` | `guardrails -- stop`, `guardrails -- resume`: stops the project's cooking, reopens it and closes the breaker |
| base replay | `/brigade base replay` | `base -- replay`: replays the gates of a red base without waiting for a commit |
| grant | `/brigade grant <enable \| extend \| revoke> merge [--for <duration> \| --until <date or time>] [--uses <n>] [--no-expiry]` | `grant -- <command> merge …`: the options are those of the local `grant` |
| station cooks | `/brigade station <stop \| start> <station>` | `station -- stop <station>`, `station -- start <station>`: the project's cooking on one station |

A gesture with a missing or invalid argument (`/brigade cooks many`, `/brigade grant enable deploy`)
is answered `**Not understood**` in one line saying what was expected, and nothing is written. An
option the local `grant` refuses (`--for soon`) is answered `**Not done**` with its own reason.
Like the others, a box gesture is run once, and only for the chef's account. Its cost is always
`none: only the log is written`.

## Examples

Merge the green delivery of #123, which waits for lack of a `merge` grant:

```
/brigade merge #123
```

Send the delivery of #123 back to a cook. The reason becomes a candidate lesson of the project, as
with `rail send-back`:

```
/brigade send-back #123 the CSV export misses the header row
```

Take #123 off the rail. It is not cooked, and putting `fire` back brings it back:

```
/brigade set-aside #123
```

Answer the TODO card of #123 in your own words. The answer may run over several lines:

```
/brigade answer #123 Neither: an Excel export,
on top of the CSV.
```

Pick the second choice of the TODO card of #123:

```
/brigade choose #123 2
```

Change the cap to four cooks at a time, stop the kitchen, and open it again:

```
/brigade cooks 4
/brigade stop
/brigade resume
```

Replay the gates of a red base, let the pass merge for four hours, take the grant back, and stop the
project's cooking on one station:

```
/brigade base replay
/brigade grant enable merge --for 4h
/brigade grant revoke merge
/brigade station stop box/claude
```

## Who is obeyed

Only a comment written by **the chef's GitHub account** is run. That account is the one the box's
`gh` is logged in as (`gh api user` on the box), the account the box was installed with. It is never
a role's GitHub App. A gesture written by anyone else is ignored silently: nothing runs, and nothing
is answered.

The actions run under the pass's identity when the roles have their own Apps
(`BRIGADE_GITHUB_APPS_DIR`), otherwise under the box's `gh`. Their calls are a chef's gesture, so a
low GitHub quota does not hold them. The comments are read, and the replies posted, under the
manager's identity, like the board itself.

## The reply

The box answers each gesture of the chef with one comment of one line. It links the gesture's
comment, and never starts with `/brigade`:

- `**Done** — [merge #123](…) — cost: …`: the action ran, and its cost is the one the local gesture
  states;
- `**Not done** — [merge #123](…): …`: the action refused, for the reason the local gesture gives
  (no delivery waits to be merged, a ticket in progress, GitHub refused…), and nothing changed;
- `**Not understood** — [your gesture](…): unknown gesture “mergee”. Accepted, on the first line: …`:
  the first line starts with `/brigade` but follows no form of the grammar, and the reply lists every
  form.

If GitHub refuses the reply, the gesture is not played again. The box posts the reply again on the
next pass, and says so once in its log.

## Once, and only once

Each gesture read is written to the log (`board.gesture`), under the GitHub id of its comment. That
id grows from one comment to the next, and the largest one read is the box's cursor. Only the
comments written after it are read, and a comment is never played twice, even after a restart.
The action runs before the fact is written. If the runtime stops between the two, the box plays the
gesture again at startup, and the action then refuses it: the PR is already merged, or nothing waits
for the chef anymore.

## What the apps read

The board's machine block (`runtime/src/tableau/rendu/bloc.ts`) carries the last 20 gestures, the
oldest first, in `tableau.gestes`. Each one has `commentaire` (the comment's id), `url`, `le` (its
time on GitHub), `geste` and `ticket` (null for a gesture not understood), `etat` (`pris`: run;
`refuse`: refused or not understood), `traiteLe` (when the box read it) and `reponse` (the line it
answered). A gesture read makes the box rewrite the board at once, so an app sees it taken into
account at the box's next read, within the minute. A block written before this field has no
`gestes`.
