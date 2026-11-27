// Ticket #3913 : le test « le corps porte les versions… » (opening.test.ts) ne doit pas dépendre du noyau du runner.
// Critère 1 : il passe quelle que soit la chaîne de version du système — ici un noyau Linux numéroté « #21 ».
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const PRELOAD = (version: string) =>
  `data:text/javascript,${encodeURIComponent(`import os from "node:os"; import { syncBuiltinESMExports } from "node:module"; os.version = () => ${JSON.stringify(version)}; syncBuiltinESMExports();`)}`;

test("le test du corps du signalement passe quand la version du noyau contient « #21 »", () => {
  const file = join(import.meta.dirname, "opening.test.ts");
  for (const version of ["#21-Ubuntu SMP PREEMPT_DYNAMIC Fri Nov 14 10:02:11 UTC 2026", "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1", "#215 SMP", "#21"]) {
    const rendered = spawnSync(process.execPath, ["--import", PRELOAD(version), file], { encoding: "utf8", timeout: 60_000 });
    assert.equal(rendered.status, 0, `${version}\n${rendered.stdout}\n${rendered.stderr}`);
  }
});
