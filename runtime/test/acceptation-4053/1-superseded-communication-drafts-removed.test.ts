// #4053, critère 1 : les brouillons remplacés de `docs/communication/` sont supprimés, puisque
// `docs/marketing/launch-plan.md` les remplace.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("the superseded drafts in docs/communication/ are removed, launch-plan.md replaces them", () => {
  assert.ok(existsSync(join(RACINE, "docs/marketing/launch-plan.md")), "the launch plan stays");
  for (const brouillon of ["plan-lancement.md", "post-linkedin.md", "post-reddit-ClaudeAI.md"]) {
    assert.equal(existsSync(join(RACINE, "docs/communication", brouillon)), false, `${brouillon} must be removed`);
  }
});
