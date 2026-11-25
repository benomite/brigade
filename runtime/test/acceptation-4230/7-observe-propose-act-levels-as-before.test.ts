// Test d'acceptation gelé (#4230), critère 7 : les niveaux observe / propose / act se comportent comme avant (garde, vert sur la base).
import assert from "node:assert/strict";
import { test } from "node:test";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { repertoireTemporaire } from "../outils.ts";

// brigade:guard
test("the observe / propose / act levels keep their defaults, can be set one at a time, and refuse what is no level", (t) => {
  const magasin = magasinDeNiveaux(repertoireTemporaire(t));
  assert.equal(magasin.lire("shop").pass, "act");
  assert.equal(magasin.lire("shop").closer, "propose");
  magasin.poser("shop", "closer", "observe");
  assert.equal(magasin.lire("shop").closer, "observe");
  assert.equal(magasin.lire("shop").pass, "act");
  assert.throws(() => magasin.poser("shop", "closer", "chef" as never));
});
