# Demo video sources

Real captures of the scenes of [`../demo-script.md`](../demo-script.md), for the motion design made outside this repo (#1550, ticket #2875). Nothing here is generated or faked.

Script check (done before capturing): `docs/marketing/demo-script.md` exists and lists 8 scenes (1 Hook, 2 The chef talks with the second, 3 The ticket goes on the rail, 4 A cook takes it, 5 The pass merges it, 6 The phone asks, 7 The chef answers from the phone, 8 Close). All 8 are defined.

## How the app screens were made

With `scripts/capture-ecran/` (headless Chromium, the app's real view in `app/src/vue/`, frozen data, no `claude`, no box, no network), at 2x pixel density (`--densite 2`, an option added to that tool for this ticket). The frozen data is the tool's one project, `parade`. Nothing under `app/` or `runtime/` was modified.

Limit, stated plainly: the frozen data holds several tickets of `parade` (#12 *Validation SIRET*, #14 *Le journal en ajout seul*, #21 *L'export du journal*, #30 *La pass verte*), not one ticket followed from scene to scene. The screens share one project and its believable names; they do not follow a single ticket through the whole story. No screen shows `test`, `foo` or a dev path.

## Files

PNG, 2x pixel density (2880 px wide for the desktop screens, 824 px wide for the phone one).

| File | Scene | Caption |
|---|---|---|
| `2-1-second-choose.png` | 2 | The second, in its terminal on `parade`, asks the chef to choose between three ways forward, one button each. |
| `3-1-rail-board.png` | 3 | The rail of `parade` in the app: tickets in Taken, Pass and Todo (the "On the rail" column is scrolled out of view to the left). |
| `4-1-cook-activity.png` | 4 | The Taken column of `parade`: each cook says what it is doing and for how long; the pass says it is running the gates. |
| `4-2-cook-stations.png` | 4 | The cooks page of `parade`: one block per station, with its cooks' tickets in progress. |
| `5-1-pass-served-ticket.png` | 5 | The ticket card of a served ticket (#9): its history, cost and the lessons its cook wrote. App side of scene 5 only. |
| `6-1-phone-todo-card.png` | 6 | The TODO card of #21 at phone width (412 px): the product question, one button per choice, a free-text field. |

Total weight of the folder: 1.1 MB (1,144,995 bytes before this README was rewritten), under the 15 MB limit.

## Missing captures

| Scene | What is missing | Why | What it would need |
|---|---|---|---|
| 1 Hook, 8 Close | the footage and the logo/URL | not screens of the app; filmed or drawn outside the repo | n/a |
| 2 | the terminal with the second proposing a ticket (script: plan + one proposed ticket) | no capture screen shows that exchange; `second-choix` is the nearest one and is delivered | a new frozen-data screen in `scripts/capture-ecran/ecrans/` |
| 3 | the GitHub issue list with the ticket's labels | GitHub screens, see below | n/a |
| 5 | the pull request turning green, the review verdict, the merge, the closed issue | GitHub screens, see below | n/a |
| 7 | the answer gesture and its confirmation on the phone | the tool's frozen data answers a tap on a choice with « nothing was sent: this project has no station » (captured, judged unusable, not delivered), and its `todo-carte-envoyee` / `todo-carte-repondue` screens render the same pixels as the unanswered card on this station | a fix to the capture fixtures in `scripts/capture-ecran/` (data that gives the project a station, or a working sent/played state); no change under `app/` or `runtime/` |

## GitHub screens: not captured

The ticket chosen by the chef (comment of 2026-11-08) is [benomite/brigade#2746](https://github.com/benomite/brigade/issues/2746) "Mention the chef on GitHub on each TODO card", served by [PR #2765](https://github.com/benomite/brigade/pull/2765).

The page HTML is reachable from this station, but the egress proxy refuses `github.githubassets.com` (HTTP 403, header `x-brigade-refus`), where GitHub serves its CSS and scripts. A page rendered without them is unstyled and is not what GitHub looks like, so no screenshot was taken. Missing, to capture on a machine with full access to github.com (2x, desktop width):

- the issue: https://github.com/benomite/brigade/issues/2746 (scene 3, scene 5)
- the pull request, checks green: https://github.com/benomite/brigade/pull/2765 (scene 5)
- the review verdict and the merge, on the same PR page, in its conversation (scene 5)

Nobody created, commented on or published anything on GitHub for this.

## Phone source (scenes 6 and 7)

The app at phone width (412 × 915 CSS px, rendered at 2x by the headless browser from the app's real view), not the Android app: no Android build or emulator is available on this station, and the chef's answer of 2026-11-08 decided that scenes 6 and 7 are the app's screens at phone width. The capture scrolls the columns row to the TODO card, as a finger would.
