// Ticket #3778 — le logo du README, en cuivre poli sur les deux thèmes de GitHub,
// sans que README.md change de chemins d'image.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const RACINE = join(import.meta.dirname, "../..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

test("README.md garde ses chemins d'image", () => {
  const readme = lire("README.md");
  assert.match(readme, /srcset="docs\/logo\/brigade-logo-sombre\.svg"/);
  assert.match(readme, /<img src="docs\/logo\/brigade-logo-clair\.svg"/);
});

for (const fichier of ["docs/logo/brigade-logo-clair.svg", "docs/logo/brigade-logo-sombre.svg"]) {
  test(`${fichier} rend le cuivre poli`, () => {
    const svg = lire(fichier);
    for (const couleur of ["#ffd2b0", "#e8875a", "#b4532a", "#f0a072", "#c0602f", "#6e2a10"]) {
      assert.match(svg, new RegExp(couleur, "i"), `arrêt ${couleur} absent`);
    }
    assert.match(svg, /<radialGradient\b|<linearGradient\b[^>]*>[\s\S]*#fff/i, "tache de lumière absente");
    assert.match(svg, /#5a200a/i, "liseré sombre absent");
    assert.doesNotMatch(svg, /#f6a66b|#d2601f/i, "l'ancien dégradé est encore là");
  });
}
