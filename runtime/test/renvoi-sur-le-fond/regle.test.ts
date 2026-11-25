import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerLaPR, verifierMotifDeRenvoi } from "../../src/renvoi-sur-le-fond/regle.ts";

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
