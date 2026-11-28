// Chaque mot d'état que l'app affiche vient d'une seule table (slip.ts) : tout état connu y a son mot
// anglais, aucun mot français ne s'affiche, et la vue comme le rail publié n'en gardent pas de copie.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const FRENCH = ["pris", "en attente", "en pass", "servi", "ouverte", "retenue", "arrêtée", "éteinte"];
const VUE = join(import.meta.dirname, "../src/vue");

describe("les mots d'état, en anglais, d'une seule table", () => {

  test("la vue ne garde aucune copie de la table", () => {
    for (const file of ["vue.js"]) {
      const source = readFileSync(join(VUE, file), "utf8");
      assert.ok(!/["'`](pris|en attente|en pass|servi|ouverte|retenue|arrêtée|éteinte)["'`]\s*[:)]?\s*[?:]\s*["'`](taken|queued|open)/.test(source), file);
      assert.ok(!/"86"\s*\?\s*"set aside"/.test(source), `${file} traduit « 86 »`);
    }
  });
});
