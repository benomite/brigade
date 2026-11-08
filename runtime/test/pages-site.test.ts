// Le workflow `pages` (#2872) publie `site/` et rien d'autre : le chemin envoyé à GitHub Pages est `site`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const WORKFLOW = readFileSync(join(import.meta.dirname, "../../.github/workflows/pages.yml"), "utf8");

test("the pages workflow uploads site/ and nothing else", () => {
  const uploads = [...WORKFLOW.matchAll(/uses: actions\/upload-pages-artifact@\S+\n\s+with:\n\s+path: (\S+)/g)];
  assert.deepEqual(uploads.map((u) => u[1]), ["site"]);
});

test("the pages workflow deploys with the official action and copies nothing into the artifact", () => {
  assert.match(WORKFLOW, /uses: actions\/deploy-pages@v\d+/);
  assert.doesNotMatch(WORKFLOW, /^\s*(run:.*\bcp\b|.*docs\/demo)/m);
});

test("a push to main touches the workflow only for site/ or the workflow itself", () => {
  assert.match(WORKFLOW, /push:\n\s+branches: \[main\]\n\s+paths: \[site\/\*\*, \.github\/workflows\/pages\.yml\]/);
});
