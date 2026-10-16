// La limite d'appels du compte : le budget par heure glissante, et l'attente de
// la fin de la fenêtre que GitHub annonce.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estLimite, ouvrirLimite } from "../src/limite-github.ts";

test("le budget épuisé, plus d'appel jusqu'à ce que le plus ancien sorte de l'heure", () => {
  let instant = 1_000_000;
  const limite = ouvrirLimite({ budget: 3, maintenant: () => instant });
  for (let i = 0; i < 3; i++) {
    assert.equal(limite.repriseA(), null);
    limite.compter();
    instant += 60_000;
  }
  assert.equal(limite.appels(), 3);
  assert.equal(limite.repriseA(), 1_000_000 + 3_600_000);
  assert.match(limite.dire() ?? "", /^GitHub limite les appels, reprise vers \d\d:\d\d$/);
  instant = 1_000_000 + 3_600_001;
  assert.equal(limite.repriseA(), null);
  assert.equal(limite.appels(), 2);
});

test("GitHub dit sa limite atteinte : on attend la fin de sa fenêtre, ou une minute s'il ne la dit pas", () => {
  let instant = 5_000_000;
  const limite = ouvrirLimite({ maintenant: () => instant });
  limite.atteinte(6_000);
  assert.equal(limite.repriseA(), 6_000_000);
  instant = 6_000_001;
  assert.equal(limite.repriseA(), null);
  limite.atteinte(null);
  assert.equal(limite.repriseA(), instant + 60_000);
});

test("ce qui est une limite : 429, ou 403 qui le dit — pas un 403 de droits", () => {
  assert.equal(estLimite(429, ""), true);
  assert.equal(estLimite(403, '{"message":"API rate limit exceeded"}'), true);
  assert.equal(estLimite(403, "gh: You have exceeded a secondary rate limit (HTTP 403)"), true);
  assert.equal(estLimite(403, '{"message":"Resource not accessible"}'), false);
  assert.equal(estLimite(404, "rate limit"), false);
});
