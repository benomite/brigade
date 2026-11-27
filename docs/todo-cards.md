# TODO cards: how the chef answers them

A TODO card asks the chef a question (`Awaiting you`, in the words of [the glossary](glossary.md)). TODO is not a column (#3458): the `TODO (N)` list above the columns counts the cards and answers them. The answer should always be a click in the app and on the phone, never a typed command or a trip to GitHub. This page says which tickets the TODO shows, and the gesture that answers them today (epic #3218, ticket #3228).

## The TODO is the tickets parked for the chef (#4261)

Rule 13 of [the simplified process](superpowers/specs/2026-11-24-simplified-process.md): a ticket that waits for someone is **parked** — who, for what, until when. The chef's TODO is **exactly the tickets parked for the chef**: on GitHub, the open issues labelled `parked:chef` (`app/src/board/wait-of-chef.ts`, `app/src/board/parked-chef-github.ts`). Not in the TODO:

- a ticket parked for someone else (`parked`), even when the queue names it, or `Awaiting others`.

### Why a ticket is parked for the chef

The kitchen (`runtime/src/kitchen/`) parks a ticket for the chef with a comment that starts with `Parked for the chef` and says why: a cook answered `PARK:` with its question, the manager parked it, or its tries ran out. A pull request the pass approves in a risk zone is parked for the chef too, with `approved` beside `parked:chef`: it waits for the chef's `merge` answer (`runtime/src/kitchen/kitchen.ts`).

### A TODO entry

Above the columns, `TODO (N)`, then one entry per ticket parked for the chef (`setTheTodo` in `app/src/vue/kitchen/kitchen.js`):

1. its number and title — a click opens its card, where its answer field and `ask the second` are;
2. what is asked — the last `Parked for the chef` comment of the kitchen, as it is. With no such comment (the label set by hand), the card says so and asks anyway.

A `parked:chef` card is answered only in words: its entry has no button, and its number opens its card and its field (`actionsOfTodo`). On a project in read-only (#3163), the entries say what is asked, with no button.

### Answering sends the ticket on

The card has one gesture, **Answer**, and `Open on GitHub` (`app/src/card-todo.ts`). Answer posts the chef's words on the issue and removes `parked:chef` (`app/src/board-actions/answer-github.ts`): at the next reading the ticket leaves the TODO and goes back on the rail, and its cook reads the answer. For a risk-zone pull request, an answer that starts with `merge` lets the kitchen merge it.

On the phone, the list of `Awaiting you` shows the cards that have a question (`app/src/vue/cards-of-chef/`): a `parked:chef` card is answered there the same way.

### What is not an answer

- `ask the second` is the secondary action of every card, never an answer.
- `waiting for…` (desktop and phone) puts a card in WAITING until a third party answers: it defers the question, it does not answer it.

## Where this was read

Runtime: `runtime/src/kitchen/decide.ts`, `runtime/src/kitchen/kitchen.ts`. App: `app/src/board/wait-of-chef.ts`, `app/src/board/parked-chef-github.ts`, `app/src/board/todo-github.ts`, `app/src/card-todo.ts`, `app/src/board-actions/answer-github.ts`, `app/src/vue/kitchen/kitchen.js`, `app/src/vue/todo/todo.js`, `app/src/vue/parked/parked-todo.js`, `app/src/vue/vue.js`, `app/src/vue/cards-of-chef/cards-of-chef.js`.
