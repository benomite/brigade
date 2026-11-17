// #3779: the site favicon and the 'Cooked by Brigade' badges wear the polished-copper gradient.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SITE = join(import.meta.dirname, "../../site");
const FILES = ["logo.svg", "badge-cooked-by-brigade-clair.svg", "badge-cooked-by-brigade-sombre.svg"];
const STOPS: [number, string][] = [[0, "#ffd2b0"], [18, "#e8875a"], [42, "#b4532a"], [60, "#f0a072"], [78, "#c0602f"], [100, "#6e2a10"]];

const offsetOf = (tag: string): number | null => {
  const m = tag.match(/offset=["']([\d.]+)(%?)["']/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? n : n <= 1 ? n * 100 : n;
};

for (const f of FILES) {
  test(`${f} shows the copper bands, a light spot and a darker rim`, () => {
    const svg = readFileSync(join(SITE, f), "utf8");
    const stops = [...svg.matchAll(/<stop\b[^>]*>/gi)].map((m) => m[0]);
    for (const [off, color] of STOPS) {
      assert.ok(
        stops.some((s) => offsetOf(s) === off && s.toLowerCase().includes(color)),
        `${f}: stop ${off}% ${color}`,
      );
    }
    assert.match(svg, /<radialGradient\b[\s\S]*?stop-color=["']#fff(fff)?["'][\s\S]*?<\/radialGradient>/i, `${f}: white light spot`);
    assert.match(svg, /#fff(fff)?/i);
    assert.ok(svg.toLowerCase().includes("#5a200a"), `${f}: dark rim #5a200a`);
    assert.match(svg, /<linearGradient\b[^>]*>/i);
  });
}
