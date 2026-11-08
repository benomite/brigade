# Demo video sources

Real captures of each scene of [`../demo-script.md`](../demo-script.md), for the motion design made outside this repo (#1550, ticket #2875).

## Status: no capture delivered

**This folder holds no PNG yet.** Every capture is missing; none is faked or generated.

Script check (done before capturing): `docs/marketing/demo-script.md` exists and lists 8 scenes (1 Hook, 2 The chef talks with the second, 3 The ticket goes on the rail, 4 A cook takes it, 5 The pass merges it, 6 The phone asks, 7 The chef answers from the phone, 8 Close). All 8 are therefore defined.

Total weight of the folder: under 1 MB (this README only), under the 15 MB limit.

## Why nothing was captured

The cook that took the ticket ran on a station with no browser, no screenshot tool and no GitHub access (`gh` is not usable there). A real screen at 2x pixel density cannot be produced without one, and the ticket forbids faking it. No file under `app/` or `runtime/` was modified, and no code change is needed for any capture below.

## Captures still to make

Naming: `<scene>-<n>-<what>.png`, PNG, 2x pixel density.

| Scene | Screens to capture | Source | Blocked by |
|---|---|---|---|
| 1 Hook | none from the repo (filmed footage) | outside the repo | n/a |
| 2 Second's conversation | terminal, the second on the demo project | terminal with the fake `claude` and a trial configuration | no screenshot tool on the station |
| 3 Rail | issue list with labels; `3-1-rail-queued.png` | GitHub issue list (existing ticket) and the app's rail view | no screenshot tool; no GitHub access |
| 4 Cook | cooks page, live terminal | app driven with the fake `claude` | no browser |
| 5 Pass merges | issue, PR, review verdict, merge | GitHub, from an already existing ticket that went through the kitchen on a public repo | no GitHub access: **ticket not chosen** |
| 6 Phone asks | TODO card as displayed on a phone | the Android app if available, otherwise the app at phone width | no browser, no emulator on the station |
| 7 Phone answers | answer gesture and confirmation | same source as scene 6 | same |
| 8 Close | logo, repository URL | outside the repo | n/a |

## GitHub ticket used for the GitHub screens

None chosen yet. No existing ticket on a public repo could be checked from the station, and none will be created for this purpose. Once one is picked, name it here (repo and number, with a link).

## Phone source

Not decided yet: the Android app (`app/android`) was not available as a running build on the station, so the fallback (the app at phone width) is the expected source. The README must be updated with the one used and why.

## Files

None yet. List each file here with its scene number and a one-line caption as it is added.
