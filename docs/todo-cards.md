# TODO cards: the gesture that answers each kind

A TODO card asks the chef a question (`Awaiting you`, in the words of [the glossary](glossary.md)). TODO is not a column (#3458): on the rail, a TODO card is a red card in the column of its stage, first in it, and the `TODO (N)` list above the columns counts them and answers them. The answer should always be a click in the app and on the phone, never a typed command or a trip to GitHub. This page lists every kind of TODO card the app can show, and the gesture that answers it today (epic #3218, ticket #3228).

The breaker line is answered by a button on the phone too (#3371).

## The TODO is the tickets parked for the chef (#4261)

Rule 13 of [the simplified process](superpowers/specs/2026-11-24-simplified-process.md): a ticket that waits for someone is **parked** — who, for what, until when. The chef's TODO is **exactly the tickets parked for the chef**: a card is red, and in the TODO, when the « who » of its parked record is the chef (`parqueDe` in `app/src/bon.ts`, `estRouge` in `app/src/vue/todo/todo.js`). Every card of `Awaiting you` — each kind below — is parked for the chef, for its question (or, without one, for what its card waits for), with no date (`app/src/faits.ts`). Not in the TODO:

- a ticket parked for someone else — a third party in WAITING, even when the queue names it, or `Awaiting others`;
- a ticket parked until a date, even a passed one: its card says its follow-up passed, and stays where it waits;
- the repository not set up for Brigade, which is not a ticket: its notice and its button are next to the TODO, under the columns.

### A TODO entry

Above the columns, `TODO (N)`, then one entry per ticket parked for the chef (`poserLeTodo` in `app/src/vue/cuisine/cuisine.js`):

1. its number and title — a click opens its card, where its free answer field and `ask the second` are;
2. what is asked — the « for what » of its parked record;
3. its buttons, the ones of its card (`gestesDuTodo`):

| The card | Its buttons on the TODO entry |
|---|---|
| A card with choices — a `chef-todo` card, a ticket set aside by the station or the manager, a stranger's issue, an epic's question | One per choice, in the card's order; the recommended one filled with the accent. While its answer is on its way, or posted and waiting for the kitchen, it has none |
| `design-validation` | `Validate`; `Send back to the kitchen`, which needs a comment, is on its card |
| `review before merge` | `Merge`; `Send back`, which needs a note, is on its card |
| A ticket in WAITING parked for the chef | `resume` and `it arrived, back to the kitchen` |
| A card answered only in words | None: its number opens its card and its field |

On a project in read-only (#3163), the entries say what is asked, with no button.

### Answering sends the ticket on

A button of a TODO entry plays the same gesture as the same button on its card, with no copy-paste: a choice is posted on the issue, then its gesture is played (`app/src/tableau-gestes/reponse-github.ts`), which removes what parked the ticket for the chef — `chef-todo`, and `served-elsewhere`, `blocked-on-human`, `question` or `decision` for the gestures that lift them. The ticket keeps `fire` and the label of its step (`in-pass`): at the next reading it leaves the TODO and is back at the step it was at — in Pass for a delivery the chef answered about, ready on the rail for a ticket the station had set aside. `Validate` and `Merge` merge the pull request; `resume` and `it arrived` take the ticket out of WAITING.

## What the app can show

The app reads what awaits the chef from GitHub alone (`app/src/tableau/attente-du-chef.ts`, #2460): no box and no kitchen board feed `Awaiting you` any more (#2061). So the kinds below are the ones that reading produces: a card of an issue labelled `chef-todo` (its kind is the `kind=` of its marked comment), an issue the station set aside (`blocked-on-human`), an issue the manager set aside (`question`, `decision`, `blocked-on-human`), and an epic the manager asked a question before splitting. The breaker line, which sits next to the `TODO (N)` entry, outside the columns (#3458), is added.

A button is a choice written on the card as a line `- [<gesture>] <label>` (`app/src/tableau/todo-github.ts`, `formeDuChef`). A card whose text carries no such line has no choice button: its answer is the free text field, which posts the typed words on the issue and puts the ticket back to the kitchen (`resume`). Typing an answer to a question is not a typed command, but it is not a one-click answer either: a card that can only be answered that way is marked as such.

On the phone, the list of `Awaiting you` shows only the cards that have a question or a choice (`app/src/vue/cartes-du-chef/`, `lesCartesDuChef` in `app/src/vue/vue.js`). Its gestures are the six of `app/src/gestes-github-telephone.ts`: answer a card, validate or send back a design card, resume the breaker, resume, remove from the rail, and the WAITING gestures. A card without a question or a choice is not in that list. The breaker line, which is not a card, sits at the head of that list when the breaker is open (#3371).

## The kinds

| Kind | What it asks the chef | Gesture in the app | Gesture on the phone |
|---|---|---|---|
| `design-validation` | Is the screen of this green design delivery right? | **Button** — `Validate` (merges the PR) or `Send back to the kitchen` (with a comment) | **Button** — the same two |
| `merge-by-hand` of the setup PR (`runtime/src/second-init/pr-de-setup.ts`) | Merge the setup pull request #N? | **Button** — `Merge #N` | **Button** — `Merge #N` |
| `product-question` of a held issue, from an author who is not trusted (`runtime/src/issue-etrangere/issue-etrangere.ts`, #4422) | Accept it, or close it? | **Button** — `Accept it` (puts `fire`: the manager judges it) and `Close it` | **Button** — the same two |
| `merge-by-hand` of a fork PR (`runtime/src/pr-externe/pr-externe.ts`) | Merge #N? | **Button** — `Merge #N` (merges the PR; a refused merge says why and the card stays) | **Button** — `Merge #N` |
| Set aside by the station, `blocked-on-human`, with a PR to merge (`app/src/tableau/mise-de-cote-github.ts`) | Merge the PR of #T by hand? | **Button** — `Merge the PR of #T` (merges the ticket's open PR and removes `blocked-on-human`; a refused merge says why and the card stays) | **Button** — `Merge the PR of #T` |
| Set aside by the station, `blocked-on-human`, without a PR (`app/src/tableau/mise-de-cote-github.ts`) | Lift the hold? | **Buttons** — `Back to the kitchen` (removes `blocked-on-human`: the ticket is back on the rail) and `Close it` (closes the issue) | **Buttons** — `Back to the kitchen` and `Close it` |
| Set aside by the manager: `question`, `decision` or `blocked-on-human` label, off the rail (`carteDeLEcart` in `app/src/tableau/mise-de-cote-github.ts`, #3370) — the manager sets `question` or `decision` itself on an issue it judges of that nature, its refusal comment carrying the decision in one sentence (#3429) | The manager's question: the last line ending in `?` of the latest comment by a repository author that asks one, unless an answer of the chef follows it; with no question on the issue, what its label waits for (`Lift the hold?` for `blocked-on-human`) | **Buttons** — one per choice the comment writes as `- [<gesture>] <label>`, else `Back to the kitchen` (removes `question`, `decision` and `blocked-on-human`: the manager judges the ticket again) and `Close it` (closes the issue); the free answer field with `send` posts your words and lifts the hold the same way. On a `question` or `decision` it judged, the manager writes one choice per answer to its question, in the question's own words (`resume`: the answer is posted and the manager judges the ticket again; `close` for the one that closes it), and, when the question waits on someone other than you, `Wait for <who>` first (`wait`: the ticket goes to WAITING, awaiting them, follow-up in seven days, and `question` and `decision` are removed) (#3434). The recommendation is the comment's `Recommended: <choice> — <why>` line, that choice the only accented button; without that line, the card recommends nothing | **Buttons** — the same, and the free answer |
| An epic the manager asked a question before splitting (`epic` label, open; its latest manager comment carries `<!-- brigade:question -->`; `app/src/tableau/question-d-epique-github.ts`) | The manager's question, from that comment, unless a comment by a repository author follows it (a station's take of the ticket does not count) or a later manager comment replaces it | **Buttons** — one per lettered choice the question writes (`(A) …`, `A) …`): the choice is posted on the epic and the manager reads it, with no other gesture; the free answer field posts your words. The epic is in TODO, not "ready" on the rail, until then | **Buttons** — the same, and the free answer |
| Breaker line (`app/src/vue/todo-breaker-line.js`), the status line of the rail, above the columns (#3523), not a card | The breaker stopped every cook after failures in a row | **None** — an information line: the station closes the breaker itself (#3911) | Not shown: the phone reads no breaker issue |

`design-validation` has one fallback: when the body of its issue does not name its pull request, the card says to validate it on GitHub (`carteDuChefDeTodo` in `app/src/carte-todo.ts`). The runtime writes that body (`runtime/src/validation-design/validation-design.ts`), so it is a damaged card, not a kind.

### What is not an answer

- `ask the second` is the secondary action of every card, never an answer.
- `waiting for…` (desktop and phone) puts a card in WAITING until a third party answers: it defers the question, it does not answer it.
- `Relaunch` and `Close as already done` belong to a ticket set aside by `served-elsewhere` on the rail: that ticket asks the chef nothing, so it is not a TODO card.

## Where this was read

Runtime: `runtime/src/attend.ts`, `runtime/src/carte-todo.ts`, `runtime/src/carte-todo/cartes.ts`, `runtime/src/carte-todo/forme.ts`, `runtime/src/github-seul/carte-todo/carte-todo.ts`, `runtime/src/validation-design/validation-design.ts`, `runtime/src/issue-etrangere/issue-etrangere.ts`, `runtime/src/pr-externe/pr-externe.ts`, `runtime/src/second-init/pr-de-setup.ts`, `runtime/src/carte-ci-windows.ts`. App: `app/src/bon.ts`, `app/src/vue/cuisine/cuisine.js`, `app/src/vue/todo/todo.js`, `app/src/tableau/attente-du-chef.ts`, `app/src/tableau/todo-github.ts`, `app/src/tableau/mise-de-cote-github.ts`, `app/src/tableau/question-d-epique-github.ts`, `app/src/carte-todo.ts`, `app/src/faits.ts`, `app/src/decision.ts`, `app/src/gestes-fiche.ts`, `app/src/gestes-github.ts`, `app/src/gestes-github-telephone.ts`, `app/src/gestes-refus.ts`, `app/src/tableau-gestes/reponse-github.ts`, `app/src/vue/vue.js`, `app/src/vue/cartes-du-chef/cartes-du-chef.js`, `app/src/vue/validation-design/validation-design.js`, `app/src/vue/todo-breaker-line.js`.
