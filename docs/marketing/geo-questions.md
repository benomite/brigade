# GEO: do AI assistants name Brigade?

Internal tool. Users are expected to find Brigade by asking an AI assistant rather than a search engine (the chef, 2026-11-09). This file holds a fixed list of questions a future user would ask, and the results of each monthly run. The work that should move these results is in [#3101](https://github.com/benomite/brigade/issues/3101); the wider plan is [#1546](https://github.com/benomite/brigade/issues/1546).

The second keeps this file and replays it. A cook cannot query consumer assistants.

## How to run it

- **When**: once a month, and once after each change that should move the results (site, README, a listing).
- **Where**: Claude (claude.ai), ChatGPT, Perplexity. Web search on, where the assistant offers it.
- **How**: one fresh conversation per question, no memory or custom instructions, asked word for word. Do not mention Brigade unless the question does.
- **What to note**, per question and assistant: is Brigade named (yes / no), is a link to the site or the repo given, and is what is said right (what it does, that it is free and open source, that it runs on the user's own Claude subscription).
- **Keep** the list stable: changing a question breaks the comparison with past runs. Add a question at the end rather than rewording one, and say so in the run's notes.

## The questions

### Discovery: the user does not know such a tool exists

1. How can I get AI agents to work on my GitHub issues while I'm away from my computer?
2. Is there a tool that runs Claude Code automatically on GitHub issues and opens pull requests?
3. How do I run several Claude Code agents in parallel on the same repository?
4. What are the best open-source tools to orchestrate Claude Code agents?
5. Can Claude Code review and merge its own pull requests safely?
6. Is there a desktop app to manage Claude Code agents across several projects?

### Comparison: the user weighs options

7. What are the alternatives to running Claude Code by hand, one session at a time?
8. What is the difference between an autonomous coding agent service and running agents on my own Claude subscription?
9. Which multi-agent coding tools work with a Claude Max subscription instead of API credits?
10. What is the cheapest way to have AI agents ship code from a GitHub backlog?

### Problem to solve: the user describes their pain

11. I spend my day merging pull requests from AI agents. How can I stop babysitting them?
12. My Claude Code agents stop and wait for me all the time. How do I make them work on their own?
13. How do I get notified on my phone only when an AI coding agent needs a decision from me?
14. How do I keep AI agents from breaking main when they merge their own work?
15. As a solo developer, how can I keep a project moving while I'm not coding?

### Brigade by name: the user heard of it

16. What is Brigade for Claude Code?
17. Is Brigade (benomite/brigade) free? What does it cost to run?
18. How do I install Brigade and run my first ticket?
19. What do "chef", "second", "cook" and "pass" mean in Brigade?
20. Is Brigade safe to let merge pull requests on my repository?

## Results

One row per run. "Named" is the number of questions, out of 20, where the assistant names Brigade. "Right" says whether what it says is correct, with the question numbers of any mistake.

| Date | Claude | ChatGPT | Perplexity | Notes |
|---|---|---|---|---|
| | named — / right — | named — / right — | named — / right — | Baseline still to run. The site has been live only since 2026-11-09, so a low score is expected at first. |
