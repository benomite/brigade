// Ticket #3778 — le logo maître en cuivre poli : le dégradé diagonal aux six
// arrêts donnés, la tache de lumière blanche, une strie, le liseré sombre.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const RACINE = join(import.meta.dirname, "../..");
const MAITRE = readFileSync(join(RACINE, "docs/logo/brigade-icone.svg"), "utf8");

const ARRETS: [number, string][] = [
  [0, "#ffd2b0"], [18, "#e8875a"], [42, "#b4532a"], [60, "#f0a072"], [78, "#c0602f"], [100, "#6e2a10"],
];

function pourcent(valeur: string): number {
  return valeur.trim().endsWith("%") ? parseFloat(valeur) : parseFloat(valeur) * 100;
}

test("le logo maître porte le dégradé de cuivre poli, la tache de lumière et le liseré sombre", () => {
  const arrets = [...MAITRE.matchAll(/<stop\b[^>]*>/gi)].map((m) => {
    const offset = /offset\s*=\s*"([^"]+)"/i.exec(m[0])?.[1];
    const couleur = /stop-color\s*[=:]\s*"?(#[0-9a-f]{6})/i.exec(m[0])?.[1];
    return { offset: offset === undefined ? NaN : pourcent(offset), couleur: couleur?.toLowerCase() };
  });
  for (const [offset, couleur] of ARRETS) {
    assert.ok(
      arrets.some((a) => Math.abs(a.offset - offset) < 0.5 && a.couleur === couleur),
      `arrêt manquant : ${couleur} à ${offset}%`,
    );
  }
  // Diagonale : haut-gauche vers bas-droite.
  const degrade = /<linearGradient\b[^>]*>/i.exec(MAITRE)?.[0] ?? "";
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((n) => parseFloat(new RegExp(`${n}\\s*=\\s*"([^"%]+)`).exec(degrade)?.[1] ?? "NaN")) as [number, number, number, number];
  assert.ok(x2 > x1 && y2 > y1, "le dégradé doit descendre en diagonale, du haut-gauche au bas-droite");
  // Tache de lumière : un dégradé radial blanc qui s'efface.
  assert.match(MAITRE, /<radialGradient\b/i, "tache de lumière absente");
  assert.match(MAITRE, /(#fff\b|#ffffff|white)/i, "la lumière est blanche");
  assert.match(MAITRE, /stop-opacity\s*[=:]\s*"?0(\.\d+)?"?/i, "la lumière doit s'effacer");
  assert.match(MAITRE, /(opacity|stop-opacity)\s*[=:]\s*"?\.?(0?\.5\d?)"?/i, "tache à environ 55 % d'opacité");
  // Liseré sombre.
  assert.match(MAITRE, /#5a200a/i, "liseré sombre #5a200a absent");
  assert.match(MAITRE, /stroke\s*=/i, "le liseré sombre et le bord intérieur clair sont des traits");
});
