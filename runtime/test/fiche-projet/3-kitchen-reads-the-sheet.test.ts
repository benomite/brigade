// #4237, critère 3 : changer un item de la fiche (served = une autre branche, une étape humaine de plus) change ce
// qu'utilisent le cook, la passe, le servi et l'avis du chef, sans changer le code.
// Test d'acceptation : `faitsDeLaCuisine(dossier)` est la lecture que font ces quatre étapes, depuis la fiche seule.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerFiche, faitsDeLaCuisine } from "../../src/fiche-projet/index.ts";

test("changing served and humans in the sheet changes what the four steps use", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "fiche-projet-"));
  await creerFiche(dossier, { branchePrincipale: "main" });
  const avant = await faitsDeLaCuisine(dossier);
  assert.match(JSON.stringify(avant.servi), /main/);

  const chemin = join(dossier, ".brigade", "fiche-projet.json");
  const fiche = JSON.parse(readFileSync(chemin, "utf8"));
  fiche.served = Array.isArray(fiche.served) ? ["release-2"] : typeof fiche.served === "string" ? "release-2" : { ...fiche.served, branch: "release-2" };
  fiche.humans = [...fiche.humans, "the treasurer"];
  fiche.rules = [...fiche.rules, "no broken link"];
  fiche.work = "an episode";
  writeFileSync(chemin, JSON.stringify(fiche));

  const apres = await faitsDeLaCuisine(dossier);
  assert.match(JSON.stringify(apres.servi), /release-2/, "the served step follows the sheet");
  assert.doesNotMatch(JSON.stringify(apres.servi), /main/);
  assert.match(JSON.stringify(apres.avisDuChef), /the treasurer/, "the chef-opinion step follows the sheet");
  assert.match(JSON.stringify(apres.passe), /no broken link/, "the pass follows the sheet");
  assert.match(JSON.stringify(apres.cook), /an episode/, "the cook follows the sheet");
});
