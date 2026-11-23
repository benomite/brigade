// #4064, critère 5 : chaque lien du site vers le dépôt se résout : un chemin qui existe, ou un motif d'URL de release connu.
// Test d'acceptation gelé (#3725) : lecture de site/ ; les chemins sont cherchés dans le dépôt.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const SITE = join(RACINE, "site");
const fichiers = readdirSync(SITE, { recursive: true, encoding: "utf8" }).filter((f) => /\.(html|txt|xml|js)$/.test(f));
const lire = (f: string) => readFileSync(join(SITE, f), "utf8");
const urlsDepot = (texte: string) => [...texte.matchAll(/https:\/\/github\.com\/benomite\/brigade[^\s"'<>)\]]*/g)].map((m) => m[0]);

const BASE = "https://github.com/benomite/brigade";
const MOTIFS_DE_RELEASE = [/^\/releases\/latest$/, /^\/releases\/tag\/app-v\d+\.\d+\.\d+$/, /^\/releases\/download\/station\/[\w.-]+$/];
const AUTRES = [/^$/, /^\/discussions$/, /^\/issues$/, /^\/issues\/new\/choose$/];

test("every repository URL in site/ is an existing path or a known release pattern", () => {
  let vus = 0;
  for (const f of fichiers) {
    for (const url of urlsDepot(lire(f))) {
      vus++;
      const chemin = url.slice(BASE.length).replace(/[#?].*$/, "").replace(/\/$/, "");
      const fichier = chemin.match(/^\/(?:blob|tree)\/main\/(.+)$/);
      if (fichier) assert.ok(existsSync(join(RACINE, fichier[1])), `${f}: ${url} does not exist`);
      else assert.ok([...MOTIFS_DE_RELEASE, ...AUTRES].some((m) => m.test(chemin)), `${f}: ${url} matches no known pattern`);
    }
  }
  assert.ok(vus > 0);
});

test("the install guide link resolves and the page no longer sends the reader to the bare list", () => {
  assert.ok(existsSync(join(RACINE, "docs/installation.md")));
  assert.match(lire("index.html"), /blob\/main\/docs\/installation\.md/);
  assert.doesNotMatch(lire("index.html"), /brigade\/releases["#?]/);
});
