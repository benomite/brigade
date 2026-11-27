# Agents in their prompts, a small scheduler

Dated architecture spec, 2026-11-26. Written by the second at the chef's request. It implements [the simplified process](2026-11-24-simplified-process.md) (the 16 rules) and replaces how the runtime implements it. **Status: awaiting the chef's validation.**

## Why

From 2026-11-23 to 26 the kitchen cost the chef more time than it saved: 242 issues in 72 hours, `main` red 9 times, 9 app releases failed, takes stuck until a restart, and on the evening of the 26th a deadlock (a full pass blocks every take, and the red deliveries that fill it are never reviewed, #4460).

The cause is structural. `runtime/src` holds 93,000 lines in 684 files: +70,000 −45,000 in 30 days, +3,250 net in the last 72 hours despite the freeze #3904. Each agent is a TypeScript state machine. The LLM only answers a short question with a JSON verdict, and code does every gesture. Each agent mistake was answered by a new guard in code. The guards interact, and each interaction is a new outage, so a new ticket, so a new guard. The cooks are coding agents, so every ticket about an agent's behaviour becomes TypeScript.

The chef's question: why is epic splitting not simply in the manager, and supervision in the supervisor? It should be.

## The architecture

**An agent's behaviour lives in its prompt.** `agents/manager.md`, `agents/cook.md`, `agents/pass.md`, `agents/supervisor.md` and `agents/closer.md` hold what each agent does and how. The project's sheet and know-how file complete them. To change a behaviour, you edit a prompt.

**The runtime is a scheduler of at most 3,000 lines.** It decides when to launch which agent, isolates it, and does the few gestures that must stay locked. It keeps no state in memory: each turn it reads GitHub. A restart or an update loses nothing.

**GitHub holds all the state**, in labels the agents and the app read the same way:

| Label | Meaning |
|---|---|
| (none) | in the backlog |
| `idea` | never taken |
| `fire` + `model:*` + `effort:*` | calibrated, ready: the top of the backlog |
| `taken` | a cook works on it |
| `in-pass` | its PR waits for the pass |
| `try:1`, `try:2` | refusals so far; never reset |
| `parked` + a comment (who, for what, until when) | waits; `parked:chef` is the chef's TODO |

## Who does what

| Rule | Where it lives | How |
|---|---|---|
| 1. Everything goes through the backlog | prompts | every agent opens an issue with `gh issue create` |
| 2. One queue, by priority then age | scheduler | sort order when it picks |
| 3. The manager takes the next, calibrates, splits, parks | `manager.md` | launched when fewer than N tickets are ready |
| 4. One cook trade, the project's tools | `cook.md` + sheet | the scheduler passes the ticket's tools |
| 5. Know-how file | `cook.md`, `closer.md` | read before work, added to with the delivery, pruned by the closer |
| 6. A human cook | label `cook:human` | the scheduler skips it; same pass |
| 7. Take when there is room | scheduler | places = a number in the sheet; nothing else gates a take |
| 8. The pass is the only judge | `pass.md` + scheduler | CI complete → red goes back with the failing check, green → review |
| 9. House rules locked | GitHub branch protection | no merge without green required checks; no agent can bypass it |
| 10. Risk decides where the chef is required | scheduler | a PR touching a risk zone of the sheet is parked for the chef, never merged |
| 11. Stages | `manager.md` | a staged ticket is split into one issue per stage, chained by `Depends on #N` |
| 12. Three tries in total | scheduler | `try:n` label; the third refusal parks for the chef with what was tried |
| 13. Parked | label + comment | the scheduler never takes a parked ticket; the date or the chef unparks it |
| 14. Supervisor | `supervisor.md` | every 15 min; it may park, fix labels and open defect tickets; it never relaunches |
| 15. Closer | `closer.md` | daily; its PR goes through the pass |
| 16. The chef's TODO | the app | the `parked:chef` issues, with buttons that set labels |

The recurring tickets (calendar) are a scheduled GitHub Actions workflow that opens issues: zero runtime code.

## The scheduler

One loop, one turn per minute:

1. **Pass.** For each `in-pass` PR whose CI is complete: if red, send it back. If green, launch the pass agent. It writes a verdict file: `merge` or `refuse` with a reason. The scheduler then does the gesture:
   - **merge:** only if the CI is green and the diff touches no risk zone;
   - **a risk zone:** the ticket is parked for the chef (`parked:chef`). When the chef answers `merge` on it, the scheduler merges the approved PR, with no cook and no new pass; if the branch must first be brought up to date with the base, a cook does it, and after the new pass the answer still holds: the ticket is merged, not parked again. A refusal that counts a try lifts the answer (#4489). While it waits, a PR that starts conflicting with the base goes back to a cook, then to the pass, then waits for the chef again: the chef is only asked to merge what can be merged. The waiting ticket carries `approved` beside `parked:chef` (#4492); one that lost that label is still recognized by the pass's risk-zone comment, its last move, and gets the label back (#4558);
   - **refuse:** a comment, the next `try:n`, `in-pass` removed;
   - **send back on conflict:** treated like a refusal, and it does not count as a try.

   The pass serves one dish at a time. A full pass never blocks a take.
2. **Takes.** While places are free, take the next `fire` ticket. Label it `taken`, create the worktree, and launch the cook through the relay (#4401: it outlives a restart). When the cook ends:
   - with a PR: `in-pass`;
   - without a PR: a refusal (`try:n`) with the cook's last words.
3. **Manager.** When fewer than N tickets are ready and the backlog has candidates, launch the manager, one at a time.
4. **Supervisor** every 15 minutes, **closer** daily.

Every launch goes through the existing sandbox (`cloison.ts`, `bwrap`), with the network limited to GitHub and the Claude API (`reseau.ts`).

### What stays code, and why

Code holds only the gestures whose failure would be costly or unbounded: merge, the try count, places and risk zones. Everything that is judgement stays in a prompt.

## Security: the trifecta stays closed

An agent with `gh` in write that reads issues would hold the private data leg and the untrusted content leg. So:

- **Untrusted content never reaches an agent.** The `gh` inside the sandbox is a wrapper that drops issue and comment bodies from authors without write access (rule of #4357). An untrusted author's issue is labelled `parked:chef` until accepted.
- **No way out.** The network is limited to GitHub and the Claude API. The token is fine-grained to the project's repository only.
- The scheduler gives each agent only its own worktree, as today.

## The guard against relapse

- **A gate caps `runtime/src` at 3,000 lines.** Past it, the PR is red, with no exception and no override.
- **`runtime/` is a risk zone of brigade's sheet.** A cook's PR touching it is parked for the chef, never merged by the kitchen. Kitchen behaviour changes go into the prompts.
- **A new mechanism in the scheduler must remove at least as many lines as it adds.** This replaces the #3904 freeze, which nothing enforced.

## The app

Today the app imports about forty runtime modules. With the new runtime, it reads two things: the GitHub labels above, and a small status file per station (places, running agents, last turn). The screens that show removed machinery are rewired onto the labels:
- the agents' gesture log and autonomy levels;
- the logbook;
- the fault banners.

That is phase 3.

## Order of work

1. **Freeze.** `fire` is removed from the runtime tickets. The open runtime PRs are closed or kept against this design.
2. **The scheduler and the five prompts**, written by the second outside the kitchen, in `runtime/` next to the old code. They are tested on a test repository with a fake `claude`, then for real.
3. **Switch the box** to the new scheduler, then delete the old runtime.
4. **Rewire the app** onto the labels and the status file.
5. **Fold the open tickets.** Each is closed, rewritten as a prompt change, or kept.

## What is lost

No process feature is lost. What goes is the machinery that implemented them in code:
- the gesture log and autonomy levels in code (risk zones replace them);
- the rail's invariant repair and the watchdog (the supervisor prompt replaces them);
- the saturation hold and the zone claim gate (places and the send-back on conflict replace them);
- the post-mortem fields and the time measures. The supervisor can still write them down in an issue.
