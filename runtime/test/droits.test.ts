import assert from "node:assert/strict";
import { test } from "node:test";
import { lisibleParDAutres } from "../src/droits.ts";

test("sous macOS et Linux, un fichier de secrets lisible du groupe ou des autres est ouvert ; sous Windows, ses bits de mode ne disent rien et il ne l'est jamais", () => {
  for (const plateforme of ["linux", "darwin"] as const) {
    assert.equal(lisibleParDAutres(0o100600, plateforme), false);
    assert.equal(lisibleParDAutres(0o100640, plateforme), true);
    assert.equal(lisibleParDAutres(0o100604, plateforme), true);
  }
  // Ce que Node rend pour tout fichier sous Windows.
  assert.equal(lisibleParDAutres(0o100666, "win32"), false);
  assert.equal(lisibleParDAutres(0o100444, "win32"), false);
});
