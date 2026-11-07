// #2661 : le découpage du manager est illisible à 07:55, la relance l'est
// aussi — l'épique se juge alors comme un ticket seul, sans troisième demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Reponse } from "../../src/decoupage.ts";
import { demanderAvecRelance } from "../../src/manager/decoupage-illisible.ts";

const illisible: Reponse<string> = { illisible: "aucun objet JSON dans la réponse", run: "decoupe-2661-a" };
const lisible: Reponse<string> = { valeur: "tickets", run: "decoupe-2661-b" };

describe("un découpage illisible", () => {
  test("#2661 : illisible deux fois, l'épique est jugée comme un ticket seul", async () => {
    let demandes = 0;
    let seuls = 0;
    const suite = await demanderAvecRelance(
      async () => (demandes++, illisible),
      async () => (seuls++, true),
    );
    assert.equal(demandes, 2);
    assert.equal(seuls, 1);
    assert.deepEqual(suite, { seul: true });
  });

  test("la seconde réponse lisible est utilisée normalement", async () => {
    const reponses = [illisible, lisible];
    let seuls = 0;
    const suite = await demanderAvecRelance(
      async () => reponses.shift() ?? null,
      async () => (seuls++, true),
    );
    assert.deepEqual(suite, { reponse: lisible });
    assert.equal(seuls, 0);
  });

  test("une première réponse lisible n'est pas redemandée", async () => {
    let demandes = 0;
    const suite = await demanderAvecRelance(
      async () => (demandes++, lisible),
      async () => true,
    );
    assert.equal(demandes, 1);
    assert.deepEqual(suite, { reponse: lisible });
  });
});
