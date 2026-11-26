// Frozen acceptance test (#4239). Criterion 2: a project with a missing or empty file shows an explicit empty state, not an error.
// `lireLeSavoir` (see test 1) does not throw on a missing or empty file: it answers `vide: true` with no entry.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLeSavoir } from "../../src/vue/know-how/know-how-github.ts";
import type { ClientDeLaPriorite } from "../../src/priorite.ts";

const clientDe = (reponse: { status: number; data: unknown }): ClientDeLaPriorite => ({ lire: async () => reponse, ecrire: async () => ({ status: 500, data: {} }) });
const fichier = (texte: string) => ({ status: 200, data: { type: "file", content: Buffer.from(texte).toString("base64"), sha: "s1" } });

test("a missing file (404) is an empty state, not an error", async () => {
  const lu = await lireLeSavoir(clientDe({ status: 404, data: { message: "Not Found" } }), "chef/parade", "main");
  assert.equal(lu.vide, true);
  assert.deepEqual(lu.entries, []);
});

test("an empty file, or one with section headings only, is an empty state", async () => {
  for (const texte of ["", "## Conventions\n\n## Pitfalls\n\n## Tools\n"]) {
    const lu = await lireLeSavoir(clientDe(fichier(texte)), "chef/parade", "main");
    assert.equal(lu.vide, true);
    assert.deepEqual(lu.entries, []);
  }
});
