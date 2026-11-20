// Ticket #3913 : le test « le corps porte les versions… » (ouverture.test.ts) ne doit pas dépendre du noyau du runner.
// Critère 1 : il passe quelle que soit la chaîne de version du système — ici un noyau Linux numéroté « #21 ».
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const PRELOAD = (version: string) =>
  `data:text/javascript,${encodeURIComponent(`import os from "node:os"; import { syncBuiltinESMExports } from "node:module"; os.version = () => ${JSON.stringify(version)}; syncBuiltinESMExports();`)}`;

// brigade:guard
test("le test du corps du signalement passe quand la version du noyau contient « #21 »", () => {
  const fichier = join(import.meta.dirname, "ouverture.test.ts");
  for (const version of ["#21-Ubuntu SMP PREEMPT_DYNAMIC Fri Nov 14 10:02:11 UTC 2026", "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1", "#215 SMP", "#21"]) {
    const rendu = spawnSync(process.execPath, ["--import", PRELOAD(version), fichier], { encoding: "utf8", timeout: 60_000 });
    assert.equal(rendu.status, 0, `${version}\n${rendu.stdout}\n${rendu.stderr}`);
  }
});
