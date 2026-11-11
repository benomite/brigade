# TODO cards: the gesture that answers each kind

A TODO card asks the chef a question (`Awaiting you`, in the words of [the glossary](glossary.md)). The answer should always be a click in the app and on the phone, never a typed command or a trip to GitHub. This page lists every kind of TODO card the app can show, and the gesture that answers it today (epic #3218, ticket #3228).

**Not every kind is answered by a button yet.** Four kinds still send the chef to GitHub, and the breaker line has no phone gesture. That makes five follow-up issues. Each one has a follow-up issue to open, with its draft in [Follow-up issues](#follow-up-issues-to-open).

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
| `merge-by-hand` of a fork PR (`runtime/src/pr-externe/pr-externe.ts`) | Merge #N? | **Not yet button-answered.** The card has no choice: merge the PR on GitHub, or type an answer, which does not merge. Reason: the card's text has no `- [merge] Merge #N` line, so nothing plays the merge. Follow-up: to open (draft 1) | **Not yet button-answered.** Same card, same text field; the merge is made on GitHub (draft 1) |
| Set aside by the station, `blocked-on-human`, with a PR to merge (`app/src/tableau/mise-de-cote-github.ts`) | Merge PR #N by hand? | **Not yet button-answered.** The line says to merge the PR on GitHub, and the card offers `open the issue`. Reason: the card carries no `todo`, so it has no choice button and no merge gesture. Follow-up: to open (draft 2) | **Not yet button-answered, and not listed.** A card without a question or a choice is not in the phone's list (draft 2) |
| Set aside by the station, `blocked-on-human`, without a PR | Lift the hold? | **Not yet button-answered.** The card says: remove the label on GitHub, or close the issue. Reason: no gesture removes `blocked-on-human` from the app. Follow-up: to open (draft 3) | **Not yet button-answered, and not listed** (draft 3) |
| Set aside by the manager: `question`, `decision` or `blocked-on-human` label (`ECARTS` in `app/src/tableau/attente-du-chef.ts`) | Answer or decide on the issue, then remove the label | **Not yet button-answered.** The answer is written on GitHub and the label removed there. Reason: no gesture reads the answer or removes the label from the app. Follow-up: to open (draft 4) | **Not yet button-answered, and not listed** (draft 4) |
| Breaker line (`app/src/vue/todo-breaker-line.js`), a line at the head of `Awaiting you`, not a card | The breaker stopped every cook after failures in a row: resume? | **Button** — `Resume` | **Not yet button-answered.** The phone's list shows cards only, and `gestes-github-telephone.ts` has no breaker gesture. Reason: the app plays `reprendreLeDisjoncteur` in its main process only. Follow-up: to open (draft 5) |

`design-validation` has one fallback: when the body of its issue does not name its pull request, the card says to validate it on GitHub (`carteDuChefDeTodo` in `app/src/carte-todo.ts`). The runtime writes that body (`runtime/src/validation-design/validation-design.ts`), so it is a damaged card, not a kind.

### Kinds the runtime can write but nothing writes today

`runtime/src/github-seul/carte-todo/carte-todo.ts` declares five kinds (`SORTES`): `blocked`, `merge-by-hand`, `product-question`, `abandoned`, `design-validation`. It has a text builder for each of `blocked` (`carteBloque`), `merge-by-hand` (`carteMergeALaMain`), `product-question` (`carteQuestionProduit`) and `abandoned` (`carteAbandon`). No code under `runtime/src` calls these four builders, so no card of `blocked` or `abandoned` is ever written, and `product-question` is written only by the stranger's-issue triage above. The app knows how to word all five (`QUI_M_ATTEND_DU_CHEF` in `app/src/faits.ts`). Were one written with its builder's text, it would have no choice line and would be answered by free text only. No follow-up is opened for them: the app shows no such card. If one of them is wired to a writer, it owes its choice lines.

### The runtime's own queue, which the app does not read

`runtime/src/attend.ts` (`QUI_ATTEND`) and `runtime/src/carte-todo.ts` (`TYPES_DE_CARTE`: `product`, `design`) still describe a queue of the chef's kept in the journal. It has these entries: `merge`, `remontee`, `fermee`, `ecartee`, `illisible`, `question`, `carte`, `abandon`, `connexion`, `session`, `jeton`, `fermeture`, `base`, `setup`, `aside`, `disjoncteur`, `pause`, `renommage`, `retenue`. Their cards are built in `runtime/src/carte-todo/cartes.ts`. The app's reading no longer feeds them: `faits.attend` is overwritten by the GitHub reading (`avecLAttenteDuChef`), and the field it would read them from (`attend[].carte`, `carteDeTodo` in `app/src/carte-todo.ts`) is never given. So the app shows none of these, and they are not rows above. If the runtime's queue is shown again, this audit has to be redone for it.

### What is not an answer

- `ask the second` is the secondary action of every card, never an answer.
- `waiting for…` (desktop and phone) puts a card in WAITING until a third party answers: it defers the question, it does not answer it.
- `Relaunch` and `Close as already done` belong to a ticket set aside by `served-elsewhere` on the rail: that ticket asks the chef nothing, so it is not a TODO card.

## Follow-up issues to open

The station opens these in `benomite/brigade`, one per kind not yet answered by a button, and links each from its row above. Each states the kind, the current gesture, the reason and the expected button.

1. **Fork PR card `merge-by-hand`: answer it with a button.** Current gesture: app and phone — merge the PR on GitHub, or type an answer that does not merge. Reason: `carteDeLaPRExterne` writes no `- [merge] Merge #N` line. Expected button: `Merge #N` on the card, in the app and on the phone, as for the setup PR; a second choice to close the PR.
2. **Set aside `blocked-on-human` with a PR: answer it with a button.** Current gesture: app — merge the PR on GitHub; phone — none, the card is not listed. Reason: the card is built from the issue's labels and comments and carries no choice. Expected button: `Merge PR #N` in the app and on the phone.
3. **Set aside `blocked-on-human` without a PR: answer it with a button.** Current gesture: app and phone — remove the label on GitHub, or close the issue. Reason: no gesture removes the label from the app. Expected buttons: one that lifts the hold (removes `blocked-on-human`) and one that closes the issue.
4. **Manager set-aside (`question`, `decision`, `blocked-on-human`): answer it with a button.** Current gesture: app and phone — write the answer on GitHub and remove the label there. Reason: the card carries no choice and the answer is not read from the app. Expected buttons: the answer posted from the card, which removes the label so that the manager judges again, and one that closes the issue.
5. **Breaker line: put `Resume` on the phone.** Current gesture: app — `Resume`; phone — none. Reason: the phone lists cards only and `gestes-github-telephone.ts` has no breaker gesture. Expected button: `Resume`, on the phone, posting the same `/resume` as the app.

## Where this was read

Runtime: `runtime/src/attend.ts`, `runtime/src/carte-todo.ts`, `runtime/src/carte-todo/cartes.ts`, `runtime/src/carte-todo/forme.ts`, `runtime/src/github-seul/carte-todo/carte-todo.ts`, `runtime/src/validation-design/validation-design.ts`, `runtime/src/issue-etrangere/issue-etrangere.ts`, `runtime/src/pr-externe/pr-externe.ts`, `runtime/src/second-init/pr-de-setup.ts`, `runtime/src/carte-ci-windows.ts`. App: `app/src/tableau/attente-du-chef.ts`, `app/src/tableau/todo-github.ts`, `app/src/tableau/mise-de-cote-github.ts`, `app/src/carte-todo.ts`, `app/src/faits.ts`, `app/src/decision.ts`, `app/src/gestes-fiche.ts`, `app/src/gestes-github.ts`, `app/src/gestes-github-telephone.ts`, `app/src/gestes-refus.ts`, `app/src/tableau-gestes/reponse-github.ts`, `app/src/vue/vue.js`, `app/src/vue/cartes-du-chef/cartes-du-chef.js`, `app/src/vue/validation-design/validation-design.js`, `app/src/vue/todo-breaker-line.js`.
