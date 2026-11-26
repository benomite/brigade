// Deux lignes du retrait du cook design : le rang d'un ticket illisible, et la
// livraison sans écran que la retenue laisse passer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireDecoupage } from "../../src/decouper.ts";
import { retenirLeDesign } from "../../src/validation-design/validation-design.ts";

test("an unreadable ticket is named by its 1-based rank in the split", () => {
  const bon = { titre: "T", contexte: "c", criteres: ["a"], attend: [], zone: ["docs/"], capacites: [], modele: "sonnet", effort: "low", temps_attendu: 5, calibrage: "x" };
  const lu = lireDecoupage(JSON.stringify({ reponse: "tickets", motif: "m", ordre: "o", tickets: [bon, "pas un objet"] }));
  assert.ok("illisible" in lu);
  assert.match(lu.illisible, /^ticket 2: not an object/);
});

test("retenirLeDesign lets a delivery that changes no screen through, without asking GitHub anything", async () => {
  const github = new Proxy({}, { get: () => () => { throw new Error("GitHub must not be asked"); } }) as never;
  const motif = await retenirLeDesign(github, { ticket: { number: 5, title: "Runtime", labels: [] }, pr: { number: 9, sha: "abc" }, fichiers: ["runtime/src/pass.ts"] } as never);
  assert.equal(motif, null);
});
