# TODO cards: the gesture that answers each kind

A TODO card asks the chef a question (`Awaiting you`, in the words of [the glossary](glossary.md)). The answer should always be a click in the app and on the phone, never a typed command or a trip to GitHub. This page lists every kind of TODO card the app can show, and the gesture that answers it today (epic #3218, ticket #3228).

**Not every kind is answered by a button yet.** Four kinds still send the chef to GitHub, and the breaker line has no phone gesture. Each of these five rows links the follow-up issue that tracks it.

## What the app can show

The app reads what awaits the chef from GitHub alone (`app/src/tableau/attente-du-chef.ts`, #2460): no box and no kitchen board feed `Awaiting you` any more (#2061). So the kinds below are the ones that reading produces: a card of an issue labelled `chef-todo` (its kind is the `kind=` of its marked comment), an issue the station set aside (`blocked-on-human`), and an issue the manager set aside (`question`, `decision`, `blocked-on-human`). The breaker line, which sits at the head of `Awaiting you`, is added.

A button is a choice written on the card as a line `- [<gesture>] <label>` (`app/src/tableau/todo-github.ts`, `formeDuChef`). A card whose text carries no such line has no choice button: its answer is the free text field, which posts the typed words on the issue and puts the ticket back to the kitchen (`resume`). Typing an answer to a question is not a typed command, but it is not a one-click answer either: a card that can only be answered that way is marked as such.

On the phone, the list of `Awaiting you` shows only the cards that have a question or a choice (`app/src/vue/cartes-du-chef/`, `lesCartesDuChef` in `app/src/vue/vue.js`). Its gestures are the five of `app/src/gestes-github-telephone.ts`: answer a card, validate or send back a design card, resume, remove from the rail, and the WAITING gestures. A card without a question or a choice is not in that list.

## The kinds

| Kind | What it asks the chef | Gesture in the app | Gesture on the phone |
|---|---|---|---|
| `design-validation` | Is the screen of this green design delivery right? | **Button** — `Validate` (merges the PR) or `Send back to the kitchen` (with a comment) | **Button** — the same two |
| `merge-by-hand` of the setup PR (`runtime/src/second-init/pr-de-setup.ts`) | Merge the setup pull request #N? | **Button** — `Merge #N` | **Button** — `Merge #N` |
| `product-question` of a stranger's issue (`runtime/src/issue-etrangere/issue-etrangere.ts`) | Put it on the rail, or close it? | **Button** — `Put it on the rail with prio:N` and `Close it` | **Button** — the same two |
| `merge-by-hand` of a fork PR (`runtime/src/pr-externe/pr-externe.ts`) | Merge #N? | **Not yet button-answered.** The card has no choice: merge the PR on GitHub, or type an answer, which does not merge. Reason: the card's text has no `- [merge] Merge #N` line, so nothing plays the merge. Follow-up issue: [#3367](https://github.com/benomite/brigade/issues/3367) | **Not yet button-answered.** Same card, same text field; the merge is made on GitHub (follow-up issue: [#3367](https://github.com/benomite/brigade/issues/3367)) |
| Set aside by the station, `blocked-on-human`, with a PR to merge (`app/src/tableau/mise-de-cote-github.ts`) | Merge PR #N by hand? | **Not yet button-answered.** The line says to merge the PR on GitHub, and the card offers `open the issue`. Reason: the card carries no `todo`, so it has no choice button and no merge gesture. Follow-up issue: [#3368](https://github.com/benomite/brigade/issues/3368) | **Not yet button-answered, and not listed.** A card without a question or a choice is not in the phone's list (follow-up issue: [#3368](https://github.com/benomite/brigade/issues/3368)) |
| Set aside by the station, `blocked-on-human`, without a PR | Lift the hold? | **Not yet button-answered.** The card says: remove the label on GitHub, or close the issue. Reason: no gesture removes `blocked-on-human` from the app. Follow-up issue: [#3369](https://github.com/benomite/brigade/issues/3369) | **Not yet button-answered, and not listed** (follow-up issue: [#3369](https://github.com/benomite/brigade/issues/3369)) |
| Set aside by the manager: `question`, `decision` or `blocked-on-human` label (`ECARTS` in `app/src/tableau/attente-du-chef.ts`) | Answer or decide on the issue, then remove the label | **Not yet button-answered.** The answer is written on GitHub and the label removed there. Reason: no gesture reads the answer or removes the label from the app. Follow-up issue: [#3370](https://github.com/benomite/brigade/issues/3370) | **Not yet button-answered, and not listed** (follow-up issue: [#3370](https://github.com/benomite/brigade/issues/3370)) |
| Breaker line (`app/src/vue/todo-breaker-line.js`), a line at the head of `Awaiting you`, not a card | The breaker stopped every cook after failures in a row: resume? | **Button** — `Resume` | **Not yet button-answered.** The phone's list shows cards only, and `gestes-github-telephone.ts` has no breaker gesture. Reason: the app plays `reprendreLeDisjoncteur` in its main process only. Follow-up issue: [#3371](https://github.com/benomite/brigade/issues/3371) |

`design-validation` has one fallback: when the body of its issue does not name its pull request, the card says to validate it on GitHub (`carteDuChefDeTodo` in `app/src/carte-todo.ts`). The runtime writes that body (`runtime/src/validation-design/validation-design.ts`), so it is a damaged card, not a kind.

### What is not an answer

- `ask the second` is the secondary action of every card, never an answer.
- `waiting for…` (desktop and phone) puts a card in WAITING until a third party answers: it defers the question, it does not answer it.
- `Relaunch` and `Close as already done` belong to a ticket set aside by `served-elsewhere` on the rail: that ticket asks the chef nothing, so it is not a TODO card.

## Where this was read

Runtime: `runtime/src/attend.ts`, `runtime/src/carte-todo.ts`, `runtime/src/carte-todo/cartes.ts`, `runtime/src/carte-todo/forme.ts`, `runtime/src/github-seul/carte-todo/carte-todo.ts`, `runtime/src/validation-design/validation-design.ts`, `runtime/src/issue-etrangere/issue-etrangere.ts`, `runtime/src/pr-externe/pr-externe.ts`, `runtime/src/second-init/pr-de-setup.ts`, `runtime/src/carte-ci-windows.ts`. App: `app/src/tableau/attente-du-chef.ts`, `app/src/tableau/todo-github.ts`, `app/src/tableau/mise-de-cote-github.ts`, `app/src/carte-todo.ts`, `app/src/faits.ts`, `app/src/decision.ts`, `app/src/gestes-fiche.ts`, `app/src/gestes-github.ts`, `app/src/gestes-github-telephone.ts`, `app/src/gestes-refus.ts`, `app/src/tableau-gestes/reponse-github.ts`, `app/src/vue/vue.js`, `app/src/vue/cartes-du-chef/cartes-du-chef.js`, `app/src/vue/validation-design/validation-design.js`, `app/src/vue/todo-breaker-line.js`.
