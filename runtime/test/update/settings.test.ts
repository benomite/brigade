// Les réglages de mise à jour de la station : le gel, et ce qui ne se lit pas.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lireReglages } from "../../src/update/settings.ts";
import { repertoireTemporaire } from "../outils.ts";

test("sans fichier de réglages, rien n'est gelé", (t) => {
  assert.deepEqual(lireReglages(repertoireTemporaire(t)), { gel: false, problemes: [] });
});

test("gel=oui gèle, gel=non dégèle ; les commentaires et les lignes vides ne comptent pas", (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, "reglages"), "# la box ne bouge pas\n\ngel = oui\n");
  assert.deepEqual(lireReglages(racine), { gel: true, problemes: [] });
  writeFileSync(join(racine, "reglages"), "gel=non\n");
  assert.deepEqual(lireReglages(racine), { gel: false, problemes: [] });
});

test("un gel mal écrit, ou un fichier illisible, gèle dans le doute, et le dit ; un réglage inconnu est dit sans rien changer", (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, "reglages"), "gel=bientôt\nvitesse=max\n");
  assert.deepEqual(lireReglages(racine), {
    gel: true,
    problemes: ["ligne 1 des réglages : gel=bientôt — attendu oui ou non ; dans le doute, la version reste gelée", "ligne 2 des réglages : « vitesse » n'est pas un réglage connu (gel)"],
  });
  const autre = repertoireTemporaire(t);
  mkdirSync(join(autre, "reglages"));
  const lu = lireReglages(autre);
  assert.equal(lu.gel, true);
  assert.match(lu.problemes[0] ?? "", /^réglages illisibles .* ; dans le doute, la version reste gelée$/);
});
