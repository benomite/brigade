// #4237, critère 2 : une fiche à laquelle il manque un item, ou dont un item a un mauvais type, est refusée par le
// chargeur avec une erreur claire qui nomme l'item.
// Test d'acceptation : `chargerFiche(dossier)` lit `.brigade/fiche-projet.json`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chargerFiche, creerFiche } from "../../src/fiche-projet/index.ts";

async function ficheAbimee(abimer: (fiche: Record<string, unknown>) => void): Promise<string> {
  const dossier = mkdtempSync(join(tmpdir(), "fiche-projet-"));
  await creerFiche(dossier, { branchePrincipale: "main" });
  const chemin = join(dossier, ".brigade", "fiche-projet.json");
  const fiche = JSON.parse((await import("node:fs")).readFileSync(chemin, "utf8"));
  abimer(fiche);
  mkdirSync(join(dossier, ".brigade"), { recursive: true });
  writeFileSync(chemin, JSON.stringify(fiche));
  return dossier;
}

const refus = async (dossier: string): Promise<string> => {
  try {
    await chargerFiche(dossier);
  } catch (erreur) {
    return (erreur as Error).message;
  }
  assert.fail("the loader accepted an invalid sheet");
};

test("a sheet missing an item is refused, the error names the item", async () => {
  const message = await refus(await ficheAbimee((f) => delete f.recurring));
  assert.match(message, /recurring/);
});

test("a sheet with a wrong type is refused, the error names the item", async () => {
  const message = await refus(await ficheAbimee((f) => (f.humans = "the chef")));
  assert.match(message, /humans/);
});
