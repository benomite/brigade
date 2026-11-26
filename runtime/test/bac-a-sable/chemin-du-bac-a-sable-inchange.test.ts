// Le chemin du bac à sable reste celui d'avant, quand le mode restreint existe.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configurer } from "../../src/bac-a-sable/configuration.ts";
import { dansLeBacASableLocal, poserLeBacASable, type BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { reglesDuProjet } from "../../src/reseau.ts";

// brigade:guard
test("le chemin du bac à sable ne change pas : mêmes arguments que ceux que la configuration pose", () => {
  const args = ["-p", "x", "--permission-mode", "bypassPermissions", "--disallowedTools", "y"];
  const bac: BacASableLocal = { version: "2.1.300", home: "/Users/chef", caches: [], hotes: () => reglesDuProjet(["registry.npmjs.org"]) };
  const attendu = poserLeBacASable(args, configurer({ worktree: "/Users/chef/wt/12", caches: [], hotes: reglesDuProjet(["registry.npmjs.org"]), home: "/Users/chef", lit: [], brigade: false, services: undefined }));
  assert.deepEqual(dansLeBacASableLocal(bac, args, "/Users/chef/wt/12"), attendu);
});
