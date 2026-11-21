// #3911 : au redémarrage, le disjoncteur que la réconciliation referme est celui des échecs qui ne tiennent plus — jamais
// celui d'un calage, que seul le contrôle du superviseur referme.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { demarrer } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const PLAFONDS = { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 };
const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };
const CALAGE = { run: "44-github-2222aaaa-r2", kind: "cook", turns: 1, tokens: 10, activity: { doing: "running", target: "cat" }, retries: 2 };

function ouvertAvant(t: TestContext, ouverture: Record<string, unknown>, sorties: Array<{ code: number; outcome: "failed" | "stalled"; signal?: string }>) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  sorties.forEach(({ code, outcome, signal }, i) => {
    const run = `${20 + i}-github-aaaa`;
    journal.ajouter({ project: "brigade", ticket: 20 + i, author: "station", type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl` } });
    journal.ajouter({ project: "brigade", ticket: 20 + i, author: "runtime", type: "cook.exited", payload: { run, outcome: outcome as never, code, signal: signal ?? null, turns: 0, tokens: 0, durationMs: 1 } });
  });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: ouverture as never });
  journal.fermer();
  const runtime = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  return runtime.journal.base;
}

test("au redémarrage, un disjoncteur ouvert par des échecs qui ne tiennent plus se referme ; celui d'un calage reste ouvert", (t) => {
  const externes = ouvertAvant(t, { failures: 3, threshold: 3 }, [{ code: 143, outcome: "failed", signal: "SIGTERM" }, { code: 143, outcome: "failed", signal: "SIGTERM" }, { code: 143, outcome: "failed", signal: "SIGTERM" }]);
  assert.equal(etatDesGardeFous(externes).breakerOpenedAt, null);

  const cale = ouvertAvant(t, { failures: 0, threshold: 3, stalled: CALAGE }, [{ code: 1, outcome: "stalled" }]);
  assert.notEqual(etatDesGardeFous(cale).breakerOpenedAt, null);
});
