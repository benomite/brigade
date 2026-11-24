// Acceptance test (#4087). Criterion 6: the "try on a demo project" entry (#3734) no longer appears in the app; no code in
// app/src creates the demo repository, and no test still expects it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const APP = join(import.meta.dirname, "../..");
const fichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)]));
const contenant = (dossier: string, motif: RegExp, sauf: string[] = []) =>
  fichiers(join(APP, dossier)).filter((f) => !sauf.includes(f) && motif.test(readFileSync(f, "utf8"))).map((f) => f.slice(APP.length + 1));
const DEMO = /try on a demo project|projet-de-demo|projetDEssai|pagesDeLaDemo|ajout-ou-demo/i;

test("app/src has no 'try on a demo project' entry and no code that creates the demo repository", () => {
  assert.deepEqual(contenant("src", DEMO), []);
  assert.deepEqual(fichiers(join(APP, "src")).filter((f) => /\/demo\//.test(f)), [], "the src/vue/demo folder is gone");
});

test("no test still expects the demo project", () => {
  assert.deepEqual(contenant("test", DEMO, [import.meta.filename]), []);
  assert.deepEqual(fichiers(join(APP, "test")).filter((f) => /\/demo-[^/]*\.test\.ts$/.test(f)), []);
});
