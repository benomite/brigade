// Le workflow `pages` (#2872) publie `site/` et rien d'autre : le chemin envoyé à GitHub Pages est `site`.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

// GEO (#3101): what an AI assistant reads of the built site (`site/` is the artifact).
const SITE = join(import.meta.dirname, "../../site");
const BASE = "https://benomite.github.io/brigade/";
const DEFINITION = "Brigade is a free, open-source app that runs Claude Code agents on your GitHub issues: they open, review and merge pull requests and ask you only for product decisions.";
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));
const urlOf = (f: string) => (f === "index.html" ? BASE : BASE + f);

test("every HTML page has a canonical link to its own URL", () => {
  for (const f of pages) {
    const m = readFileSync(join(SITE, f), "utf8").match(/<link rel="canonical" href="([^"]+)">/);
    assert.equal(m?.[1], urlOf(f), f);
  }
});

test("sitemap.xml lists every HTML page, and only them", () => {
  const locs = [...readFileSync(join(SITE, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, pages.map(urlOf).sort());
});

test("the home page defines Brigade in plain words in its first screen and its meta description", () => {
  const home = readFileSync(join(SITE, "index.html"), "utf8");
  assert.ok(home.includes(`<strong>${DEFINITION}</strong>`));
  assert.ok(home.indexOf(DEFINITION) < home.indexOf('class="rail"'));
  assert.match(home, new RegExp(`<meta name="description" content="${DEFINITION}`));
});

test("llms.txt starts with the definition and links only under the site or the repository", () => {
  const txt = readFileSync(join(SITE, "llms.txt"), "utf8");
  assert.ok(txt.split("\n")[2]?.includes(DEFINITION));
  const urls = [...txt.matchAll(/\]\((\S+?)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6);
  for (const u of urls) assert.match(u!, /^https:\/\/(benomite\.github\.io\/brigade\/|github\.com\/benomite\/brigade)/);
});

test("the home page has og:image, twitter:image and a valid SoftwareApplication JSON-LD", () => {
  const home = readFileSync(join(SITE, "index.html"), "utf8");
  for (const p of ["property=\"og:image\"", "name=\"twitter:image\""]) {
    const m = home.match(new RegExp(`<meta ${p} content="([^"]+)">`));
    assert.ok(m![1]!.startsWith(BASE));
    assert.ok(existsSync(join(SITE, m![1]!.slice(BASE.length))));
  }
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
  assert.equal(ld["@type"], "SoftwareApplication");
  assert.equal(ld.offers.price, "0");
  for (const k of ["name", "description", "license", "downloadUrl", "codeRepository"]) assert.ok(ld[k], k);
});

test("the FAQ page answers the six questions", () => {
  const faq = readFileSync(join(SITE, "faq.html"), "utf8");
  assert.equal([...faq.matchAll(/<h2>[^<]+\?<\/h2>\s*<p>/g)].length, 6);
});

// The waiting list for cloud stations (#3271): the home page only points to the chef's Tally form, nothing on the site collects an email.
test("the home page has a cloud-stations section that reaches the Tally form and says signing up is free, with no commitment", () => {
  const html = readFileSync(join(SITE, "index.html"), "utf8");
  const section = html.match(/<section id="cloud">([\s\S]*?)<\/section>/)?.[1] ?? "";
  assert.match(section, /coming later[^<]*keeps cooking when your computer sleeps/);
  assert.match(section, /<a [^>]*href="https:\/\/tally\.so\/r\/BEdbJK"/);
  assert.match(section, /free and carries no commitment/);
  assert.doesNotMatch(html, /<form|data-endpoint|waitlist\.js/);
});
