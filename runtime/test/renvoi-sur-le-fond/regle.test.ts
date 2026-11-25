import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerLaPR, motifsDeLaRelecture, motifsEnonces, remarquesDeLaRelecture, verifierMotifDeRenvoi } from "../../src/renvoi-sur-le-fond/regle.ts";

test("a red CI without any remark is sent back as a failing test", () => {
  assert.deepEqual(jugerLaPR({ remarques: [], ci: "red" }), { action: "send-back", notes: [], motifs: ["failing test"] });
});

test("behaviour and criterion remarks are sent back with their own reason, once each", () => {
  const v = jugerLaPR({
    remarques: [{ nature: "behaviour", texte: "a" }, { nature: "behaviour", texte: "b" }, { nature: "criterion", texte: "c" }],
    ci: "green",
  });
  assert.deepEqual(v.motifs, ["wrong behaviour", "unmet criterion"]);
});

test("an empty reason is refused", () => {
  assert.throws(() => verifierMotifDeRenvoi(""), /failing test/);
});

test("a review text is read as remarks: blocking bullets by their words, other bullets as form", () => {
  const texte = "Summary.\n- **Blocking** (a.ts): Criterion of the ticket not met\n- **Blocking**: Mutation check — survived\n- **Blocking**: it crashes\n- Advice: rename";
  assert.deepEqual(remarquesDeLaRelecture(texte).map((r) => r.nature), ["criterion", "test-failure", "behaviour", "form"]);
  assert.deepEqual(motifsDeLaRelecture(texte), ["unmet criterion", "failing test", "wrong behaviour"]);
});

test("a review text without bullets is one wrong behaviour; an advice-only review still sends back for it", () => {
  assert.deepEqual(motifsDeLaRelecture("tests missing"), ["wrong behaviour"]);
  assert.deepEqual(motifsDeLaRelecture("- Advice: rename"), ["wrong behaviour"]);
});

test("the stated reasons are checked against the list", () => {
  assert.equal(motifsEnonces(["failing test", "unmet criterion"]), "Send-back reason: failing test, unmet criterion");
  assert.throws(() => motifsEnonces(["style"]), /wrong behaviour/);
});
