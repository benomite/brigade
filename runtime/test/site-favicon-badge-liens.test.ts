// #3779: opening the site locally shows the new favicon and the new badge, with no broken image link.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

const SITE = join(import.meta.dirname, "../../site");
const pages = [...readdirSync(SITE).filter((f) => f.endsWith(".html")), "cooked-by-brigade/index.html", ...readdirSync(join(SITE, "stories")).filter((f) => f.endsWith(".html")).map((f) => `stories/${f}`)];
const local = (u: string) => !/^(https?:|data:|#|\/\/|mailto:)/.test(u);
const copper = (path: string) => /#ffd2b0/i.test(readFileSync(path, "utf8")) && /#5a200a/i.test(readFileSync(path, "utf8"));

test("every page's favicon link resolves to the new copper favicon", () => {
  for (const p of pages) {
    const html = readFileSync(join(SITE, p), "utf8");
    const href = html.match(/<link rel="icon" href="([^"]+)"/)?.[1];
    assert.ok(href, `${p}: icon link`);
    const file = join(SITE, dirname(p), href.split(/[?#]/)[0]);
    assert.ok(existsSync(file), `${p}: ${href} exists`);
    assert.ok(copper(file), `${p}: ${href} is the new copper mark`);
  }
});

test("no page has a broken local image, and the badges keep their names and are copper", () => {
  for (const p of pages) {
    const html = readFileSync(join(SITE, p), "utf8");
    for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
      if (local(m[1])) assert.ok(existsSync(join(SITE, dirname(p), m[1].split(/[?#]/)[0])), `${p}: ${m[1]}`);
    }
  }
  for (const f of ["badge-cooked-by-brigade-clair.svg", "badge-cooked-by-brigade-sombre.svg"]) {
    assert.ok(existsSync(join(SITE, f)), f);
    assert.ok(copper(join(SITE, f)), `${f} is the new copper badge`);
  }
});
