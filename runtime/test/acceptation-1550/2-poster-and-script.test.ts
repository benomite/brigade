// #1550, critère 2 : docs/demo/ contient aussi une affiche (png) tirée de la vidéo et un README.md avec le script
// (ce que montre chaque plan, avec horodatages) et le lien vers l'issue et la PR réelles utilisées.
// Test d'acceptation : lit les fichiers commités de docs/demo/.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DEMO = new URL("../../../docs/demo/", import.meta.url);

test("docs/demo/ holds a png poster", () => {
  const affiches = readdirSync(DEMO).filter((nom) => nom.endsWith(".png"));
  assert.ok(affiches.length >= 1, "no .png in docs/demo/");
  for (const nom of affiches) {
    const signature = readFileSync(new URL(nom, DEMO)).subarray(0, 8).toString("hex");
    assert.equal(signature, "89504e470d0a1a0a", `${nom} is not a png`);
  }
});

test("docs/demo/README.md scripts the shots with timestamps and links the real issue and PR", () => {
  const readme = readFileSync(new URL("README.md", DEMO), "utf8");
  const horodatages = readme.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  assert.ok(horodatages.length >= 5, "expected a timestamp for each of the five shots");
  for (const plan of [/issue/i, /rail/i, /cook/i, /pass/i, /merge/i]) assert.match(readme, plan);
  assert.match(readme, /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+/, "no link to the issue");
  assert.match(readme, /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/, "no link to the PR");
});
