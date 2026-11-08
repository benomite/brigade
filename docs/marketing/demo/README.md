# Demo video sources

Real captures of the scenes of [`../demo-script.md`](../demo-script.md), for the motion design made outside this repo (#1550, ticket #2875). Nothing here is generated or faked.

Script check (done before capturing): `docs/marketing/demo-script.md` exists and lists 8 scenes (1 Hook, 2 The chef talks with the second, 3 The ticket goes on the rail, 4 A cook takes it, 5 The pass merges it, 6 The phone asks, 7 The chef answers from the phone, 8 Close). All 8 are defined.

## How the app screens were made

With `scripts/capture-ecran/` (headless Chromium, the app's real view in `app/src/vue/`, frozen data, no `claude`, no box, no network), at 2x pixel density (`--densite 2`, an option added to that tool for this ticket). Nothing under `app/` or `runtime/` was modified.

**One project, one ticket.** The frozen data of the demo (`scripts/capture-ecran/ecrans/demo-commun.ts`) holds a single project, `parade`, and a single ticket, **#21 "L'export du journal"**, followed through its life: proposed by the second, queued on the rail, taken by the cook of `box/claude`, a product question for the chef, the answer, the cook back at work, served. No other ticket and no other project is on any screen. No screen shows `test`, `foo` or a dev path.

Two things to know when cutting the video:

- The script's scene 5 (the pass merges) comes before scene 6 (the phone asks). The captures keep #21 for both, as one ticket was asked for: in the data, #21 asks its product question before it is served. The script says "next ticket" for scene 6: the motion design can say it, the card on screen is the same one.
- The cook's activity line says `writing app/src/export.ts · 2 min` and the history of the served ticket carries real-looking times, but they are frozen data, not a recording.

## Files

PNG, 2x pixel density (2880 px wide for the desktop screens, 824 px wide for the phone ones).

| File | Scene | Caption |
|---|---|---|
| `2-1-second-proposes-ticket.png` | 2 | The second, in its terminal on `parade`: the chef's request, a short plan, one proposed ticket (the journal export) and a one-click choice. |
| `3-1-rail-queued.png` | 3 | The rail of `parade`: #21 "L'export du journal" in the "On the rail" column, queued. |
| `4-1-cook-writing.png` | 4 | The Taken column: #21 taken, its cook says what it does and for how long (`writing app/src/export.ts · 2 min`). |
| `4-2-cook-station.png` | 4 | The Cooks page of `parade`: its station `box/claude` is cooking, #21 under it. |
| `5-1-pass-served-ticket.png` | 5 | The card of #21 once served: arrived, taken, delivered, reviewed green, judged green, merged by the pass, and its cost. App side of scene 5 only. |
| `6-1-phone-todo-card.png` | 6 | The TODO card of #21 at phone width (412 px): the one product question, one button per choice, a free-text field. |
| `7-1-phone-answer-sent.png` | 7 | The same card after a tap on the first choice: it recalls the answer and says `sent, waiting for the kitchen`. |
| `7-2-rail-cook-resumed.png` | 7 | Back on the laptop: #21 taken again, the cook is running the tests. |

Total weight of the folder as delivered, this README included: 1001105 bytes (0.95 MiB), under the 15 MB limit.

## Missing captures

| Scene | What is missing | Why | What it would need |
|---|---|---|---|
| 1 Hook, 8 Close | the footage and the logo/URL | not screens of the app; filmed or drawn outside the repo | n/a |
| 3 | the GitHub issue list with the ticket's labels | GitHub screens, see below | n/a |
| 5 | the pull request turning green, the review verdict, the merge, the closed issue | GitHub screens, see below | n/a |
| 6, 7 | the lock-screen notification and the phone's own system UI | not the app; the phone's screen recording, outside the repo | n/a |

## GitHub screens: not captured, to redo from a machine with full access

The ticket chosen by the chef (comment of 2026-11-08) is [benomite/brigade#2746](https://github.com/benomite/brigade/issues/2746) "Mention the chef on GitHub on each TODO card", served by [PR #2765](https://github.com/benomite/brigade/pull/2765). It exists and is public, so these screens **are to be captured**: only this station cannot do it.

The page HTML is reachable from this station (HTTP 200 on the issue), but its egress proxy refuses `github.githubassets.com` (no answer), where GitHub serves its CSS and scripts. A page rendered without them is unstyled and is not what GitHub looks like, so no screenshot was taken. To capture on a machine that reaches github.com, at 2x and desktop width:

- the issue: https://github.com/benomite/brigade/issues/2746 (scene 3, scene 5)
- the pull request, checks green: https://github.com/benomite/brigade/pull/2765 (scene 5)
- the review verdict and the merge, on the same PR page, in its conversation (scene 5)

Nobody created, commented on or published anything on GitHub for this. Note that these GitHub screens show #2746, while the app screens show the demo ticket #21: the video must not claim they are the same ticket.

## Phone source (scenes 6 and 7)

The app at phone width (412 × 915 CSS px, rendered at 2x by the headless browser from the app's real view), not the Android app: no Android build or emulator is available on this station, and the chef's answer of 2026-11-08 decided that scenes 6 and 7 are the app's screens at phone width. The capture scrolls the columns row to the TODO card, as a finger would. In `7-1`, the tap is a real click on the first choice, played in the view; the station's answer (the posted comment) is the frozen data's, since no station runs here.

The card's `played by the kitchen` state is not captured: at this commit the app no longer fills it (nothing sets `envoi` on a TODO card since #2061), so the tool's older `todo-carte-repondue` screen renders the unanswered card. `7-2` shows the kitchen's carry on from the rail instead.
