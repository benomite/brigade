# The app mockup

Drawn on **2026-10-08**, updated by the chef on **2026-10-12**. Four screens, and what they show is
authoritative: an app ticket cites the screen it serves, and a dev checks what they delivered
against what is drawn here.

The files are the canvas's, as they are. **They do not render outside the canvas** (they wait for
a `support.js` that is not here): they are read. Everything that matters is in plain sight —
the labels, the columns, the states, the colors, what is clickable and what is not.
`canvas.json` gives the title and size of each screen, and carries the chef's note on the
removals of 2026-10-12.

**The `Main.dc.html` screen is now called "All projects"** (#364). The canvas files still say
"Kitchen": they are not edited. The word no longer names a screen — the **kitchen** is the state
of a project on its box, the one a "stop" stops (`docs/app.md`, "The app is not the kitchen").

**Its content has changed since** (#870): it is no longer a tile per project, but brigade's
overview — one line per project, one per station, each with its pill and what is going on in it,
which a click opens, and the health line for Max and GitHub. The agreed mockup is in the ticket,
and the screen as delivered in `docs/app.md`, "Tous les projets, d'un coup". The five counters,
the cooks in flight and the latest event live in the project's space.

## The four screens

| File | Screen | What it fixes |
|---|---|---|
| `Main.dc.html` | **All projects** — drawn under the name "Kitchen" | the monogram icon bar with its status pill; the `Station` line; "what awaits you"; a tile per project with **five counters** (rail · taken · at pass · awaiting you · served 24 h), its cooks in flight and its latest event; the live log |
| `Espace.dc.html` | **Project space** — the second | the space's tabs (Second · Rail · Cooks · Grants · Log); the terminal tabs (`second · claude`, `zsh`, `+`); what the second serves on opening; the `!` commands running on the Mac |
| `Brigade.dc.html` | **Project space** — the rail | the rail in **five columns** (On the rail · Taken · Pass · Awaiting you · Served), a ticket per card with its tags; the questions with their buttons; the grants and the grant in one sentence; the project's weight |
| `Commis.dc.html` | **A cook live** | **PARKED** — kept for later, see below |

## The rule the mockup carries

**A button does not act: it writes the command in the terminal, and sends nothing.** The chef sees
what is about to go out, can correct it, and hits Enter. It is visible on all four screens: the
terminal panel that appears, the prompt, the cursor, and the line "Écrit dans le terminal, pas
exécuté. Entrée pour lancer."

That is what makes it possible to draw buttons **without** creating a second path: there is still
only one place where a thing is done, and what a button writes is found again in the terminal's
history, replayable by hand identically.

## What is drawn but must not be built

The mockup is ahead of decisions that have contradicted it. **These elements stay drawn because
they will be used again; they are not the V2 target.** A ticket that asks for them is to be sent
back.

| Drawn | Why not |
|---|---|
| `Commis.dc.html` in full — a cook live, its relayed stream | **parked**: the log already says who is stuck and the guardrails stop it. A second reader of the same fact. |
| `box/codex`, and any engine other than `claude` | **parked**: the other engines will come after V2 (spec, §Au parking) |
| `mac/chrome`, `chrome-connecté`, `revue-humaine`, `accès-prod`, « depuis ton Mac » | **parked**: the Mac runner left milestone 6, no ticket asks for it |
| « en preprod », « à recetter en preprod » | **does not exist**: the runtime has no notion of preprod |
| a grant « toutes les brigades » (`npm install`) | **dropped**: a grant is a fact in the log, and there is one log per project. Removed from the spec on 2026-10-10 |
| any **numeric gauge (« jauge chiffrée »)** of quota or machine, a reset time, a week total | **undeliverable, and that is settled**: the runtime does not know the Max account's consumption and must not pretend to (`/usage` stays the truth). It says `disponible`, `tient`, or `SATURÉE` and its load. The **per-cook** gauges (turns, duration, tokens, idle) are right: they are the guardrails' caps, which the runtime measures. |
| the red button "Write “stop” in the terminal" of `Main.dc.html` | **it would stop everything**: its command loops over all projects (`for p in … ; do brigade $p guardrails -- stop; done`), and its label does not say so. The delivered app only has a stop per project, in the project's panel, and its command names it. If it is ever built, its label says "all projects" |
| an expiry for the connection (« expire dans 2 j ») | the runtime says `connection Max tenue pour bonne` — no date |

The **cook profiles** and the **notebook** of their lessons, long parked (milestone 8), are built
from epic #1033: the card of a proposed profile, in the project's queue (#1053), is the first.
The mockup does not draw them: their card reuses that of a proposed correction.

## What the mockup does not fix

It says **what is shown**, not how pretty it is. The skin — fonts, colors, density — is laid down
there and serves as a starting point, but a visual pass is another subject, and it comes after the
chef has used it for a day.
