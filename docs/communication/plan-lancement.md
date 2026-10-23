# Launch plan — Reddit and LinkedIn

Nothing in this folder posts anything. The chef reads, edits and posts personally, by hand. No file here holds a command, script or API call that publishes.

Terms follow [`docs/glossary.md`](../glossary.md). The product is described from [`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md) and [`docs/`](../README.md) (`docs/runtime/`, `docs/app.md`).

## How the rules were read

Date of the reading attempt: **2026-10-23**, from the station's shell with `curl` (descriptive User-Agent `brigade-launch-prep/1.0 (+https://github.com/benomite/brigade; reading public rules)`) and then with an HTTP fetch tool.

**No page could be read.** The station's network allows no outbound connection to these hosts: `curl` ended at the proxy with `CONNECT tunnel failed, response 403` (the proxy answers `x-brigade-refus` for the host), and the fetch tool answered `unable to fetch from www.reddit.com` / `proxy refused the connection`. So this plan records **no rule** for any place. Rules are not reconstructed from memory: for each place below, the chef reads the page before posting.

| URL | Read? | Date of the attempt |
|---|---|---|
| https://www.reddit.com/r/ClaudeAI/about/rules.json | not read — proxy refused (403) | 2026-10-23 |
| https://www.reddit.com/r/ClaudeAI/about.json | not read — proxy refused (403) | 2026-10-23 |
| https://www.reddit.com/r/LocalLLaMA/about/rules.json | not read — proxy refused (403) | 2026-10-23 |
| https://www.reddit.com/r/LocalLLaMA/about.json | not read — proxy refused (403) | 2026-10-23 |
| https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam (Reddit's self-promotion / spam help page) | not read — proxy refused (403) | 2026-10-23 |
| https://www.redditinc.com/policies/reddit-rules (Reddit Rules) | not read — proxy refused (403) | 2026-10-23 |
| https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette | not read — proxy refused (403) | 2026-10-23 |
| https://www.linkedin.com/legal/professional-community-policies | not read — proxy refused (403) | 2026-10-23 |

Whoever has an unrestricted network can redo it in a minute: fetch the same URLs with a plain GET and a descriptive User-Agent, then fill the "Rules" lines below with what the pages say, citing the URL and the date.

## Places, in posting order

### 1. r/ClaudeAI — post file: [`post-reddit-ClaudeAI.md`](post-reddit-ClaudeAI.md)

- **Why first**: Brigade is built on Claude Code (cooks are real `claude` sessions); this is the community closest to the product, and the one where a technical, honest write-up is most likely to be on topic.
- **Angle**: the *how*, not the pitch. One chef, a backlog on GitHub, and a kitchen on a box that serves tickets with cooks while the chef is away — with a pass (a reviewer plus the gates) that judges every delivery before it merges. Ask for feedback on the model, not for stars.
- **Rules**: rules not verified, chef to read the page before posting. Pages: the two `r/ClaudeAI` URLs above (not read on 2026-10-23), plus the Reddit self-promotion page (not read on 2026-10-23).
- **Compliance of the post**: rules not verified — no compliance claim can be made. The post is written to be easy to adapt (no more than one link, no sales language), but the chef checks it against the pages first.

### 2. LinkedIn — post file: [`post-linkedin.md`](post-linkedin.md)

- **Why second**: after the technical audience has had a chance to point out errors, the same story goes to a professional audience, told as a work-organisation story rather than a tooling one.
- **Angle**: how a solo chef runs a project with a kitchen of agents — the backlog is the only place work is coordinated, nothing lives in a session's memory, and the chef decides only what the kitchen puts under `awaiting`.
- **Rules**: rules not verified, chef to read the page before posting. Page: https://www.linkedin.com/legal/professional-community-policies (not read on 2026-10-23).
- **Compliance of the post**: rules not verified — no compliance claim can be made.

### Considered and not retained

- **r/LocalLLaMA** (rules URLs above, not read on 2026-10-23): not retained for a reason of fit, not of rules. Brigade drives Claude through Claude Code, not local models, so the post would be off topic for a community about local models. If the chef disagrees, this place needs its own post file and its rules read first: rules not verified.

## Before posting (chef)

1. Read each page listed for the place; copy the relevant rules here with the URL and the date.
2. Check the post file against them; edit the post if one rule is not met (for example a required flair, a disclosure of affiliation, or a ban on links).
3. Post by hand. Answer comments yourself.
