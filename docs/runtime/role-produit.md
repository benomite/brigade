# The product role

The product role is the second's way to write what the project does next, from its usage. When the
rail empties, the kitchen can wake the **second** on its own: the same role and the same definition
as when the chef opens the Second tab (`agents/product.md`). The second reads the project's usage
and files prioritized `product` issues, each one with the evidence that justifies it. The chef
comes by from time to time with directions; the rest is the kitchen's.

It applies to **any project brigade serves**: the role reads that project's log, its repository and
its issues, and files into that project's repository. Nothing is specific to brigade's own repository.

The role is the second, not a new one: no new role appears in the docs or the glossary.

> **Status: this is the target, not yet what the box runs.** The directions the second reads are on
> `main` (#1956). The usage digest (#1953), and the wake when the rail empties with its daily cap, its
> switch and its `status` line (#1955), are still in progress. Until #1953 and #1955 are served, the
> cap, the switch and the status line below are not verified against the code.

## What it reads

The second reads three sources, and does not propose anything on one of them alone when the others
are there.

| Source | What it holds |
|---|---|
| The **usage digest** | What the kitchen measures: the **drift** (tickets served on the first try or not), the pass's refusals, the cooks stopped by a **guardrail**, the tickets set aside (`86`) and why, and the failures that repeat from one ticket to the next (the same failure on several tickets, a cleanup that keeps failing). |
| **Issues opened by people other than the chef** | The feedback of those who use the project, on its repository. |
| **The chef's directions** | Open issues labelled `direction`, and the chef's comments on them. See [Giving a direction](#giving-a-direction). |

It also reads the project's open issues, so that a need which already has its issue is not filed
again, even when it is worded differently.

## What it files

Each `product` issue the role files is a product *what*: the need, from the user's point of view,
with the usage that founds it. It never says *how*.

Every issue carries, without exception:

- **Labels**: `product`, `filed-by:product`, and **one** priority label:
  - `prio:1` — do first: a user is blocked, or a failure repeats;
  - `prio:2` — important, not blocking;
  - `prio:3` — desirable, later.
- **A first line of body** that names the usage that justifies the issue, with a link to the evidence
  (the issue, the ticket, the PR, the CI run, or the digest entry that shows it). For example:
  *Filed from usage: 3 tickets set aside (86) this week for the same failing cleanup — #412, #418, #431.*
- **A context**: the need, from the user's side, with a link to each cited piece of evidence.
- **Observable acceptance criteria**: what the user will see or do once it is delivered, checkable
  without reading the code.

An issue missing one of these is not filed. There is no file pointer, no implementation hint and no
zone in it: the manager qualifies it.

A pass with nothing to file is a good answer. The role does not invent a need to fill its cap, and a
single signal (one refusal, one `86`) is not enough unless it blocks a user.

## Its limits

- **No code.** Not a fix, not a test, not a diff. A fix that looks trivial becomes an issue.
- **No merge**, and no action on a PR.
- **Nothing published outside the repository**: no message, no outside service, no announcement.
  Everything it writes lives in the project's issues.
- **No `fire`**, no calibration, nothing on the rail.
- **Anything that changes the product's direction, or needs the chef, goes to TODO, not to the
  rail.** That covers a need that contradicts a direction, opens a new one, removes or changes what
  a user already has, or assumes a decision only the chef can make (a cost, a third party, a choice
  between two paths). The role files no issue for it: it puts one card in TODO with one question and
  its choices, each path in one sentence with what the user gets from it.

## Giving a direction

The chef steers the role by opening an issue labelled `direction`. Its body states the direction in
plain words (for example: *focus on onboarding this month*).

- Only an issue **opened by the chef** counts as a direction; the chef is the account the project's
  settings name. Its body is the direction; the chef's comments on it extend it.
- **`until: YYYY-MM-DD`** (optional, a line in the body): the direction holds up to that date,
  included, and ends the day after. Without it, the direction holds until the chef closes the issue.
- A direction changes what the role files next: at equal usage, what serves it comes first, and what
  contradicts it is not filed. It does not reopen a session.
- A comment from the chef on a direction issue is read with it.

## Turning it off and on

The product role runs inside the project's kitchen, so it stops with the project's switch:

```bash
npm --prefix runtime run switch -- off   # nothing new is filed by the role
npm --prefix runtime run switch -- on    # the role may run again when the rail empties
```

See [The project switch](exploitation.md) for what `off` stops and what it leaves running.

## The daily cap and the status line

- **The cap**: the role files at most **3 issues a day** by default. This is a [cap](../glossary.md)
  (`plafond`) that stops the role from flooding the backlog. It is shown with the project's
  [guardrails](garde-fous.md).
- **The status line**: `status` shows how many issues the role filed, and when it last ran. Read it
  there to see, at a glance, what the role filed while the chef was away.
- **Recognizing its issues**: the chef finds them by the `filed-by:product` label, and by the first
  line of their body, which names the usage behind each one.

