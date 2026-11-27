// Acceptance test (#4087). Criterion 6: the "try on a demo project" entry (#3734) no longer appears in the app; no code in
// app/src creates the demo repository, and no test still expects it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const APP = join(import.meta.dirname, "../..");
const files = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? files(join(folder, e.name)) : [join(folder, e.name)]));
const containing = (folder: string, motive: RegExp, except: string[] = []) =>
  files(join(APP, folder)).filter((f) => !except.includes(f) && motive.test(readFileSync(f, "utf8"))).map((f) => f.slice(APP.length + 1));
const DEMO = /try on a demo project|projet-de-demo|projetDEssai|pagesDeLaDemo|ajout-ou-demo/i;

test("app/src has no 'try on a demo project' entry and no code that creates the demo repository", () => {
  assert.deepEqual(containing("src", DEMO), []);
  assert.deepEqual(files(join(APP, "src")).filter((f) => /\/demo\//.test(f)), [], "the src/vue/demo folder is gone");
});

test("no test still expects the demo project", () => {
  assert.deepEqual(containing("test", DEMO, [import.meta.filename]), []);
  assert.deepEqual(files(join(APP, "test")).filter((f) => /\/demo-[^/]*\.test\.ts$/.test(f)), []);
});
