// Ticket #3913 : le test « le corps porte les versions… » (ouverture.test.ts) ne doit pas dépendre du noyau du runner.
// Critère 1 : il passe quelle que soit la chaîne de version du système — ici un noyau Linux numéroté « #21 ».
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const PRELOAD = (version: string) =>
  `data:text/javascript,${encodeURIComponent(`import os from "node:os"; import { syncBuiltinESMExports } from "node:module"; os.version = () => ${JSON.stringify(version)}; syncBuiltinESMExports();`)}`;

// brigade:guard
test("le test du corps du signalement passe quand la version du noyau contient « #21 »", () => {
  const fichier = join(import.meta.dirname, "ouverture.test.ts");
  for (const version of ["#21-Ubuntu SMP PREEMPT_DYNAMIC Fri Nov 14 10:02:11 UTC 2026", "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1"]) {
    const rendu = spawnSync(process.execPath, ["--import", PRELOAD(version), fichier], { encoding: "utf8", timeout: 60_000 });
    assert.equal(rendu.status, 0, `${version}\n${rendu.stdout}\n${rendu.stderr}`);
  }
});

// brigade:guard
test("le test du corps du signalement échoue si une ligne du ticket #21 entre dans le rapport", () => {
  const copie = mkdtempSync(join(tmpdir(), "brigade-3913-"));
  try {
    cpSync(join(import.meta.dirname, "../../../src"), join(copie, "src"), { recursive: true });
    const dossier = join(copie, "test/signalement/ouverture");
    mkdirSync(dossier, { recursive: true });
    const fichier = join(dossier, "ouverture.test.ts");
    cpSync(join(import.meta.dirname, "ouverture.test.ts"), fichier);
    // Le filtre par ticket laisse tout passer : les lignes de #21 entrent dans le rapport.
    const contexte = join(copie, "src/signalement/contexte/contexte.ts");
    const source = readFileSync(contexte, "utf8");
    const fuite = source.replace('if ("ticket" in reference) return ligne.ticket === reference.ticket;', 'if ("ticket" in reference) return true;');
    assert.notEqual(fuite, source, "the ticket filter was not found");
    writeFileSync(contexte, fuite);
    const rendu = spawnSync(process.execPath, ["--import", PRELOAD("#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1"), fichier], { encoding: "utf8", timeout: 60_000 });
    assert.notEqual(rendu.status, 0, `the test stayed green with a #21 log line in the report\n${rendu.stdout}`);
  } finally {
    rmSync(copie, { recursive: true, force: true });
  }
});
