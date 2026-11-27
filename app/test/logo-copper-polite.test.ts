// Ticket #3778 — le logo maître en cuivre poli : le dégradé diagonal aux six
// arrêts donnés, la tache de lumière blanche, une strie, le liseré sombre.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(import.meta.dirname, "../..");
const MASTER = readFileSync(join(ROOT, "docs/logo/brigade-icone.svg"), "utf8");

const STOPS: [number, string][] = [
  [0, "#ffd2b0"], [18, "#e8875a"], [42, "#b4532a"], [60, "#f0a072"], [78, "#c0602f"], [100, "#6e2a10"],
];

function percent(value: string): number {
  return value.trim().endsWith("%") ? parseFloat(value) : parseFloat(value) * 100;
}

test("le logo maître porte le dégradé de cuivre poli, la tache de lumière et le liseré sombre", () => {
  const stops = [...MASTER.matchAll(/<stop\b[^>]*>/gi)].map((m) => {
    const offset = /offset\s*=\s*"([^"]+)"/i.exec(m[0])?.[1];
    const color = /stop-color\s*[=:]\s*"?(#[0-9a-f]{6})/i.exec(m[0])?.[1];
    return { offset: offset === undefined ? NaN : percent(offset), couleur: color?.toLowerCase() };
  });
  for (const [offset, color] of STOPS) {
    assert.ok(
      stops.some((a) => Math.abs(a.offset - offset) < 0.5 && a.couleur === color),
      `arrêt manquant : ${color} à ${offset}%`,
    );
  }
  // Diagonale : haut-gauche vers bas-droite.
  const degraded = /<linearGradient\b[^>]*>/i.exec(MASTER)?.[0] ?? "";
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((n) => parseFloat(new RegExp(`${n}\\s*=\\s*"([^"%]+)`).exec(degraded)?.[1] ?? "NaN")) as [number, number, number, number];
  assert.ok(x2 > x1 && y2 > y1, "le dégradé doit descendre en diagonale, du haut-gauche au bas-droite");
  // Tache de lumière : un dégradé radial blanc qui s'efface.
  assert.match(MASTER, /<radialGradient\b/i, "tache de lumière absente");
  assert.match(MASTER, /(#fff\b|#ffffff|white)/i, "la lumière est blanche");
  assert.match(MASTER, /stop-opacity\s*[=:]\s*"?0(\.\d+)?"?/i, "la lumière doit s'effacer");
  assert.match(MASTER, /(opacity|stop-opacity)\s*[=:]\s*"?\.?(0?\.5\d?)"?/i, "tache à environ 55 % d'opacité");
  // Liseré sombre.
  assert.match(MASTER, /#5a200a/i, "liseré sombre #5a200a absent");
  assert.match(MASTER, /stroke\s*=/i, "le liseré sombre et le bord intérieur clair sont des traits");
});
