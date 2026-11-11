// The public autonomy page (#3220): it renders what site/autonomie.json holds and computes nothing.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const PR = "https://github.com/benomite/brigade/pulls?q=is%3Apr+is%3Amerged";

function charger() {
  const g: Record<string, any> = {};
  new Function("globalThis", read("site/autonomie.js"))(g);
  return g.autonomie as { rows(d: unknown): any[] | null; render(doc: any, d: unknown): boolean };
}
const fig = (value: string) => ({ value, computedAt: "2026-11-11", url: PR });
const DONNEES = { figures: { servedWithoutHuman: fig("a"), medianLeadTime: fig("b"), sendBackRate: fig("c"), mergedPullRequests: fig("d") } };

function faussDoc() {
  const els: Record<string, any> = {};
  const mk = (): any => ({ children: [], hidden: true, appendChild(c: any) { this.children.push(c); } });
  els["autonomy-figures"] = mk();
  els["autonomy-status"] = { hidden: false };
  return { els, getElementById: (i: string) => els[i], createElement: mk };
}

test("the page shows the four figures as given, each a link to its pull request list with its date", () => {
  const doc = faussDoc();
  assert.equal(charger().render(doc, DONNEES), true);
  const lignes = doc.els["autonomy-figures"].children;
  assert.equal(lignes.length, 4);
  assert.equal(lignes[0].children[1].children[0].href, PR);
  assert.equal(lignes[0].children[1].children[0].textContent, "a");
  assert.match(lignes[0].children[0].textContent, /2026-11-11/);
  assert.equal(doc.els["autonomy-figures"].hidden, false);
  assert.equal(doc.els["autonomy-status"].hidden, true);
});

test("a missing, partial or foreign-linked file shows nothing and keeps 'not yet available'", () => {
  const a = charger();
  const partiel = { figures: { ...DONNEES.figures, sendBackRate: undefined } };
  const etranger = { figures: { ...DONNEES.figures, medianLeadTime: { ...fig("b"), url: "https://example.com/x" } } };
  for (const d of [null, {}, partiel, etranger]) {
    const doc = faussDoc();
    assert.equal(a.render(doc, d), false);
    assert.equal(doc.els["autonomy-status"].hidden, false);
    assert.equal(doc.els["autonomy-figures"].children.length, 0);
  }
});

test("the README opens with the link to the published page", () => {
  const debut = read("README.md").split("\n").slice(0, 12).join("\n");
  assert.ok(debut.includes("https://benomite.github.io/brigade/autonomie.html"));
});

test("an absent or invalid autonomie.json leaves the page on 'Figures not yet available'", () => {
  assert.match(read("site/autonomie.html"), /<p id="autonomy-status"[^>]*>Figures not yet available\.<\/p>\s*<div[^>]*id="autonomy-figures" hidden>/);
  const a = charger();
  for (const d of [undefined, null, "x", [], { figures: "x" }, { figures: { ...DONNEES.figures, sendBackRate: { value: "c", computedAt: "2026-11-11" } } }]) {
    const doc = faussDoc();
    assert.equal(a.render(doc, d), false);
    assert.equal(doc.els["autonomy-status"].hidden, false);
  }
});

test("pages.yml is the only deploy path: daily, on demand, one generator step before the single upload of site/", () => {
  const w = read(".github/workflows/pages.yml");
  assert.match(w, /schedule:\n\s+- cron: "\d+ \d+ \* \* \*"/);
  assert.match(w, /workflow_dispatch:/);
  assert.ok(w.indexOf("replace with #3213 generator") < w.indexOf("actions/upload-pages-artifact"));
  assert.equal(existsSync(join(ROOT, ".github/workflows/autonomie.yml")), false);
});
