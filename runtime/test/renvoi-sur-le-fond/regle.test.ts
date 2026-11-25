import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerLaPR, motifsDeLaRelecture, verdictDeLaRelecture, verifierMotifDeRenvoi } from "../../src/renvoi-sur-le-fond/regle.ts";

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

test("a review text gives the reasons its blocking bullets carry, by their words", () => {
  const texte = "Summary.\n- **Blocking** (a.ts): Criterion of the ticket not met\n- **Blocking**: Mutation check — survived\n- **Blocking**: it crashes\n- Advice: rename";
  assert.deepEqual(motifsDeLaRelecture(texte), ["unmet criterion", "failing test", "wrong behaviour"]);
});

test("a review text without bullets is one wrong behaviour; an advice-only review still sends back for it", () => {
  assert.deepEqual(motifsDeLaRelecture("tests missing"), ["wrong behaviour"]);
  assert.deepEqual(motifsDeLaRelecture("- Advice: rename"), ["wrong behaviour"]);
});

test("a red review whose findings are all advice is approved; one blocking finding, or none at all, sends back", () => {
  const conseil = { severity: "advice", text: "rename the test" };
  assert.equal(verdictDeLaRelecture({ verdict: "red", findings: [conseil] }), "approve");
  assert.equal(verdictDeLaRelecture({ verdict: "red", findings: [conseil, { severity: "blocking", text: "it crashes" }] }), "request-changes");
  assert.equal(verdictDeLaRelecture({ verdict: "red", findings: [] }), "request-changes");
  assert.equal(verdictDeLaRelecture({ verdict: "green", findings: [{ severity: "blocking", text: "x" }] }), "approve");
});
