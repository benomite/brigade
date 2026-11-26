// Les plafonds du job `windows app tests` (.github/workflows/app-windows.yml, #2408) : coupé par son plafond, un job
// ne laisse aucun journal, et la base rouge s'ouvre sans rien dire de ce qui casse. Ce qui cale doit donc tomber
// sur le plafond de son pas, dont le journal nomme le test en cours — jamais sur celui du job.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const WORKFLOW = readFileSync(join(import.meta.dirname, "../../.github/workflows/app-windows.yml"), "utf8");

// Le job des tests, de son nom au job suivant.
const JOB = /^ {2}tests:\n([\s\S]*?)(?=^ {2}\S)/m.exec(WORKFLOW)?.[1] ?? assert.fail("app-windows.yml has no `tests` job");
const CAP = Number(/^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(JOB)?.[1]);
// Les pas, chacun du `- ` qui l'ouvre au suivant.
const PAS = JOB.split(/^ {6}- /m).slice(1);

// Ce que le job fait hors des pas plafonnés : le checkout, node, et son ménage. Le checkout extrayait les captures de
// docs/captures/, qui grossissent à chaque livraison design : une minute n'y suffisait plus (#3344) — il les laisse de
// côté depuis #3680, dont les rouges (20d5919, puis 8a1dd00 à 8bb7f98) étaient des tests en échec, pas le checkout.
const MARGE_MIN = 4;

test("each step that runs npm in windows app tests has its own cap", () => {
  const npm = PAS.filter((pas) => /^\s*run: npm /m.test(pas));
  assert.deepEqual(
    npm.map((pas) => /run: (npm .*)/.exec(pas)?.[1]),
    ["npm ci --ignore-scripts --prefix app", "npm --prefix app run test:en-cours", "npm --prefix app run typecheck"],
  );
  for (const pas of npm) assert.match(pas, /^\s*timeout-minutes:\s*\d+\s*$/m, `this step has no timeout-minutes:\n${pas}`);
});

test("the steps' caps fall before the job's cap, which cuts it with no log (#2408)", () => {
  assert.ok(CAP > 0, "the tests job of app-windows.yml gives no timeout-minutes");
  const somme = PAS.reduce((total, pas) => total + Number(/^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(pas)?.[1] ?? 0), 0);
  assert.ok(somme + MARGE_MIN <= CAP, `the steps' caps (${somme} min) leave the job (${CAP} min) less than ${MARGE_MIN} min`);
});

test("the checkout of windows app tests leaves out docs/captures/, whose extraction killed the job with no log (#3680)", () => {
  const checkout = PAS.find((pas) => /^uses: actions\/checkout@/.test(pas)) ?? assert.fail("the tests job of app-windows.yml has no checkout");
  assert.match(checkout, /^\s*sparse-checkout-cone-mode:\s*false\s*$/m);
  const motifs = /sparse-checkout: \|\n((?:\s{12}\S.*\n?)+)/.exec(checkout)?.[1]?.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(motifs, ["/*", "!/docs/captures/"]);
});
