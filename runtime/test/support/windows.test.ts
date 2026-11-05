import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fichiersDeTest, GARDE_MS, part } from "./windows.ts";

// Le workflow qui joue les parts sous Windows, tel que le dépôt le porte.
const WORKFLOW = readFileSync(join(import.meta.dirname, "../../../.github/workflows/runtime-windows.yml"), "utf8");

// Ce que le garde laisse au job, une fois la part coupée : le checkout et node avant elle, le rapport et
// les annotations après.
const MARGE_MS = 2 * 60_000;

test("the part's guard falls before the job's cap, which cuts it with no annotation (#2406)", () => {
  const plafond = Number(/^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(WORKFLOW)?.[1]);
  assert.ok(plafond > 0, "runtime-windows.yml gives the job no timeout-minutes");
  assert.ok(GARDE_MS + MARGE_MS <= plafond * 60_000, `the guard (${GARDE_MS / 60_000} min) leaves the job (${plafond} min) less than ${MARGE_MS / 60_000} min`);
});

test("the matrix plays every part the command and the check name count", () => {
  const parts = /^\s*part:\s*\[([^\]]*)\]/m.exec(WORKFLOW)?.[1]?.split(",").map((p) => Number(p.trim()));
  const commande = Number(/--part \$\{\{ matrix\.part \}\}\/(\d+)/.exec(WORKFLOW)?.[1]);
  const nom = Number(/name: windows tests \(\$\{\{ matrix\.part \}\}\/(\d+)\)/.exec(WORKFLOW)?.[1]);
  assert.equal(nom, commande);
  assert.deepEqual(parts, Array.from({ length: commande }, (_, i) => i + 1));
});

test("the parts cover every test file once", () => {
  const tous = fichiersDeTest();
  const n = Number(/--part \$\{\{ matrix\.part \}\}\/(\d+)/.exec(WORKFLOW)?.[1]);
  const joues = Array.from({ length: n }, (_, i) => part(tous, `${i + 1}/${n}`)).flat();
  assert.deepEqual(joues.sort(), tous);
});
