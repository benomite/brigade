// Sur un dépôt qu'un nouveau venu a ouvert, tout ce que la brigade y écrit est en anglais : le cook y écrit son
// livrable, qui devient le texte de sa PR et le commentaire du ticket (#4056). Sa consigne, en français, le lui dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigne, consigneDeSuite } from "../../src/claude.ts";

// Les phrases de la consigne qui disent la langue de ce qui s'écrit sur le dépôt : le livrable, le compte-rendu, les
// messages de commit, la PR. Les captures ont leurs propres lignes en anglais, qui n'en font pas partie.
const phrasesDeLangue = (texte: string) =>
  texte
    .split(/(?<=[.!?:])\s+/)
    .filter((phrase) => /en anglais|in English/i.test(phrase) && /livrable|compte-rendu|commit|\bPR\b|pull request/i.test(phrase) && !/à l'écran|## Changes/.test(phrase));

test("la consigne du cook dit d'écrire en anglais ce qui part sur le dépôt : livrable, compte-rendu, commits, PR", () => {
  const mission = { ticket: 20, titre: "Préparer le dépôt", depot: "acme/shop", base: "main" };
  for (const texte of [consigne(mission), consigneDeSuite({ ...mission, branche: "cook/20-abc" })]) {
    assert.ok(phrasesDeLangue(texte).length > 0, "aucune phrase de la consigne ne dit la langue du livrable");
  }
});
