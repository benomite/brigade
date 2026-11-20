// Ticket #3913 : le test « le corps porte les versions… » (ouverture.test.ts) doit toujours échouer si une ligne du
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
const joue = (fichier: string, version: string) => spawnSync(process.execPath, ["--import", PRELOAD(version), fichier], { encoding: "utf8", timeout: 60_000 });

test("le test du corps du signalement échoue si une ligne du ticket #21 entre dans le rapport", () => {
  const app = join(import.meta.dirname, "../../..");
  const copie = mkdtempSync(join(tmpdir(), "brigade-3913-"));
  try {
    cpSync(join(app, "src"), join(copie, "src"), { recursive: true });
    const dossier = join(copie, "test/signalement/ouverture");
    mkdirSync(dossier, { recursive: true });
    const test = join(dossier, "ouverture.test.ts");
    cpSync(join(import.meta.dirname, "ouverture.test.ts"), test);

    // Sous un noyau « #21 », sans fuite : le test passe.
    const sain = joue(test, "#21-Ubuntu SMP PREEMPT_DYNAMIC");
    assert.equal(sain.status, 0, `${sain.stdout}\n${sain.stderr}`);

    // Le filtre par ticket laisse passer les lignes de tous les tickets : celles de #21 entrent dans le rapport.
    const contexte = join(copie, "src/signalement/contexte/contexte.ts");
    const source = readFileSync(contexte, "utf8");
    const fuite = source.replace('if ("ticket" in reference) return ligne.ticket === reference.ticket;', 'if ("ticket" in reference) return true;');
    assert.notEqual(fuite, source, "the ticket filter was not found");
    writeFileSync(contexte, fuite);
    const rendu = joue(test, "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1");
    assert.notEqual(rendu.status, 0, `the test stayed green with a #21 log line in the report\n${rendu.stdout}`);
  } finally {
    rmSync(copie, { recursive: true, force: true });
  }
});
