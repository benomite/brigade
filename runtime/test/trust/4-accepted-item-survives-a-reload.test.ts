// #4421, criterion 4: an accepted item stays accepted after a reload of the store.
// Contract: `ouvrirAcceptes(file)` returns `{ accept(item), isAccepted(item) }`, persisted in `file`;
// an item is `{ kind: "issue" | "comment", id: number }`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirAcceptes } from "../../src/trust/acceptes.ts";

test("an accepted issue and an accepted comment are still accepted once the store is reopened", () => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-acceptes-"));
  try {
    const fichier = join(dossier, "acceptes.json");
    const avant = ouvrirAcceptes(fichier);
    assert.equal(avant.isAccepted({ kind: "issue", id: 42 }), false);
    avant.accept({ kind: "issue", id: 42 });
    avant.accept({ kind: "comment", id: 7 });
    assert.equal(avant.isAccepted({ kind: "issue", id: 42 }), true);

    const apres = ouvrirAcceptes(fichier);
    assert.equal(apres.isAccepted({ kind: "issue", id: 42 }), true);
    assert.equal(apres.isAccepted({ kind: "comment", id: 7 }), true);
    assert.equal(apres.isAccepted({ kind: "issue", id: 7 }), false);
    assert.equal(apres.isAccepted({ kind: "comment", id: 42 }), false);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
