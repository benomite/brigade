// La pastille de l'app (vue/components/pill, ticket 2917) : un seul composant pour les six états d'un ticket — queued,
// taken, in pass, awaiting you, waiting, served —, chacun une forme et une couleur, les mêmes sur tous les écrans. Sa peau
// est dans sa feuille à lui : vue.css ne dessine aucune pastille.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { STATES, stateOfYour, shapeOf, brand, pill } from "../../../src/vue/components/pill/pill.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const read = (file: string) => readFileSync(join(VUE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("la pastille", () => {
  test("six états, chacun sa forme et son ton, aucun ne partage ni l'une ni l'autre", () => {
    assert.deepEqual(STATES, ["queued", "taken", "pass", "awaiting", "waiting", "served"]);
    const views = STATES.map((state) => {
      const created = pill(doc, state, state) as Fake;
      assert.equal(created.dataset.pastille, state);
      const point = created.children[0] as Fake;
      assert.equal(point.className, "pastille");
      assert.equal((created.children[1] as Fake).textContent, state);
      return `${point.dataset.ton}|${point.dataset.forme}`;
    });
    assert.deepEqual(views, ["gris|anneau", "bleu|triangle", "jaune|losange", "rouge|carre", "orange|pause", "vert|disque"]);
    assert.equal(new Set(views).size, 6);
  });

  test("l'état d'un ton est celui de la colonne de ce ton ; un ton inconnu n'a pas d'état et garde un marqueur vide", () => {
    assert.deepEqual(["gris", "bleu", "jaune", "rouge", "orange", "vert"].map(stateOfYour), [...STATES]);
    assert.equal(stateOfYour("violet"), undefined);
    assert.equal(stateOfYour(undefined), undefined);
    const bare = pill(doc, undefined, "86") as Fake;
    assert.equal(bare.dataset.pastille, undefined);
    assert.equal(bare.className, "pilule");
    assert.deepEqual((bare.children[0] as Fake).dataset, {});
  });

  test("le marqueur seul : ton et forme, au coin d'une case s'il le faut", () => {
    const point = brand(doc, "rouge", { coin: true }) as Fake;
    assert.deepEqual(point.dataset, { ton: "rouge", forme: shapeOf("rouge"), pose: "coin" });
  });
});

describe("la feuille de la pastille", () => {
  test("vue.css ne dessine aucune pastille ni pilule, ni le mot d'état d'un ticket", () => {
    const skin = read("vue.css");
    const rules = [...skin.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, head = ""]) => /\.pastille\b|\.pilule\b|\.etat-ticket|data-pastille|data-forme/.test(head.replace(/:not\(\.pastille\)/g, "").replace(/:has\(\.pastille\[data-forme="anneau"\]\) strong/g, "")));
    assert.deepEqual(rules.map(([, head]) => head?.trim()), []);
  });

  test("la page charge la feuille de la pastille avant la peau", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const sheet = page.indexOf('href="components/pill/pill.css"');
    assert.ok(sheet > 0 && sheet < page.indexOf('href="vue.css"'));
  });

  test("la peau lit les états de pill.js : chaque état a son ton", () => {
    const sheet = read("components/pill/pill.css");
    for (const state of STATES) assert.match(sheet, new RegExp(`\\[data-pastille="${state}"\\] \\{\\s*--ton:`));
  });
});
