// #4064, critère 3 : le site dit que l'app n'est pas signée et renvoie vers docs/installation.md pour l'ouvrir.
// Test d'acceptation gelé (#3725) : lecture de site/index.html.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const SITE = join(RACINE, "site");
const fichiers = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((f) => /\.(html|txt|xml|js)$/.test(f));
const lire = (f: string) => readFileSync(join(SITE, f), "utf8");
const urlsDepot = (texte: string) => [...texte.matchAll(/https:\/\/github\.com\/benomite\/brigade[^\s"'<>)\]]*/g)].map((m) => m[0]);

const index = lire("index.html");
const corps = index.replace(/<script[\s\S]*?<\/script>/g, "");

test("the install text says the app is unsigned and that Mac and Windows refuse it first", () => {
  assert.match(corps, /unsigned/i);
  assert.match(corps, /\bMac\b/);
  assert.match(corps, /\bWindows\b/);
  assert.match(corps, /refuse|warn|block/i);
});

test("the unsigned warning points to docs/installation.md", () => {
  const section = corps.slice(corps.search(/<h2>Install Brigade/));
  const avertissement = section.search(/unsigned/i);
  assert.ok(avertissement >= 0, "the install section says the app is unsigned");
  assert.match(section, /href="https:\/\/github\.com\/benomite\/brigade\/blob\/main\/docs\/installation\.md[^"]*"/);
  assert.ok(existsSync(join(RACINE, "docs/installation.md")));
});
