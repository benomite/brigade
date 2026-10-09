// La dérive branchée sur le runtime : les seuils du chef entrent au journal,
// et un franchissement est signalé une fois, sans qu'on le demande.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherDerive, lireSeuils } from "../src/derive.ts";
import type { Seuils } from "../src/evenements/derive.ts";
import { SANS_SEUIL } from "../src/mesures.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

// Un runtime dont le réveil est déclenché à la main : ni veille ni tick.
function cuisine(t: TestContext, repertoire = repertoireTemporaire(t)) {
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 3_600_000, intervalleTickMs: 3_600_000 });
  t.after(() => runtime.arreter("test"));
  const reveils: Array<() => void> = [];
  const avertissements: string[] = [];
  const brancher = (seuils: Seuils) => brancherDerive({ ...runtime, surReveil: (ecouter) => (reveils.push(() => ecouter("log")), () => {}) }, seuils, (message) => avertissements.push(message));
  const reveiller = () => {
    for (const ecouter of reveils) ecouter();
  };
  // Une livraison mergée dont les gates ont compté `tests` tests, puis le réveil.
  const merger = (ticket: number, tests: number) => {
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
        gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests } },
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

test("un seuil non déclaré vaut null, et aucun n'a de défaut", () => {
  assert.deepEqual(lireSeuils({}), SANS_SEUIL);
  assert.deepEqual(
    lireSeuils({ BRIGADE_DRIFT_TESTS: "500", BRIGADE_DRIFT_TESTS_SECONDS: "7.5", BRIGADE_DRIFT_GATES_SECONDS: "60", BRIGADE_DRIFT_CONTEXT_KB: "8", BRIGADE_DRIFT_REPO_MB: "2.5", BRIGADE_DRIFT_MERGES: "80", BRIGADE_DRIFT_GROWTH_PERCENT: "30" }),
    { tests: 500, testsSeconds: 7.5, gatesSeconds: 60, contextKb: 8, repoMb: 2.5, merges: 80, growthPercent: 30 },
  );
});

test("un seuil mal écrit est un refus de démarrer, pas un seuil désarmé", () => {
  for (const env of [{ BRIGADE_DRIFT_TESTS: "beaucoup" }, { BRIGADE_DRIFT_TESTS: "12.5" }, { BRIGADE_DRIFT_MERGES: "0" }, { BRIGADE_DRIFT_GROWTH_PERCENT: "-5" }]) {
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

test("un franchissement est signalé au merge qui le produit, une seule fois tant que la mesure reste au-delà, puis de nouveau après son retour", (t) => {
  const { brancher, merger, derive, avertissements } = cuisine(t);
  brancher({ ...SANS_SEUIL, tests: 500 });

  merger(1, 480);
  assert.deepEqual(derive().slice(1), []);

  merger(2, 622);
  merger(3, 640);
  assert.deepEqual(derive().slice(1), [["drift.crossed", { measure: "tests", observed: 622, limit: 500 }]]);
  assert.deepEqual(avertissements, ["brigade : dérive du projet « brigade » — tests 622 pour un seuil de 500 — voir : npm --prefix runtime run mesures"]);

  merger(4, 410);
  merger(5, 501);
  assert.deepEqual(derive().slice(2), [
    ["drift.cleared", { measure: "tests" }],
    ["drift.crossed", { measure: "tests", observed: 501, limit: 500 }],
  ]);
});

test("une livraison jugée avant le franchissement et mergée après, sans rejeu, ne le lève pas", (t) => {
  const { runtime, brancher, merger, reveiller, derive } = cuisine(t);
  brancher({ ...SANS_SEUIL, tests: 920 });
  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "", measures: { tests: 916 } };
  runtime.journal.ajouter({ project: "brigade", ticket: 17, author: "pass", type: "pass.replayed", payload: { sha: "sha-17", base: "base-1", gates, findings: [] } });

  merger(18, 930);
  runtime.journal.ajouter({ project: "brigade", ticket: 17, author: "pass", type: "merge.done", payload: { pr: "https://exemple.test/pull/17", sha: "sha-17", by: "pass", reconciled: false } });
  reveiller();

  assert.deepEqual(derive().slice(1), [["drift.crossed", { measure: "tests", observed: 930, limit: 920 }]]);
});

test("un franchissement déjà signalé ne l'est pas de nouveau au redémarrage ; un seuil retiré lève son signalement", (t) => {
  const repertoire = repertoireTemporaire(t);
  {
    const { runtime, brancher, merger } = cuisine(t, repertoire);
    brancher({ ...SANS_SEUIL, tests: 500 });
    merger(1, 622);
    runtime.arreter("test");
  }
  const { brancher, derive, avertissements } = cuisine(t, repertoire);

  brancher({ ...SANS_SEUIL, tests: 500 });
  assert.deepEqual([derive().length, avertissements], [2, []]);

  brancher(SANS_SEUIL);
  assert.deepEqual(derive().slice(2), [
    ["drift.configured", { limits: SANS_SEUIL }],
    ["drift.cleared", { measure: "tests" }],
  ]);
});
