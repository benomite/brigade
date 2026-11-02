# Waking the second

The kitchen can wake the **second** on its own to write what a project does next from its usage: the
same definition as when the chef opens the Second tab (`agents/product.md`). It files prioritized
`product` issues, each with its evidence, into the repository of **any project brigade serves**.

## When it wakes

The runtime runs the second at its tick, with no UI open, in two cases:

- **the rail is empty**: no ticket is left to cook (waiting tickets do not count);
- **an issue opened by someone other than the chef has waited more than a day**: the second answers
  it first.

It runs at most once in a while, never two at once, and stays off until the chef turns it on
([Turning it on and off](#turning-it-on-and-off)).

## What it reads

Three sources; it proposes nothing on one alone when the others exist.

| Source | What it holds |
|---|---|
| The **usage digest** | What the kitchen measures: the share of tickets served on the first try, the pass's refusals, the cooks stopped by a **guardrail**, the tickets set aside (`86`) and why, repeating failures. On brigade's own project, the box's other projects too, tagged. |
| **Issues opened by people other than the chef** | The feedback of those who use the project. |
| **The chef's directions** | Open issues labelled `direction`, and the chef's comments on them. See [Giving a direction](#giving-a-direction). |

It also reads the open issues, so a need that has its issue is not filed again.

## What it files

Each `product` issue is a product *what*, never the *how*. Every issue carries:

- **Labels**: `product`, `filed-by:product`, and **one** priority label: `prio:1` do first (a user
  is blocked, or a failure repeats), `prio:2` important, not blocking, `prio:3` desirable, later.
- **A first line of body** naming the usage that justifies it, linking the evidence (issue, ticket,
  PR, CI run or digest entry): *Filed from usage: 3 tickets set aside (86) this week for the same
  failing cleanup — #412, #418, #431.*
- **A context**: the need, from the user's side.
- **Observable acceptance criteria**, checkable without reading the code.

An issue missing one is not filed; none holds a file pointer, implementation hint or zone (the
manager qualifies it). Nothing to file is a good answer: a single signal (one refusal, one `86`) is
not enough unless it blocks a user.

## Its limits

- **No code**, no merge, no action on a PR: a fix that looks trivial becomes an issue.
- **Nothing published outside the repository.**
- **No `fire`**, no calibration, nothing on the rail.
- **Anything that changes the product's direction, or needs the chef, goes to TODO, not to the
  rail**: a need that contradicts or opens a direction, removes or changes what a user has, or
  assumes a chef-only decision (a cost, a third party). No issue: one card in
  TODO with one question and its choices, each path in one sentence with what the user gets.

## Giving a direction

The chef opens an issue labelled `direction`, its body stating it in plain words (*focus on onboarding*). Only an issue **opened by the chef** (the account the project's settings
name) counts; the chef's comments extend it.

- **`until: YYYY-MM-DD`** (optional, a line in the body): holds through that date; a later `until:`
  in a chef's comment wins. Without it, until the chef closes the issue.
- At equal usage, what serves a direction comes first, what contradicts it is not filed.

## Turning it on and off

The second has its own per-project switch, starting **off**:

```bash
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts          # its status line, as `status` says it
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts on       # it runs when the rail empties
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts off      # it no longer runs
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts cap 5    # the daily cap (see below)
```

The project
[switch](exploitation.md#the-project-switch) also holds the second; switching it back on does not
turn the second on.

## The daily cap and the status line

- **The cap**: **3 issues a day** by default, counting issues carrying `filed-by:product` created
  that day; once reached, nothing more runs that day and the runtime says so once. `cap 0` files
  nothing.
- **The status line**: `status` shows `ON` or `OFF`, the issues filed today against the cap
  (`(cap reached)` when full), and the time of its last run.
