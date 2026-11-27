// Ticket #3913 : le test « le corps porte les versions… » (opening.test.ts) doit toujours échouer si une ligne du
// journal du ticket #21 entre dans le signalement. On rejoue le fichier sur une copie de `src/` où le filtre par ticket
// laisse tout passer, sous un noyau sans « #21 » : le test doit alors rougir. Et, sous un noyau « #21 » sans fuite, il passe.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const PRELOAD = (version: string) =>
  `data:text/javascript,${encodeURIComponent(`import os from "node:os"; import { syncBuiltinESMExports } from "node:module"; os.version = () => ${JSON.stringify(version)}; syncBuiltinESMExports();`)}`;
const plays = (file: string, version: string) => spawnSync(process.execPath, ["--import", PRELOAD(version), file], { encoding: "utf8", timeout: 60_000 });

test("le test du corps du signalement échoue si une ligne du ticket #21 entre dans le rapport", () => {
  const app = join(import.meta.dirname, "../../..");
  const copy = mkdtempSync(join(tmpdir(), "brigade-3913-"));
  try {
    cpSync(join(app, "src"), join(copy, "src"), { recursive: true });
    const folder = join(copy, "test/report/opening");
    mkdirSync(folder, { recursive: true });
    const test = join(folder, "opening.test.ts");
    cpSync(join(import.meta.dirname, "opening.test.ts"), test);

    // Sous un noyau « #21 », sans fuite : le test passe.
    const healthy = plays(test, "#21-Ubuntu SMP PREEMPT_DYNAMIC");
    assert.equal(healthy.status, 0, `${healthy.stdout}\n${healthy.stderr}`);

    // Le filtre par ticket laisse passer les lignes de tous les tickets : celles de #21 entrent dans le rapport.
    const context = join(copy, "src/report/context/context.ts");
    const source = readFileSync(context, "utf8");
    const leak = source.replace('if ("ticket" in reference) return ligne.ticket === reference.ticket;', 'if ("ticket" in reference) return true;');
    assert.notEqual(leak, source, "the ticket filter was not found");
    writeFileSync(context, leak);
    const rendered = plays(test, "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1");
    assert.notEqual(rendered.status, 0, `the test stayed green with a #21 log line in the report\n${rendered.stdout}`);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
