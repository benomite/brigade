// Ce que la box rend aux gestes de la partie closer (#991), pour les tests de ce dossier : la forme
// que le runtime écrit (runtime/src/fermeture-action/, runtime/src/fermeture-lecture/lecture.ts).
import type { Apercu as ApercuDuRuntime } from "../../../../runtime/src/fermeture-action/apercu.ts";
import type { Demande as DemandeDuRuntime } from "../../../../runtime/src/fermeture-lecture/lecture.ts";
import type { Apercu } from "../../../src/closer-lancement.ts";
import type { Demande } from "../../../src/vue/closer/lancement/lancement.js";

// Ce que `closing preview --json` écrit, sur une ligne : la forme du runtime, que l'app lit telle quelle.
export const APERCU = {
  configured: true,
  cost: { model: "sonnet", effort: "medium", maxTokens: 500_000, maxRemovedLines: 500, startsBelowCooks: 1, text: "closer on `sonnet` / `medium` · starts under 1 cook in flight · 500,000 tokens at most · 500 lines removed at most" },
  does: [
    "it fetches the integration branch and replays the observation: the duplicate code blocks and dead exports it spots are its candidates, 20 at most",
    "it merges nothing and never pushes onto the integration branch: it opens one PR, handed to the pass, which judges and merges it like any delivery",
  ],
  request: { state: "none" },
  ifRequested: { outcome: "leaves", reason: null, text: "a request would leave within the second — start condition met: 0 cooks in flight for a threshold of 1, rail empty" },
} satisfies ApercuDuRuntime;
// Ce que l'app lit, le runtime l'écrit : tout aperçu qu'il rend entre dans la forme de l'app.
const _formeTenue: ApercuDuRuntime extends Apercu ? true : never = true;
void _formeTenue;
// Et toute demande que `closing --json` dit entre dans celle que la place lit.
const _demandeTenue: DemandeDuRuntime extends Demande ? true : never = true;
void _demandeTenue;

// Où en est la dernière demande, comme `closing --json` le dit (fermeture-lecture/lecture.ts, `Demande`).
export const DEMANDES = {
  none: { state: "none" },
  waiting: {
    state: "waiting",
    since: "2026-10-19T12:00:00.000Z",
    stalledAt: null,
    reason: { code: "cooks", observed: 3, limit: 1, detail: "4", text: "start condition not met: 3 cooks in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries 4 unserved tickets)" },
    text: "closing pass requested on 2026-10-19T12:00:00.000Z, it waits — …",
  },
  leaves: { state: "waiting", since: "2026-10-19T12:00:00.000Z", stalledAt: null, reason: null, text: "closing pass requested on 2026-10-19T12:00:00.000Z: its start condition is met" },
  running: { state: "running", run: "closing-20261019-1201", since: "2026-10-19T12:01:00.000Z", base: "48638df", zone: ["app/src"], candidates: 8 },
  refused: {
    state: "refused",
    at: "2026-10-14T09:00:00.000Z",
    reason: { code: "nothing", observed: null, limit: null, detail: "no candidate on origin/v2", text: "nothing to tidy up — no candidate on origin/v2" },
    text: "nothing to tidy up — no candidate on origin/v2",
  },
  cancelled: { state: "cancelled", at: "2026-10-19T12:02:00.000Z" },
  done: {
    state: "done",
    run: "closing-20261019-1201",
    at: "2026-10-19T12:40:00.000Z",
    outcome: "delivered",
    delivered: true,
    pr: "https://github.com/benomite/parade/pull/77",
    removed: [],
    removedLines: 140,
    addedLines: 3,
    files: ["app/src/main.ts"],
    kept: [],
    text: "delivered: 140 lines removed in 1 file",
  },
} satisfies Record<string, DemandeDuRuntime>;

// L'objet de `closing --json`, le closer réglé, la demande dans cet état.
export const lue = (request: unknown) => ({
  configured: true,
  closer: { model: "sonnet", effort: "medium", cooksBelow: 1, tokens: 500_000, removedLines: 500 },
  observation: {
    readable: true,
    ref: "origin/v2",
    sha: "48638df",
    lastMerge: "2026-10-19T11:48:13.000Z",
    mergesSinceCleanup: 261,
    ratio: [{ window: 100, merges: 100, added: 18_340, removed: 7_336, ratio: 2.5, reads: "2.5:1" }],
    duplicates: 1,
    deadExports: 0,
    codeFiles: 412,
    modules: 380,
    skippedFiles: 3,
  },
  findings: [{ id: "D1", kind: "duplicate", file: "app/src/vue/vue.js", start: 1405, end: 1418, lines: 14, copy: { file: "app/src/vue/fiabilite.js", start: 40, end: 53 } }],
  request,
  drift: { declared: false, crossed: false, crossings: [] },
});
export const SANS_CLOSER = { configured: false, text: "the closer is not set on this project: no closing pass writes, there is nothing to observe for it" };

