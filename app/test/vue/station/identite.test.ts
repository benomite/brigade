// La section « Identity » de la page d'une station (ticket 2642) : nom, machine, cœurs, version et mise à jour, chaque
// ligne avec la marque de son niveau ; sur cet ordinateur la mise à jour se fait d'ici, sur une autre station rien ne se règle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { niveauDe } from "../../../src/vue/niveaux.js";
import { A_JOUR, INCONNU, METTRE_A_JOUR, poserSection } from "../../../src/vue/station/page/sections/identite.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const contexte = (ici: boolean, identite: object) => ({ station: { id: "gist-mac", nom: "mac/claude" }, ici, lectureSeule: !ici, niveau: (cle: string) => niveauDe(doc, cle), identite });
const lignes = (racine: Faux) => racine.children.map((ligne) => ({ nom: ligne.children[0]?.textContent, niveau: ligne.children[1]?.dataset.niveau, marque: ligne.children[1]?.textContent, valeur: ligne.children[2]?.textContent }));
const boutons = (racine: Faux) => racine.children.flatMap((ligne) => ligne.children.slice(3));

const EN_RETARD = { machine: "MacBook Pro", coeurs: 10, version: "1.4.0", enRetard: true, derniere: "1.5.0" };

describe("la section identité de la page d'une station", () => {
  test("cet ordinateur : nom, machine, cœurs, version et mise à jour, chacun avec son niveau, et le geste de mise à jour", () => {
    let mises = 0;
    const racine = poserSection(doc, contexte(true, { ...EN_RETARD, mettreAJour: () => mises++ })) as Faux;
    assert.deepEqual(lignes(racine), [
      { nom: "name", niveau: "machine", marque: "this machine", valeur: "mac/claude" },
      { nom: "machine", niveau: "machine", marque: "this machine", valeur: "MacBook Pro" },
      { nom: "cores", niveau: "machine", marque: "this machine", valeur: "10" },
      { nom: "version", niveau: "machine", marque: "this machine", valeur: "1.4.0" },
      { nom: "updates", niveau: "machine", marque: "this machine", valeur: "behind — 1.5.0 is out" },
    ]);
    const [action] = boutons(racine);
    assert.equal(action?.children[0]?.textContent, METTRE_A_JOUR);
    assert.equal(action?.children[0]?.className, "recommande");
    action?.children[0]?.click();
    assert.equal(mises, 1);
  });

  test("cet ordinateur à jour : la ligne le dit, aucun bouton", () => {
    const racine = poserSection(doc, contexte(true, { ...EN_RETARD, enRetard: false, mettreAJour: () => {} })) as Faux;
    assert.equal(lignes(racine)[4]?.valeur, A_JOUR);
    assert.equal(boutons(racine).length, 0);
  });

  test("une autre station : les mêmes lignes et leurs niveaux, en lecture seule — jamais un bouton, même en retard", () => {
    const racine = poserSection(doc, contexte(false, { ...EN_RETARD, mettreAJour: () => assert.fail("rien ne se règle d'ici") })) as Faux;
    assert.equal(lignes(racine).length, 5);
    assert.ok(lignes(racine).every(({ niveau }) => niveau === "machine"));
    assert.equal(lignes(racine)[4]?.valeur, "behind — 1.5.0 is out");
    // À la place du bouton, la note « sur place » (ticket 2646) : jamais un bouton.
    assert.deepEqual(boutons(racine).map(({ className }) => className), ["note-sur-place"]);
    assert.equal(racine.descendants().filter(({ balise }) => balise === "button").length, 0);
  });

  test("ce que la station n'a pas dit se dit « unknown », jamais une case vide", () => {
    const racine = poserSection(doc, contexte(false, {})) as Faux;
    assert.deepEqual(lignes(racine).map(({ valeur }) => valeur), ["mac/claude", INCONNU, INCONNU, INCONNU, INCONNU]);
  });
});
