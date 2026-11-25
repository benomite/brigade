// Test d'acceptation gelé (#4276), critère 1 : les trois tests de `runtime/test/acceptation-4137/` existent et passent.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dossier = join(import.meta.dirname, "..", "acceptation-4137");

test("the three frozen tests of runtime/test/acceptation-4137 exist and pass", () => {
  const fichiers = readdirSync(dossier).filter((nom) => nom.endsWith(".test.ts")).map((nom) => join(dossier, nom));
  assert.equal(fichiers.length, 3);
  const res = spawnSync(process.execPath, ["--test", ...fichiers], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});
