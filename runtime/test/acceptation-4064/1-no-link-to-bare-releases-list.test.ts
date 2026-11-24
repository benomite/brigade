// #4064, critère 1 : aucun lien de téléchargement du site ne pointe vers la liste nue /releases.
// Test d'acceptation gelé (#3725) : lecture des fichiers de site/.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const SITE = join(RACINE, "site");
const fichiers = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((f) => /\.(html|txt|xml|js)$/.test(f));
const lire = (f: string) => readFileSync(join(SITE, f), "utf8");
const urlsDepot = (texte: string) => [...texte.matchAll(/https:\/\/github\.com\/benomite\/brigade[^\s"'<>)\]]*/g)].map((m) => m[0]);

test("no URL in site/ is the bare releases list", () => {
  for (const f of fichiers) {
    for (const url of urlsDepot(lire(f))) {
      assert.doesNotMatch(url, /\/releases\/?(?:[#?].*)?$/, `${f}: ${url}`);
    }
  }
});

test("the download buttons and the structured downloadUrl are not the bare list", () => {
  const index = lire("index.html");
  const boutons = [...index.matchAll(/<a[^>]*id="download-[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(boutons.length >= 2);
  for (const b of boutons) assert.doesNotMatch(b, /href="[^"]*\/releases\/?"/);
  assert.doesNotMatch(index, /"downloadUrl":\s*"[^"]*\/releases\/?"/);
});
