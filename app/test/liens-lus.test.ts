import assert from "node:assert/strict";
import { test } from "node:test";
import { LiensLus } from "../src/liens-lus.ts";

test("le lien d'une capture survit à la lecture de la discussion, et ne s'écrit qu'une fois", () => {
  const liens = new LiensLus();
  const cle = "parade#30";
  const fichier = "https://github.com/benomite/brigade/blob/abc/docs/captures/30/a.png";
  liens.capture(cle, fichier);
  liens.capture(cle, fichier);
  liens.discussion(cle, ["https://github.com/benomite/brigade/pull/31"]);
  assert.ok(liens.connait(cle, fichier));
  assert.ok(liens.connait(cle, "https://github.com/benomite/brigade/pull/31"));
  liens.discussion(cle, []);
  assert.ok(!liens.connait(cle, "https://github.com/benomite/brigade/pull/31"));
  assert.ok(!liens.connait("parade#31", fichier));
});
