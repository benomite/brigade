// Les éléments acceptés (#4421) : un fichier illisible n'est ni lu vide ni
// écrasé, et un élément mal formé est refusé.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AcceptesIllisibles, ouvrirAcceptes } from "../../src/trust/acceptes.ts";
import { repertoireTemporaire } from "../outils.ts";

test("an unreadable store refuses to open and is left as it was", (t) => {
  const fichier = join(repertoireTemporaire(t), "acceptes.json");
  for (const contenu of ["{ not json", '{"accepted": "issue:1"}', '{"accepted": ["issue:1", "pr:2"]}']) {
    writeFileSync(fichier, contenu);
    assert.throws(() => ouvrirAcceptes(fichier), AcceptesIllisibles);
    assert.equal(readFileSync(fichier, "utf8"), contenu);
  }
});

test("a missing store opens empty, and accepting twice writes the item once", (t) => {
  const fichier = join(repertoireTemporaire(t), "sous", "acceptes.json");
  const store = ouvrirAcceptes(fichier);
  assert.equal(store.isAccepted({ kind: "comment", id: 3 }), false);
  store.accept({ kind: "comment", id: 3 });
  store.accept({ kind: "comment", id: 3 });
  assert.deepEqual(JSON.parse(readFileSync(fichier, "utf8")), { accepted: ["comment:3"] });
});

test("a malformed item is refused", (t) => {
  const store = ouvrirAcceptes(join(repertoireTemporaire(t), "acceptes.json"));
  assert.throws(() => store.accept({ kind: "issue", id: 0 }));
  assert.throws(() => store.accept({ kind: "pr" as "issue", id: 4 }));
  assert.throws(() => store.isAccepted({ kind: "issue", id: 1.5 }));
});
