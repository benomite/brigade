// La dérive branchée sur le runtime : les seuils du chef entrent au journal,
// et un franchissement est signalé une fois, sans qu'on le demande.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherDerive, lireSeuils, SEUIL_DUREE_GATES_PAR_DEFAUT } from "../src/derive.ts";
import type { Seuils } from "../src/events/drift.ts";
import { SANS_SEUIL } from "../src/mesures.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

// Un runtime dont le réveil est déclenché à la main : ni veille ni tick.
function cuisine(t: TestContext, repertoire = repertoireTemporaire(t)) {
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 3_600_000, intervalleTickMs: 3_600_000 });
  t.after(() => runtime.arreter("test"));
  const reveils: Array<() => void> = [];
  const avertissements: string[] = [];
  const brancher = (seuils: Seuils | (() => Seuils)) => brancherDerive({ ...runtime, surReveil: (ecouter) => (reveils.push(() => ecouter("log")), () => {}) }, seuils, (message) => avertissements.push(message));
  const reveiller = () => {
    for (const ecouter of reveils) ecouter();
  };
  // Une livraison mergée dont les gates ont compté `tests` tests, puis le réveil.
  const merger = (ticket: number, tests: number, autres: Record<string, number> = {}) => {
    const noter = runtime.journal.ajouter.bind(runtime.journal);
    const pr = { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}` };
    noter({
      project: "brigade",
      ticket,
      author: "pass",
      type: "pass.judged",
      payload: {
        ...pr,
        run: `run-${ticket}`,
        number: ticket,
        verdict: "green",
        gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests, ...autres } },
        ci: { outcome: "none", checks: [] },
        review: { outcome: "skipped", run: null, summary: null, findings: [] },
        findings: [],
        judgeModified: false,
        noDiff: false,
      },
    });
    noter({ project: "brigade", ticket, author: "pass", type: "merge.done", payload: { ...pr, by: "pass", reconciled: false } });
    reveiller();
  };
  const derive = () => runtime.journal.tout().flatMap((evenement) => (evenement.type.startsWith("drift.") ? [[evenement.type, evenement.payload]] : []));
  return { repertoire, runtime, brancher, merger, reveiller, derive, avertissements };
}

test("un seuil non déclaré vaut null, et seule la durée des gates a un défaut", () => {
  assert.deepEqual(lireSeuils({}), { ...SANS_SEUIL, gatesSeconds: SEUIL_DUREE_GATES_PAR_DEFAUT });
  assert.deepEqual(
    lireSeuils({ BRIGADE_DRIFT_TESTS: "500", BRIGADE_DRIFT_TESTS_SECONDS: "7.5", BRIGADE_DRIFT_GATES_SECONDS: "60", BRIGADE_DRIFT_CONTEXT_KB: "8", BRIGADE_DRIFT_REPO_MB: "2.5", BRIGADE_DRIFT_MERGES: "80", BRIGADE_DRIFT_GROWTH_PERCENT: "30", BRIGADE_DRIFT_TICKET_TOKENS: "2000000", BRIGADE_DRIFT_LOST_TOKENS: "500000", BRIGADE_DRIFT_FIRST_TRY_PERCENT: "60", BRIGADE_DRIFT_FIRST_TRY_WINDOW: "8" }),
    { tests: 500, testsSeconds: 7.5, gatesSeconds: 60, contextKb: 8, repoMb: 2.5, merges: 80, growthPercent: 30, ticketTokens: 2_000_000, lostTokens: 500_000, firstTryPercent: 60, firstTryWindow: 8 },
  );
});

test("un seuil mal écrit est un refus de démarrer, pas un seuil désarmé", () => {
  for (const env of [{ BRIGADE_DRIFT_TESTS: "beaucoup" }, { BRIGADE_DRIFT_TESTS: "12.5" }, { BRIGADE_DRIFT_MERGES: "0" }, { BRIGADE_DRIFT_GROWTH_PERCENT: "-5" }, { BRIGADE_DRIFT_TICKET_TOKENS: "2,5" }, { BRIGADE_DRIFT_LOST_TOKENS: "0" }]) {
    assert.throws(() => lireSeuils(env), ConfigInvalide, JSON.stringify(env));
  }
});

test("les seuils entrent au journal quand le chef en déclare, et n'y sont réécrits que s'ils changent", (t) => {
  const { brancher, derive } = cuisine(t);
  const seuils = { ...SANS_SEUIL, tests: 500 };

  brancher(SANS_SEUIL);
  brancher(seuils);
  brancher(seuils);
  brancher({ ...seuils, merges: 80 });

  assert.deepEqual(derive(), [
    ["drift.configured", { limits: seuils }],
    ["drift.configured", { limits: { ...seuils, merges: 80 } }],
  ]);
});

test("un merge au journal ne fait plus rien franchir : le journal ne voit plus un merge depuis #2061, la passe du closer relève la dérive sur le clone (#2707)", (t) => {
  const { brancher, merger, derive, avertissements } = cuisine(t);
  const seuils = { ...SANS_SEUIL, tests: 500 };
  brancher(seuils);

  merger(17, 622);

  assert.deepEqual(derive(), [["drift.configured", { limits: seuils }]]);
  assert.deepEqual(avertissements, []);
});

test("des seuils changés sans redémarrer entrent au journal au réveil suivant", (t) => {
  const { brancher, reveiller, derive } = cuisine(t);
  let seuils: Seuils = { ...SANS_SEUIL, tests: 500 };
  brancher(() => seuils);
  seuils = { ...seuils, merges: 80 };
  reveiller();
  assert.deepEqual(derive(), [
    ["drift.configured", { limits: { ...SANS_SEUIL, tests: 500 } }],
    ["drift.configured", { limits: { ...SANS_SEUIL, tests: 500, merges: 80 } }],
  ]);
});
