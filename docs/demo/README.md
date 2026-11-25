# Demo video

`brigade-demo.mp4` — 38 s, 1440×900, H.264, about 0.4 MB. `poster.png` is the frame at 0:04.

Following the chef's answer on #1550, this is a motion-style walkthrough built from renders of the V2 app's real views (`scripts/capture-ecran/`, frozen sample data), not a live screen recording. Each shot fades into the next.

The real work it stands for: issue <https://github.com/benomite/brigade/issues/4061>, merged by PR <https://github.com/benomite/brigade/pull/4203> (branch `cook/4061-github`).

## Script

| Time | Shot | Screen shown (`capture.ts` screen) |
|---|---|---|
| 0:00–0:08 | The issue: the second drafts the ticket, the chef answers "Yes, put it on the rail" | `premier-ticket-brouillon` |
| 0:08–0:15 | The ticket on the rail: "is on the rail: the kitchen serves it", queued in the first column | `premier-ticket-sur-le-rail` |
| 0:15–0:23 | The cook working: the ticket in Taken, "writing …" activity line | `demo-cook-rail` |
| 0:23–0:30 | The PR at the pass: the ticket in Pass, "in pass", its PR link | `recit-premier-ticket` |
| 0:30–0:38 | The merge: "Served — the pass merged the PR", the ticket is done | `recit-premier-ticket-servi` |

`shots/` holds one frame extracted from the video inside each shot (at 0:04, 0:12, 0:19, 0:26, 0:35).

## Rebuilding

`sh docs/demo/build.sh` renders the five screens into `docs/demo/src/` and assembles the video and the poster with ffmpeg (fades, H.264, no audio). It is not part of the test run. The committed video predates the script, whose timings are approximate: it has not been run, because ffmpeg was not available where it was written.
