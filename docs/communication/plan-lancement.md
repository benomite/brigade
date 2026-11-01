# Launch plan — Reddit and LinkedIn

Nothing in this folder posts anything. The chef reads, edits and posts personally, by hand. No file here holds a command, script or API call that publishes.

Terms follow [`docs/glossary.md`](../glossary.md); the product is described by [`README.md`](../../README.md) and [`docs/`](../README.md).

## Rules: not read

On 2026-10-23 the station tried to read the rules pages with `curl` and an HTTP fetch tool; the network refused every host (proxy `403`). On 2026-11-01 a second attempt from the chef's workstation (`old.reddit.com/r/ClaudeAI/about/rules.json`) was refused too: Reddit answers no rules to an unauthenticated tool. So this plan records **no rule**, and none is reconstructed from memory: the chef reads each page in a browser before posting.

- https://www.reddit.com/r/ClaudeAI/about/rules.json and `about.json`
- https://www.reddit.com/r/LocalLLaMA/about/rules.json and `about.json`
- https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam (self-promotion)
- https://www.redditinc.com/policies/reddit-rules
- https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette
- https://www.linkedin.com/legal/professional-community-policies

## Before launching

The posts were rewritten on 2026-11-01 for the current product: an app for Mac or Windows, a GitHub account and a Claude account, no server and no ssh. Do not post before both are true, because a reader who fails their first install will not come back:

1. **A stranger walked the install path end to end** (#1912): a machine that never saw brigade, accounts that are not the chef's, only the README and the app.
2. **The demo video exists** (#1550), and the posts link to it, or embed it where the place allows.

## Places, in posting order

### 1. r/ClaudeAI — [`post-reddit-ClaudeAI.md`](post-reddit-ClaudeAI.md)

- **Why first**: cooks are real `claude` sessions, so this is the community closest to the product, where a technical, honest write-up is most on topic.
- **Angle**: the *how*, not the pitch. Download an app, sign in, put `fire` on an issue: a cook opens the PR and the pass judges it before it merges. Ask for feedback on the model, not for stars.
- **Compliance**: not verified. One link, no sales language, but the chef checks it against the pages first.

### 2. LinkedIn — [`post-linkedin.md`](post-linkedin.md)

- **Why second**: about a week after Reddit, once the technical audience has had its say; the same story told as a work-organisation one.
- **Angle**: 98 of the last 100 merged PRs were cooked by agents and judged by the pass; the backlog is the only place work is coordinated, and the chef decides only what sits under `awaiting`.
- **Compliance**: not verified.

### Not retained

- **r/LocalLLaMA**: off topic, since Brigade drives Claude through Claude Code, not local models. Retaining it needs its own post file and its rules read first.

## Before posting (chef)

1. Read each page; copy the relevant rules here.
2. Edit the post if a rule is not met (flair, affiliation disclosure, link ban).
3. Post by hand. Answer comments yourself.
