// #4062, critère 1 : aucun lien de docs/installation.md et docs/index.md n'est cassé (chaque chemin cible existe dans le dépôt).
// Test d'acceptation : lit les deux fichiers et vérifie les liens relatifs, ancres de titres comprises.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FICHIERS = ["docs/installation.md", "docs/index.md"];

const ancre = (titre: string): string =>
  titre.trim().toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

// brigade:guard
test("every link of the install page and of the docs index points to a path that exists", () => {
  for (const fichier of FICHIERS) {
    const texte = readFileSync(resolve(RACINE, fichier), "utf8");
    const liens = [...texte.matchAll(/\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1] ?? "");
    assert.ok(liens.length > 0, `${fichier} has no link`);
    for (const lien of liens) {
      if (/^(https?:|mailto:)/.test(lien)) continue;
      const [chemin = "", fragment] = lien.split("#");
      const cible = chemin ? resolve(RACINE, dirname(fichier), chemin) : resolve(RACINE, fichier);
      assert.ok(existsSync(cible), `${fichier}: broken link to ${lien}`);
      if (fragment && cible.endsWith(".md")) {
        const titres = readFileSync(cible, "utf8").split("\n").filter((l) => /^#{1,6}\s/.test(l)).map((l) => ancre(l.replace(/^#+\s/, "")));
        assert.ok(titres.includes(fragment), `${fichier}: no heading for the anchor in ${lien}`);
      }
    }
  }
});
