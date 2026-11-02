# Waking the second

When the rail empties, the kitchen can wake the **second** on its own, to write what the project does
next, from its usage: the same definition as when the chef opens the Second tab (`agents/product.md`).
The second reads the project's usage and files prioritized `product` issues, each one with the
evidence that justifies it. The chef comes by from time to time with directions; the rest is the
kitchen's.

It applies to **any project brigade serves**: the second reads that project's log, its repository and
its issues, and files into that project's repository. Nothing is specific to brigade's own repository.

## When it wakes

The runtime runs the second at its tick, with no UI open, in two cases:

- **the rail is empty**: no ticket is left to cook (served ones are done, and those that wait for a
  third party or a capacity do not count);
- **an issue opened by someone other than the chef has waited more than a day** for an answer, so
  the second answers it first.

It runs at most once in a while, and never two at once. It stays off until the chef turns it on (see
[Turning it on and off](#turning-it-on-and-off)).

## What it reads

The second reads three sources, and does not propose anything on one of them alone when the others
are there.

| Source | What it holds |
|---|---|
| The **usage digest** | What the kitchen measures: the share of tickets served on the first try, the pass's refusals, the cooks stopped by a **guardrail**, the tickets set aside (`86`) and why, and the failures that repeat from one ticket to the next (the same failure on several tickets, a cleanup that keeps failing). On brigade's own project, the digest also names the other projects the same box serves, each finding tagged with its project. |
| **Issues opened by people other than the chef** | The feedback of those who use the project, on its repository. |
| **The chef's directions** | Open issues labelled `direction`, and the chef's comments on them. See [Giving a direction](#giving-a-direction). |

It also reads the project's open issues, so that a need which already has its issue is not filed
again, even when it is worded differently.

## What it files

Each `product` issue the second files is a product *what*: the need, from the user's point of view,
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

A pass with nothing to file is a good answer. The second does not invent a need to fill its cap, and a
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
  between two paths). The second files no issue for it: it puts one card in TODO with one question and
  its choices, each path in one sentence with what the user gets from it.

## Giving a direction

The chef steers the second by opening an issue labelled `direction`. Its body states the direction in
plain words (for example: *focus on onboarding this month*).

- Only an issue **opened by the chef** counts as a direction; the chef is the account the project's
  settings name. Its body is the direction; the chef's comments on it extend it.
- **`until: YYYY-MM-DD`** (optional, a line in the body): the direction holds up to that date,
  included, and ends the day after. A later `until:` in a comment from the chef wins over the one in the
  body, so the chef can move the end without editing the issue. Without it, the direction holds until
  the chef closes the issue.
- A direction changes what the second files next: at equal usage, what serves it comes first, and what
  contradicts it is not filed.

## Turning it on and off

The second has its own switch, and it starts **off**: nothing runs until the chef turns it on. The
chef runs its gestures from the project's state directory:

```bash
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts          # its status line, as `status` says it
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts on       # it runs when the rail empties (off until then)
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts off      # the off switch: it no longer runs
BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/commande.ts cap 5    # the daily cap (see below)
```

Each project has its own switch and its own cap. A run already in flight files nothing once the role is
off. The project's [switch](exploitation.md#the-project-switch) also holds the second: with
`npm --prefix runtime run switch -- off`, nothing the second does runs, and the project's own switch
stays off for every other role too. Turning the project switch back on does not turn the second on.

## The daily cap and the status line

- **The cap**: the second files at most **3 issues a day** by default. It counts the issues carrying
  `filed-by:product` created that day, and once the cap is reached nothing more runs that day, and the
  runtime says so once. `cap 0` files nothing. The cap stops the second from flooding the backlog.
- **The status line**: `status` shows one line for the second: whether it is `ON` or `OFF`, the issues
  it filed today against the cap (with `(cap reached)` when it is full), and the time of its last run.
  Read it there to see, at a glance, what the second filed while the chef was away.
- **Recognizing its issues**: the chef finds them by the `filed-by:product` label, and by the first
  line of their body, which names the usage behind each one.
