// Ticket #3778 — le logo du README, en cuivre poli sur les deux thèmes de GitHub.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

for (const file of ["docs/logo/brigade-logo-clair.svg", "docs/logo/brigade-logo-sombre.svg"]) {
  test(`${file} rend le cuivre poli`, () => {
    const svg = read(file);
    for (const color of ["#ffd2b0", "#e8875a", "#b4532a", "#f0a072", "#c0602f", "#6e2a10"]) {
      assert.match(svg, new RegExp(color, "i"), `arrêt ${color} absent`);
    }
    assert.match(svg, /<radialGradient\b[^>]*>[\s\S]*?stop-color="#fff"[\s\S]*?<\/radialGradient>/i, "tache de lumière absente");
    assert.match(svg, /#5a200a/i, "liseré sombre absent");
    assert.doesNotMatch(svg, /#f6a66b|#d2601f/i, "l'ancien dégradé est encore là");
  });
}
