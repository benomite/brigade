// Le nom d'un projet, avant la box : la forme qu'elle accepte, refusée à la saisie avec sa raison.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { refusalOfShape } from "../src/name.ts";

describe("la forme du nom", () => {
  test("minuscules, chiffres et tirets passent ; un champ vide ne dit rien de la forme", () => {
    for (const name of ["", "  ", "boutique", "ma-cuisine-2", "42", " boutique "]) assert.equal(refusalOfShape(name), undefined, name);
  });

  test("une majuscule, un espace, un caractère refusé : le champ le dit, avec la forme attendue", () => {
    const reason = refusalOfShape("Calculus") as string;
    assert.match(reason, /^The station refuses this name — it contains “C”\./);
    assert.match(reason, /lowercase letters, digits and hyphens/);
    assert.match(refusalOfShape("ma cuisine") as string, /space/);
    assert.match(refusalOfShape("a_b.c") as string, /“_”, “\.”/);
  });

  test("un tiret en tête, un nom trop long : refusés aussi, chacun avec sa raison", () => {
    assert.match(refusalOfShape("-boutique") as string, /it starts with a hyphen/);
    assert.match(refusalOfShape("a".repeat(64)) as string, /it is 64 characters long/);
    assert.equal(refusalOfShape("a".repeat(63)), undefined);
  });

});
