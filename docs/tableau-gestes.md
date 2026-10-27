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
| comment on a card's issue | `/brigade comment #<ticket> <comment>` | `pass <ticket> comment <comment>`: posts the comment on the ticket's issue, word for word, under the box's own `gh` account — the chef's, never a role's App |
| ask the second | `/brigade ask #<ticket> [context]` | `pass <ticket> ask [context]`: composes the request for the second about the issue, with the context if any. Nothing is posted on the issue: the request is in the reply and in the board's machine block (`demande`, below), and the app writes it into the second, without Enter |
| answer a proposed correction | `/brigade correction <yes \| no> <proposal>` | no local gesture: "yes" accepts the correction of the project's guidance, which leaves as a PR through the pass; "no" takes it out of the queue (`runtime/src/correctif/decision.ts`) |
| answer a proposed cook profile | `/brigade profile <yes \| no> <proposal>` | no local gesture: "yes" writes the profile's definition in the project's clone on the box; "no" takes it out of the queue (`runtime/src/profils/decision.ts`) |

The reason of a `send-back`, the answer of an `answer`, the comment of a `comment` and the context of
an `ask` run to the end of the comment: the rest of the first line, then the next lines. The request
an `ask` composes is one line: the context's line breaks become spaces. `merge`, `set-aside` and
`arrived` take nothing after the number, and `choose` takes one number.

A proposed correction and a proposed cook profile are not tickets. Their number is the `proposition`
the board's machine block gives them (`faits.corrections`, `faits.profils`), written **without `#`**:
GitHub would make it the link of an issue. `correction` and `profile` take `yes` or `no`, then that
number, and nothing after it. A proposal is answered once: a second answer, the same or the other, is
`**Not done**`, and so is a number no proposal carries. A "yes" to a profile whose definition the
repository already has is `**Not done**` too, and the proposal keeps waiting.

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

Post a comment on the issue of #123, and ask the second about it:

```
/brigade comment #123 The export misses the header row.
See the attached file.
/brigade ask #123 the export is slow on big files
```

(Each gesture is its own comment.)

Accept the proposed correction 412 of the project's guidance, and decline the proposed cook
profile 377:

```
/brigade correction yes 412
/brigade profile no 377
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
(`BRIGADE_GITHUB_APPS_DIR`), otherwise under the box's `gh`. A `comment` is the chef's own words: it
is always posted under the box's `gh`, as `pass <ticket> comment` posts it. Their calls are a chef's gesture, so a
low GitHub quota does not hold them. The comments are read, and the replies posted, under the
manager's identity, like the board itself.

## The reply

The box answers each gesture of the chef with one comment of one line. It links the gesture's
comment, and never starts with `/brigade`:

- `**Done** — [merge #123](…) — cost: …`: the action ran, and its cost is the one the local gesture
  states; an `ask` adds the request it composed: `**Done** — [ask #123](…): the request for the second
  is “…” — cost: …`;
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
time on GitHub), `geste` and `ticket` (null for a gesture not understood; `ticket` is null too for
`correction` and `profile`), `etat` (`pris`: run;
`refuse`: refused or not understood), `traiteLe` (when the box read it) and `reponse` (the line it
answered). An `ask` that was played also has `demande`: the request for the second, word for word, the
one the app writes into the second. A gesture read makes the box rewrite the board at once, so an app sees it taken into
account at the box's next read, within the minute. A block written before this field has no
`gestes`.
