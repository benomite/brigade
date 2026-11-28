import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

for (const fichier of ["publier-app.yml", "android.yml"]) {
  test(`${fichier}: every setup-java step caches the Gradle dependencies`, () => {
    const workflow = readFileSync(fileURLToPath(new URL(`../../../.github/workflows/${fichier}`, import.meta.url)), "utf8");
    const etapes = workflow.split(/^\s*- (?=uses: actions\/setup-java@)/m).slice(1).map((e) => e.split(/^\s*- /m)[0] ?? "");
    assert.ok(etapes.length > 0, "no setup-java step");
    for (const etape of etapes) {
      assert.match(etape, /^uses: actions\/setup-java@v5\b/, "setup-java is not on v5");
      assert.match(etape, /^\s*cache: gradle\s*$/m, "setup-java does not cache gradle");
    }
  });
}
