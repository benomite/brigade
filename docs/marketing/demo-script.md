# Demo video script — "You are no longer at your computer"

Angle chosen on 2026-11-07. Recorded by the chef in a single take (#1550). Epic: #1546.

Total: **1 min 50 s** (110 s), under the two-minute limit. Each scene gives what is on screen, what is said or captioned, and how long it lasts.

| # | Scene | Duration | Running total |
|---|-------|----------|---------------|
| 1 | Hook | 8 s | 0:08 |
| 2 | The chef talks with the second | 20 s | 0:28 |
| 3 | The ticket goes on the rail | 12 s | 0:40 |
| 4 | A cook takes it | 18 s | 0:58 |
| 5 | The pass merges it | 14 s | 1:12 |
| 6 | The chef is away: the phone asks | 20 s | 1:32 |
| 7 | The chef answers from the phone | 12 s | 1:44 |
| 8 | Close | 6 s | 1:50 |

## Scenes

### 1. Hook (8 s)
- **On screen:** the chef's desk, laptop closing, a bag on the shoulder. Caption: "Friday, 6 pm."
- **Said / captioned:** "I'm leaving. My project is not."

### 2. The chef talks with the second (20 s)
- **On screen:** terminal, the second's conversation on the demo project. The chef types the request; the second answers with a short plan and proposes one ticket.
- **Said / captioned:** "I describe what I want to the second, in plain words. It asks one clarifying question, then writes the ticket." Caption: "1. Talk to the second."

### 3. The ticket goes on the rail (12 s)
- **On screen:** the ticket appears on the project's issue list with its labels (model, effort); then the rail view in the app shows it queued.
- **Said / captioned:** "The ticket goes on the rail. The manager sizes it. I don't have to." Caption: "2. On the rail."

### 4. A cook takes it (18 s)
- **On screen:** the app's cooks page: a cook picks the ticket, the live terminal scrolls (code, tests running). Sped up ×4 with a visible clock.
- **Said / captioned:** "A cook takes it, works in its own worktree, runs the tests." Caption: "3. A cook takes it."

### 5. The pass merges it (14 s)
- **On screen:** the pull request turns green; the pass reviews and merges. The ticket closes.
- **Said / captioned:** "The pass reviews and merges. Green CI, no human needed." Caption: "4. The pass merges."

### 6. The chef is away: the phone asks (20 s)
- **On screen:** split screen. Left: the chef on a street or in a café, laptop nowhere in sight. Right: the phone lock screen shows the notification with the one question that needs the chef (#2746, or #2747 once it exists). Tap opens the question.
- **Said / captioned:** "Next ticket. One thing the kitchen can't decide: a product choice. Only that question reaches me." Caption: "5. Away. One question."

### 7. The chef answers from the phone (12 s)
- **On screen:** phone screen, the chef taps an answer; a confirmation shows. Cut to the laptop (back later): the ticket is back on the rail and a cook has taken it.
- **Said / captioned:** "I answer in one tap. The kitchen carries on." Caption: "6. Answer from the phone."

### 8. Close (6 s)
- **On screen:** Brigade logo, repository URL.
- **Said / captioned:** "Brigade. You are no longer at your computer."

## Before the take

All of this must be true before recording.

- **Project:** a real project that is **not Brigade itself**, installed and running on a station, with the runtime started and at least one cook available. Its repository has a green CI and auto-merge by the pass enabled. To decide before the take: which project (pick one with a small, visual result, e.g. a small web app).
- **Ticket:** one real, small ticket on that project, achievable by a cook in a few minutes (fast tests), already rehearsed once so the timing is known. A second ticket must exist whose only open point is a genuine product choice, so the phone question is real, not staged. Keep both rehearsal results to cut the sped-up parts.
- **Phone:** the notification channel set up and paired to the chef's phone (#2746, or #2747 once it exists), notifications allowed, do-not-disturb off, screen recording on, battery full, the phone reachable on the network. Test notification received once before the take.
- **Screen:** clean desktop, terminal font enlarged, notifications of other apps off, no secrets visible (tokens, emails).

## Fallback if the notification step is not served yet

If #2746/#2747 is not served on the day, scene 6 does not fake a push. Use the existing path instead: the ticket that needs the chef carries the `blocked-on-human` / `question` label, and the question is posted as a comment on the issue. On the phone, show the GitHub mobile app notification for that comment, then in scene 7 the chef replies in that comment from the phone. Same story, same timing; change the caption to "5. Away. One question on GitHub." and drop any claim about a dedicated notification.
