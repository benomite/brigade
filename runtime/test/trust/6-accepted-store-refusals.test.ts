// #4421: the accepted store never reads an unreadable file as empty, never writes a key it could not
// read back, and keeps what another process accepted since it was opened.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fichierDesAcceptes, ouvrirAcceptes } from "../../src/trust/acceptes.ts";

function dossier(t: TestContext) {
  const chemin = mkdtempSync(join(tmpdir(), "brigade-acceptes-"));
  t.after(() => rmSync(chemin, { recursive: true, force: true }));
  return chemin;
}

test("a missing file is an empty store, written on the first accept, in the state directory", (t) => {
  const etat = join(dossier(t), "etat");
  const fichier = fichierDesAcceptes(etat);
  assert.equal(fichier, join(etat, "accepted.json"));
  const store = ouvrirAcceptes(fichier);
  assert.equal(store.isAccepted({ kind: "comment", id: 7 }), false);
  store.accept({ kind: "comment", id: 7 });
  assert.deepEqual(JSON.parse(readFileSync(fichier, "utf8")), { accepted: ["comment:7"] });
});

for (const [cas, contenu, motif] of [
  ["broken JSON", "{", /is not JSON/],
  ["no list", JSON.stringify({ accepted: "issue:1" }), /is not a list of accepted items/],
  ["null", "null", /is not a list of accepted items/],
  ["an unknown key", JSON.stringify({ accepted: ["issue:1", "pr:2"] }), /is not a list of accepted items/],
  ["a key that is not a string", JSON.stringify({ accepted: [42] }), /is not a list of accepted items/],
] as const) {
  test(`an unreadable file (${cas}) is refused, and left as it is`, (t) => {
    const fichier = join(dossier(t), "accepted.json");
    writeFileSync(fichier, contenu);
    assert.throws(() => ouvrirAcceptes(fichier), motif);
    assert.equal(readFileSync(fichier, "utf8"), contenu);
  });
}

test("a file that cannot be read for another reason than its absence is refused", (t) => {
  // A directory in place of the file: reading it fails with EISDIR, not ENOENT.
  assert.throws(() => ouvrirAcceptes(dossier(t)), /EISDIR/);
});

test("an item that is not an issue or a comment id is refused, and nothing is written", (t) => {
  const fichier = join(dossier(t), "accepted.json");
  const store = ouvrirAcceptes(fichier);
  assert.throws(() => store.accept({ kind: "issue", id: 0 }), /not an issue or a comment id/);
  assert.throws(() => store.accept({ kind: "pr" as "issue", id: 3 }), /not an issue or a comment id/);
  assert.throws(() => readFileSync(fichier), /ENOENT/);
  assert.equal(store.isAccepted({ kind: "issue", id: 0 }), false);
});

test("an accept keeps what another process accepted since this store was opened", (t) => {
  const fichier = join(dossier(t), "accepted.json");
  const premier = ouvrirAcceptes(fichier);
  ouvrirAcceptes(fichier).accept({ kind: "issue", id: 1 });
  premier.accept({ kind: "comment", id: 2 });
  assert.equal(premier.isAccepted({ kind: "issue", id: 1 }), true);
  assert.deepEqual(JSON.parse(readFileSync(fichier, "utf8")), { accepted: ["comment:2", "issue:1"] });
});
