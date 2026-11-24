// Test d'acceptation gelé (#4164). Critère 1 : la recherche « design cook » (anglais et français, sans casse) ne renvoie
// aucune ligne dans docs/ et les bindings, hors la spec qui définit la règle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SPEC = "docs/superpowers/specs/2026-11-24-simplified-process.md";

test("grep for design cook wording finds nothing in docs/ and the bindings, except the spec", () => {
  const r = spawnSync(
    "grep",
    ["-rniE", "design[ _-]?cook|cook[ _-]?design|cook de design|cuisinier design", "docs/", "CLAUDE.md", ".claude-plugin", "agents"],
    { cwd: racine, encoding: "utf8" },
  );
  const restes = r.stdout.split("\n").filter((l) => l !== "" && !l.startsWith(`${SPEC}:`));
  assert.deepEqual(restes, []);
});
