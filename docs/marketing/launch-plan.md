# Launch plan: "you are no longer at your computer"

Internal draft. **Nothing is posted from this repository.** The chef reads this plan, edits it and publishes by hand, after #1912. No file here holds a command, script or API call that publishes. Epic: #1546.

Angle chosen by the chef on 2026-11-07: [`positioning.md`](positioning.md). Demo video: [`demo-script.md`](demo-script.md) (#1550). This plan supersedes the older [`docs/communication/plan-lancement.md`](../communication/plan-lancement.md) for the angle; its two Reddit and LinkedIn drafts predate it.

Links used in every post: site https://benomite.github.io/brigade/ and repo https://github.com/benomite/brigade. Terms follow [`docs/glossary.md`](../glossary.md).

## Before publishing (gate)

1. **#1912 is done**: a stranger installed Brigade and cooked a first ticket with only the README and the app. Do not post before. A reader whose first install fails does not come back.
2. **Recount the figures** in the posts (merged PRs, share cooked by the kitchen). Those below were counted on `main` on 2026-11-07 (see [`positioning.md`](positioning.md) for the commands): 1,191 merged PRs, 1,016 (85%) from a `cook/<n>-…` branch.
3. **Add the demo video link** where a post says `[DEMO LINK]` (or embed it where the place allows).
4. **Turn Pages on, once** (#2872): in the repo, Settings → Pages → Source: **GitHub Actions**. Until then `.github/workflows/pages.yml` builds but the site is not served; then re-run it (Actions → pages → Run workflow) or push to `site/`, and open https://benomite.github.io/brigade/ to check it shows the landing page.
5. **Read each place's rules in a browser** (next section) and apply the checklist.

## Repo card: description, topics, social preview

The chef runs this once, by hand, before the first post (it changes the repo's public settings, so nothing here runs on its own).

- **Description** (English, 111 characters, limit 119): `AI agents work your GitHub tickets while you're away from your computer. Open source, runs on your Claude plan.`
- **Topics**: `claude-code`, `ai-agents`, `github`, `automation`, `developer-tools`, `desktop-app`.

```
gh repo edit benomite/brigade --description "AI agents work your GitHub tickets while you're away from your computer. Open source, runs on your Claude plan." --add-topic claude-code --add-topic ai-agents --add-topic github --add-topic automation --add-topic developer-tools --add-topic desktop-app
```

**Social preview (chef):** upload `docs/marketing/social-preview.png` in Settings > Social preview. That file does not exist yet: it waits for the app capture (`docs/marketing/assets/app-capture.png` or `.gif`, #2873), which is not in the repo, and no substitute is made up. Once the capture is added, the image is composed from the logo `docs/logo/brigade-logo-clair.svg` and that capture.

## Rules: what is verified and what is not

**Acceptance criterion 1 is not fully met, on purpose.** The station tried again on 2026-11-07 through a fetch tool: `news.ycombinator.com` (showhn.html, newsguidelines.html) answered "proxy refused the connection", and `www.reddit.com` / `old.reddit.com` (`about/rules.json` for r/ClaudeAI, r/ClaudeCode, r/SideProject) answered "unable to fetch". No rule text was readable, so none is quoted; inventing one from memory would be worse than a gap. **Decision for the chef**: open the links below in a browser and paste the exact sentences into the "Rule quoted" lines, or paste them to a cook to fold in. Until then the criterion is open.

The station has no authenticated browser: Reddit and LinkedIn refuse unauthenticated tools (proxy `403`, already recorded on 2026-10-23 and 2026-11-01 in the older plan), and a web search on 2026-11-07 returned no rule text for the subreddits. **So no rule below is quoted from memory.** Each place gives its rules link and the one-line check the chef must do; the chef pastes the exact sentence into the "Rule quoted" line when reading the page. The only facts taken from a search are marked "(secondary source)" and are not rules.

## Places, in posting order

Space them out: Show HN and Reddit on a weekday morning US Eastern time, never two the same day, so the chef can answer every comment within the hour. One author, same disclosure everywhere: "I built it."

### 1. r/ClaudeAI — day 1

- **Why first**: cooks are real `claude` sessions; the community closest to the product.
- **Angle**: the *how*. Close the laptop, the ticket still gets cooked. Ask for feedback on the trust model, not for stars.
- **Rules link**: https://www.reddit.com/r/ClaudeAI/about/rules (sidebar and wiki; also https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam).
- **Rule quoted**: *chef to paste.* Not verified. Seen in search (secondary source): the sub pins a "Built with Claude" project showcase megathread and flairs promotion posts. Check whether a project must go in that thread or carry the Promotion flair.
- **Checklist**: flair, disclosure that you are the author, link policy, whether a standalone post is allowed at all.

### 2. r/ClaudeCode — day 2

- **Why**: Claude Code users who already run agents; the "while I'm away" use case lands here.
- **Angle**: the workflow and the guardrails (caps, stop, worktree per ticket), shorter than r/ClaudeAI. Do not repost the same text.
- **Rules link**: https://www.reddit.com/r/ClaudeCode/about/rules
- **Rule quoted**: *chef to paste.* Not verified. Search showed only that self-promotion is a common post type there (secondary source), which is not a rule.
- **Checklist**: same as above; if posting twice in two subs is flagged as spam, wait a week.

### 3. Show HN — day 4

- **Why third**: HN rewards something people can try. Post once the two Reddit threads have surfaced the first install problems and they are fixed.
- **Angle**: plain and technical. What it does, what it costs, how it can go wrong. No adjectives.
- **Rules link**: https://news.ycombinator.com/showhn.html and https://news.ycombinator.com/newsguidelines.html
- **Rule quoted**: *chef to paste.* The Show HN page says (secondary source, a search excerpt) that Show HN is for something you made that people can try; a landing page alone is not enough. Brigade qualifies only because the app is downloadable: the post links the repo, not the site.
- **Checklist**: title starts with "Show HN:", no promotional wording, no request for upvotes, no asking friends to vote, stay in the thread to answer.

### 4. r/SideProject — day 6

- **Why**: a feedback-oriented sub for makers; a more personal story.
- **Angle**: the maker's story, "I wanted to leave my desk and keep shipping". Ask what is missing.
- **Rules link**: https://www.reddit.com/r/SideProject/about/rules
- **Rule quoted**: *chef to paste.* Not verified. Search sources disagree on how promotion-friendly it is (secondary source), so read it.
- **Checklist**: whether a project post needs a template or flair, and whether the poster must answer feedback.

### 5. LinkedIn — day 8

- **Why**: about a week after the technical audience, the same story told as a work-organisation one.
- **Angle**: "you are no longer at your computer", as a way of working: a backlog worked through while you are elsewhere, and you are called only for your decisions.
- **Rules link**: https://www.linkedin.com/legal/professional-community-policies
- **Rule quoted**: *chef to paste.* Not verified (LinkedIn refuses unauthenticated reads).
- **Checklist**: put the repo link in the first comment rather than the body if the chef prefers reach; no engagement baiting.

### 6. The Claude community — day 10

- **Why last**: it is the most official place, so post when the product has shown it holds up and there are real answers to link.
- **Which place**: the official Claude Discord server (invite from https://www.anthropic.com/community), in its showcase or projects channel if it has one. Channel names could not be verified from the station: the chef confirms one exists before posting, and if none does, skips this place rather than use a general channel.
- **Angle**: a short showcase for people building with Claude Code, with a question about subscription limits.
- **Rules link**: the server's `#rules` channel, read after joining (a Discord channel has no public URL). Not verified from the station.
- **Rule quoted**: *chef to paste.* Not verified.
- **Checklist**: use the showcase or projects channel only, no cross-posting the same text to several channels.

## Ready-to-paste first posts

Placeholders: `[DEMO LINK]`, and the figures to recount. Everything else can be pasted.

### 1. r/ClaudeAI

**Title**

I built an open-source app where Claude Code cooks work my GitHub tickets while I'm away from my computer

**Body**

I'm a solo dev. I got tired of babysitting agent sessions, so I built Brigade around one idea: all the coordination lives in GitHub, never in a session's memory, so I can close the laptop and the work goes on.

How you use it:

1. Download the app (Mac or Windows) and sign in with GitHub and Claude. No server, no ssh, no config file.
2. Pick one of your repositories.
3. Open an issue with observable acceptance criteria and put the `fire` label on it.

What happens next:

- A real `claude` session (a "cook") takes the ticket in its own git worktree and opens a pull request.
- A "pass" judges the PR: your gates, your CI and an independent review. Only a green PR merges.
- Guardrails: caps on duration, tokens and simultaneous cooks, a breaker after repeated failures, and one `stop` that halts every cook.
- It only calls you for a product or design choice, or a review only you can make. On my phone that is a GitHub notification, plus a notification in the Android app.

Brigade builds itself: 1,016 of its 1,191 merged PRs (85%) came from a cook's branch (the branch name shows who cooked, not who clicked merge). Demo, two minutes: [DEMO LINK]

It's young and opinionated, and the cooks run on your Claude Max session (an API key does not fit). Does a ticket-in, reviewed-PR-out loop match how you'd trust agents with your repo? Where would you want a human gate I haven't put?

Site: https://benomite.github.io/brigade/ · Repo (MIT): https://github.com/benomite/brigade

### 2. r/ClaudeCode

**Title**

Claude Code cooks in git worktrees, one per GitHub ticket, so you can leave the keyboard (open source)

**Body**

I wanted Claude Code to keep working when I'm not at my computer, without a pile of sessions to watch. Brigade is what I ended up with.

- Put the `fire` label on a GitHub issue; a `claude` session takes it in its own worktree and opens a PR.
- A separate pass runs your gates and CI and reviews the PR before merging.
- Each ticket is bounded: a cap on duration and tokens, an idle stop, a breaker, and a `stop` for everything.
- If a cook dies, the committed work survives and the next cook resumes from it.
- Questions that are really yours come to your phone; everything else it settles itself.

It runs on Claude Max sessions. Desktop app for Mac and Windows. Demo: [DEMO LINK]

I'd like to hear where the guardrails are too loose or too tight in your own setups.

https://benomite.github.io/brigade/ · https://github.com/benomite/brigade

### 3. Show HN

**Title**

Show HN: Brigade, Claude Code agents that work your GitHub tickets while you're away

**Text** (form to confirm against the HN pages: URL field = the repo, this text as the first comment; HN also accepts a text-only submission, but then there is no URL)

Hi HN, I'm the author. Brigade is an MIT-licensed desktop app (Mac, Windows) plus a runtime. You put a `fire` label on a GitHub issue; a `claude` session takes it in its own git worktree and opens a PR; a separate "pass" runs the gates and CI, has a model review it, and merges only if everything is green. You are called only for product or design choices.

What it is not: it is not hosted, it does not use an API key (the cooks run on your Claude Max session), and automatic merge is off by default. It exists only under a `merge` grant you enable, which can be limited in time and uses, and every use is logged.

Numbers, counted on 2026-11-07: of 1,191 merged PRs in this repo, 1,016 came from a cook's branch. The branch name shows who cooked, not who clicked merge.

Known limits: self-healing is partly done, teams (one question routed to the right human) are not shipped, and the review is a model, not a person.

Repo: https://github.com/benomite/brigade · Site: https://benomite.github.io/brigade/ · Demo: [DEMO LINK]

I'd like to hear what would make you trust, or not trust, an agent merging into your repo.

### 4. r/SideProject

**Title**

I built Brigade so my side project keeps shipping when I'm not at my computer

**Body**

My side projects stall when I leave the desk. So I built a small kitchen for them: I write a ticket on GitHub, put a label on it, and an AI agent (Claude Code) cooks it in its own branch and opens a pull request. Another step checks it and merges it if the tests are green. I'm only called for the choices that are mine, on my phone.

It's open source (MIT), a desktop app for Mac and Windows. It builds itself: most of its merged PRs come from its own agents' branches.

What I'd love to know: would you leave your own side project to something like this, and what would stop you? Two-minute demo: [DEMO LINK]

https://benomite.github.io/brigade/ · https://github.com/benomite/brigade

### 5. LinkedIn

You can't stay at your desk all day. Your backlog doesn't care.

For months I've worked differently: I write a ticket, I leave, and the work is done when I come back. I built a tool for it, Brigade.

How it works: I describe what I want to an assistant, which writes the ticket. An AI agent takes it in its own branch and opens a pull request. A second step checks the tests and reviews it, and merges it if everything is green. I'm called, on my phone, only for what is mine to decide.

The proof is the project itself: 1,016 of its 1,191 merged pull requests (85%) came from an agent's branch.

Three things I learned: bounding every agent (time, tokens, a stop button) matters more than making it smarter; the backlog is the only place where work should be coordinated; and "what needs a human" has to be written down, or everything comes back to you.

It's open source and free; the agents run on your own Claude subscription. Two-minute demo in the first comment.

First comment: Demo [DEMO LINK] · Site https://benomite.github.io/brigade/ · Repo https://github.com/benomite/brigade

### 6. Claude community (showcase channel)

**Title / first line**: Brigade: Claude Code cooks that work GitHub tickets while you're away

Hi all, I built Brigade, an open-source app (Mac, Windows) that runs Claude Code sessions on your GitHub tickets. Label an issue `fire`, a session opens a PR in its own worktree, a separate pass checks and merges it, and you're pinged only for decisions that are yours. It runs on a Claude Max session.

Demo: [DEMO LINK] · Site: https://benomite.github.io/brigade/ · Repo: https://github.com/benomite/brigade

Question for the group: how many parallel Claude Code sessions does your plan allow before you hit limits?

## The three likely objections

Use these as answers in the threads. Each ends on what is true today; do not promise more.

### 1. "The Max plan is expensive"

- Brigade itself costs nothing: MIT, no subscription, no per-ticket fee, no commission ([`site/tarifs.html`](../../site/tarifs.html)).
- The cooks use the Claude Max session you already pay for. An API key does not fit, so there is no per-token surprise bill; the limit is your plan's.
- The only other cost is a machine, if you choose a cloud station, paid to your own provider. A station runs only while the rail has servable tickets.
- You set the ceiling: caps on duration, tokens and simultaneous cooks ([`docs/runtime/garde-fous.md`](../runtime/garde-fous.md)), so a runaway ticket cannot use more than you allowed.
- Honest limit: if you do not have Max, Brigade is not for you yet. Say so.

### 2. "I don't trust auto-merge"

- It is off by default. Automatic merge exists only under a `merge` grant that you enable, and that can be limited in time (`--for 4h`) and in uses (`--uses 10`). It lapses on its own and you can revoke it without a restart ([`docs/runtime/pass-merge.md`](../runtime/pass-merge.md)).
- A PR merges only when the gates, the project's CI and an independent review are green; GitHub refuses the merge if the branch moved after it was judged.
- Every use is logged (ticket, PR, commit, verdict), so "why is this on `main`?" has an answer.
- Honest limit, stated in the doc: with a grant active, code lands without a human having read it; its judges are the gates, the CI and a reviewer that is a model. Without a grant, you merge by hand. Suggest starting there.

### 3. "What about security?"

- Brigade has no server of its own. The app and the cooks run on your machine or your own cloud station, with your repo and your accounts. Nothing goes through a Brigade service.
- Credentials: the app signs you in to GitHub and Claude in your browser. A grant can never authorize reading the Max account credentials or acting on a project's production; asking for either is refused, even for the chef, and logged ([`docs/runtime/pass-merge.md`](../runtime/pass-merge.md)).
- Blast radius: one worktree per ticket, caps, a breaker and a `stop` that halts every cook within the second ([`docs/runtime/garde-fous.md`](../runtime/garde-fous.md)).
- Honest limits: a cook is a `claude` session that runs code on the machine you give it, so use a throwaway repository for a first run, and a dedicated machine for a cloud station. No third-party security audit exists; do not say otherwise. There is no `SECURITY.md` yet: if someone reports a vulnerability, point them to a private GitHub security advisory on the repo.

## After posting (chef)

1. Answer every comment yourself, within the hour for the first day. No reply from an account that is not yours.
2. Do not edit a post to hide a limit someone found; thank them and open a ticket.
3. Note what came back (install failures, objections not covered here) in an issue and add the new objection to the section above.
