// Ticket #3778 — l'icône ronde d'Android : le fond de l'icône maître, ses rx relevés de 17.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fondRond, iconeRonde } from "../packaging/icone-ronde.ts";

const MAITRE = readFileSync(join(import.meta.dirname, "../../docs/logo/brigade-icone.svg"), "utf8");

test("le fond rond reprend les rx du maître, chacun relevé de 17, et s'arrête avant le glyphe", () => {
  const rx = [...fondRond(MAITRE).matchAll(/rx="([\d.]+)"/g)].map((m) => Number(m[1]));
  const maitre = [...MAITRE.split('<g transform="translate(5.5')[0]!.matchAll(/rx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(rx, maitre.map((r) => r + 17));
  assert.deepEqual(rx, [32, 32, 32, 29.5, 31]);
  assert.ok(!fondRond(MAITRE).includes("translate(5.5"));
  assert.match(fondRond(MAITRE), /<defs>/);
});

test("une icône maître sans glyphe est refusée", () => {
  assert.throws(() => fondRond('<svg viewBox="0 0 64 64"></svg>'), /introuvable/);
});

test("l'icône ronde est le fond rond suivi du glyphe, dans un cadre de 64", () => {
  const svg = iconeRonde(MAITRE, "<g>GLYPHE</g>");
  assert.equal(svg, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${fondRond(MAITRE)}<g transform="translate(5.5 6.4) scale(.8)"><g>GLYPHE</g></g></svg>`);
  assert.ok(svg.indexOf("rx=\"32\"") < svg.indexOf("GLYPHE"));
});
