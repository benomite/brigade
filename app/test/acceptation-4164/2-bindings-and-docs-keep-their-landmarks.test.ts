// Test d'acceptation gelé (#4164). Critère 2 : `npm --prefix app test` et les tests du runtime passent — ici, ce que la
// réécriture des docs ne doit pas casser, que les tests lisent : les repères français de CLAUDE.md, les pages citées, et
// la ligne Interface qui parle des outils du projet (les captures passent par la liste d'outils).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const lire = (p: string) => readFileSync(resolve(racine, p), "utf8");

test("CLAUDE.md keeps its French labels and its Interface binding names the project's tools", () => {
  const claude = lire("CLAUDE.md");
  for (const repere of ["**Acteurs**", "**Interface**", "**Branche d'intégration**", "**Zones de fichiers**", "**Doc vivante**"]) {
    assert.ok(claude.includes(repere), repere);
  }
  const interfaceLine = claude.split("\n").find((l) => l.startsWith("- **Interface**")) ?? "";
  assert.match(interfaceLine, /\btools?\b/i);
  assert.doesNotMatch(interfaceLine, /design cook|#837/i);
});

test("the pages the docs rewrite touches still exist", () => {
  for (const p of ["docs/reglages.md", "docs/runtime/station.md", "docs/runtime/station-cook.md", "docs/runtime/manager.md", "docs/runtime/pass.md", "docs/maquettes/app/README.md", "docs/superpowers/specs/2026-11-24-simplified-process.md"]) {
    assert.ok(existsSync(resolve(racine, p)), p);
  }
});
