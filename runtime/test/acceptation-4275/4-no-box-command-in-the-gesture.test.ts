// #4275, criterion 4: no code path in the gesture runs a box command. A search of its sources shows it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const DOSSIER = fileURLToPath(new URL("../../src/parked-gesture/", import.meta.url));

test("the gesture sources import no process-spawning module and name no box command", () => {
  const sources = readdirSync(DOSSIER, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  assert.ok(sources.length > 0, "runtime/src/parked-gesture/ holds the gesture");
  for (const fichier of sources) {
    const texte = readFileSync(join(DOSSIER, fichier), "utf8");
    assert.doesNotMatch(texte, /child_process|execa|execFile|execSync|spawnSync|Bun\.spawn|import\(|\bspawn\w*\(|\bexec\w*\(|\bfork\(/, fichier);
    assert.doesNotMatch(texte, /npm --prefix|\bssh\b|\bnpx\b/, fichier);
  }
});
