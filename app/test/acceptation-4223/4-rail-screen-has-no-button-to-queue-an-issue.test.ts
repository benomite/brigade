// #4223, critère 4 : l'écran du rail n'a ni bouton ni action qui met une issue en file.
// Interface visée : app/src/vue/rail/rail.ts exporte `htmlDuRail(issues)`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { htmlDuRail } from "../../src/vue/rail/rail.ts";

const DOSSIER = join(import.meta.dirname, "../../src/vue/rail");
const ISSUES = [
  { number: 7, title: "Seven", labels: ["fire", "model:opus", "effort:medium"], createdAt: "2026-11-01T10:00:00Z" },
  { number: 8, title: "Eight", labels: ["fire", "model:opus", "effort:medium"], createdAt: "2026-11-02T10:00:00Z" },
];

test("the rail screen has no button or action that puts an issue in the queue (#4223)", () => {
  const html = htmlDuRail(ISSUES);
  assert.match(html, /Seven/);
  assert.doesNotMatch(html, /<button|<input|<form|\bonclick=|data-(?:geste|action)=/i);
  for (const fichier of readdirSync(DOSSIER).filter((nom) => /\.(?:ts|js|html)$/.test(nom))) {
    assert.doesNotMatch(readFileSync(join(DOSSIER, fichier), "utf8"), /<button|addEventListener\(\s*["']click|put (?:it |them )?on the rail|mettre sur le rail/i, fichier);
  }
});
