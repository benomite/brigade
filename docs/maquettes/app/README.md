# The app mockup

Drawn on **2026-11-08** on a Claude Design canvas (epic #2897), from the inventory in [`docs/design/inventaire/`](../../design/inventaire/README.md). The chef took its design decisions the same day. The mockup is authoritative: each app ticket names the artboard it serves, and the design cook checks what it delivers against it.

The canvas: https://claude.ai/artifact/AgM5UQ7NdNk2smuoKzem7L. These files are a copy of it, and they render only inside the canvas, so read them as source: the labels, sizes, colors and states are all in plain sight.

## The six artboards

| File | What it sets |
|---|---|
| `Main.dc.html` | **Foundations.** The colors of `app/src/vue/jetons.css` (unchanged), a type scale of 5 sizes (11 · 13 · 15 · 20 · 28), 6 spacing steps (4 to 32), 3 radii (10 · 8 · 4) plus the pill's full round, and **the lexicon**, one word per thing. |
| `Components.dc.html` | **One of each brick**, replacing the variants listed in the inventory. One button family (recommended, secondary, quiet, danger; 32 px, 44 px on the phone), one state pill per state, the ticket voucher, the "awaiting you" card, the inline confirmation, the one-line empty state and error, and the settings row that applies on change. |
| `Home.dc.html` | **Home.** The projects, and this computer's station (#2497). |
| `Project.dc.html` | **Project space.** Three tabs (Rail · Stations · Settings), the health strip above the rail, the rail in six columns, and the second's panel. |
| `Phone.dc.html` | **Phone (390×844).** The cards awaiting you, and answering one. |
| `Settings.dc.html` | **Settings.** The project's settings and its stations. Each gesture has one place. |

## Decisions (chef, 2026-11-08)

1. **The cream paper voucher is for tickets only.** Every other block is a dark card.
2. **The recommended button is filled with the accent, everywhere.**
3. **Density.** Body text is 13 px on desktop and 15 px on the phone, on the 5-size scale.
4. **The project has three tabs: Rail · Stations · Settings.** The Kitchen tab's health and time fold into the strip above the rail.
5. **The second's panel** is docked on the right, open by default, and folds with a click. **It can be resized by dragging its left edge, and its width is kept** from one launch to the next.
