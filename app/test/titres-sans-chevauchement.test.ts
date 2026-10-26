// Les titres de section ne flottent pas sur la page (ticket 1701). Cause trouvée : `#rail h4` était
// `position: sticky` pour tous les h4 du rail, alors que seule la tête d'une colonne doit rester en
// haut de sa rangée (#1556) ; sur Cooks, chaque titre de bloc (« tickets, last hour and last day »,
// « gates, latest run against budget »…) se collait au haut du rail et recouvrait le reste en défilant.
// Ce que la peinture donne ne se voit pas ici : on lit les règles de vue.css.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const CSS = readFileSync(join(import.meta.dirname, "../src/vue/vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const regles = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteurs: (m[1] ?? "").split(",").map((s) => s.trim()), corps: m[2] ?? "" }));

describe("les titres de section ne recouvrent rien", () => {
  test("seule la tête d'une colonne du rail est collée en haut : aucun titre h2, h3 ou h4 de section n'est sticky", () => {
    const collants = regles
      .filter((r) => /position:\s*(sticky|fixed)/.test(r.corps))
      .flatMap((r) => r.selecteurs)
      .filter((s) => /(^|[\s>])(h[1-6])(\s|$|:|\[)/.test(s) || /(^|[\s>])h[1-6]$/.test(s));
    assert.deepEqual(collants.filter((s) => !/#rail \.colonne h4$/.test(s)), []);
  });

  test("la tête d'une colonne reste collée (#1556) et opaque, pour que les cartes passent dessous", () => {
    const r = regles.find((x) => x.selecteurs.includes("#rail .colonne h4"));
    assert.ok(r, "règle de la tête de colonne");
    assert.match(r.corps, /position:\s*sticky/);
    assert.match(r.corps, /background:/);
  });
});
