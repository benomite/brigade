// La section « Identity » de la page d'une station (ticket 2642) : nom, machine, cœurs, version et mise à jour, chaque
// ligne avec la marque de son niveau ; sur cet ordinateur la mise à jour se fait d'ici, sur une autre station rien ne se règle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { levelOf } from "../../../src/vue/levels.js";
import { A_DAY, UNKNOWN, PUT_A_DAY, setSection } from "../../../src/vue/station/page/sections/identity.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const context = (here: boolean, identity: object) => ({ station: { id: "gist-mac", nom: "mac/claude" }, ici: here, lectureSeule: !here, niveau: (key: string) => levelOf(doc, key), identite: identity });
// Une rangée de réglage (ticket 2920) : son nom et la marque de son niveau, sa valeur, son contrôle.
const lines = (root: Fake) =>
  root.children.map((line) => {
    const brand = line.children[0]?.children[0];
    return { nom: line.children[0]?.textContent.replace(brand?.textContent ?? "", ""), niveau: brand?.dataset.niveau, marque: brand?.textContent, valeur: line.children[1]?.textContent };
  });
const buttons = (root: Fake) => root.children.flatMap((line) => line.children[2]?.children ?? []);

const EN_DELAY = { machine: "MacBook Pro", coeurs: 10, version: "1.4.0", enRetard: true, derniere: "1.5.0" };

describe("la section identité de la page d'une station", () => {
  test("cet ordinateur : nom, machine, cœurs, version et mise à jour, chacun avec son niveau, et le geste de mise à jour", () => {
    let put = 0;
    const root = setSection(doc, context(true, { ...EN_DELAY, mettreAJour: () => put++ })) as Fake;
    assert.deepEqual(lines(root), [
      { nom: "name", niveau: "machine", marque: "this computer", valeur: "mac/claude" },
      { nom: "machine", niveau: "machine", marque: "this computer", valeur: "MacBook Pro" },
      { nom: "cores", niveau: "machine", marque: "this computer", valeur: "10" },
      { nom: "version", niveau: "machine", marque: "this computer", valeur: "1.4.0" },
      { nom: "updates", niveau: "machine", marque: "this computer", valeur: "behind — 1.5.0 is out" },
    ]);
    const [action] = buttons(root);
    assert.equal(action?.children[0]?.textContent, PUT_A_DAY);
    assert.equal(action?.children[0]?.className, "recommande");
    action?.children[0]?.click();
    assert.equal(put, 1);
    // Le nom, la machine, les cœurs et la version se lisent seulement : leurs rangées n'ont pas de contrôle, ni de PR.
    assert.deepEqual(root.children.map((line) => line.children[2]?.children.length), [0, 0, 0, 0, 1]);
    assert.ok([...root.descendants()].every((n) => n.className !== "par-pr"));
  });

  test("cet ordinateur à jour : la ligne le dit, aucun bouton", () => {
    const root = setSection(doc, context(true, { ...EN_DELAY, enRetard: false, mettreAJour: () => {} })) as Fake;
    assert.equal(lines(root)[4]?.valeur, A_DAY);
    assert.equal(buttons(root).length, 0);
  });

  test("une autre station : les mêmes lignes et leurs niveaux, en lecture seule — jamais un bouton, même en retard", () => {
    const root = setSection(doc, context(false, { ...EN_DELAY, mettreAJour: () => assert.fail("rien ne se règle d'ici") })) as Fake;
    assert.equal(lines(root).length, 5);
    assert.ok(lines(root).every(({ niveau: level }) => level === "machine"));
    assert.equal(lines(root)[4]?.valeur, "behind — 1.5.0 is out");
    // À la place du bouton, la note « sur place » (ticket 2646) : jamais un bouton.
    assert.deepEqual(buttons(root).map(({ className }) => className), ["note-sur-place"]);
    assert.equal([...root.descendants()].filter(({ balise }) => balise === "button").length, 0);
  });

  test("ce que la station n'a pas dit se dit « unknown », jamais une case vide", () => {
    const root = setSection(doc, context(false, {})) as Fake;
    assert.deepEqual(lines(root).map(({ valeur: value }) => value), ["mac/claude", UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN]);
  });
});
