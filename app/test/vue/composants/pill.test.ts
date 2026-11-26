// La pastille de l'app (vue/composants/pill, ticket 2917) : un seul composant pour les six états d'un ticket — queued,
// taken, in pass, awaiting you, waiting, served —, chacun une forme et une couleur, les mêmes sur tous les écrans. Sa peau
// est dans sa feuille à lui : vue.css ne dessine aucune pastille.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { STATES, stateDuTon, formeDe, marque, pill } from "../../../src/vue/composants/pill/pill.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VUE = join(import.meta.dirname, "../../../src/vue");
const lire = (fichier: string) => readFileSync(join(VUE, fichier), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("la pastille", () => {
  test("six états, chacun sa forme et son ton, aucun ne partage ni l'une ni l'autre", () => {
    assert.deepEqual(STATES, ["queued", "taken", "pass", "awaiting", "waiting", "served"]);
    const vues = STATES.map((state) => {
      const cree = pill(doc, state, state) as Faux;
      assert.equal(cree.dataset.pastille, state);
      const point = cree.children[0] as Faux;
      assert.equal(point.className, "pastille");
      assert.equal((cree.children[1] as Faux).textContent, state);
      return `${point.dataset.ton}|${point.dataset.forme}`;
    });
    assert.deepEqual(vues, ["gris|anneau", "bleu|triangle", "jaune|losange", "rouge|carre", "orange|pause", "vert|disque"]);
    assert.equal(new Set(vues).size, 6);
  });

  test("l'état d'un ton est celui de la colonne de ce ton ; un ton inconnu n'a pas d'état et garde un marqueur vide", () => {
    assert.deepEqual(["gris", "bleu", "jaune", "rouge", "orange", "vert"].map(stateDuTon), [...STATES]);
    assert.equal(stateDuTon("violet"), undefined);
    assert.equal(stateDuTon(undefined), undefined);
    const nue = pill(doc, undefined, "86") as Faux;
    assert.equal(nue.dataset.pastille, undefined);
    assert.equal(nue.className, "pilule");
    assert.deepEqual((nue.children[0] as Faux).dataset, {});
  });

  test("le marqueur seul : ton et forme, au coin d'une case s'il le faut", () => {
    const point = marque(doc, "rouge", { coin: true }) as Faux;
    assert.deepEqual(point.dataset, { ton: "rouge", forme: formeDe("rouge"), pose: "coin" });
  });
});

describe("la feuille de la pastille", () => {
  test("vue.css ne dessine aucune pastille ni pilule, ni le mot d'état d'un ticket", () => {
    const peau = lire("vue.css");
    const regles = [...peau.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, tete = ""]) => /\.pastille\b|\.pilule\b|\.etat-ticket|data-pastille|data-forme/.test(tete.replace(/:not\(\.pastille\)/g, "").replace(/:has\(\.pastille\[data-forme="anneau"\]\) strong/g, "")));
    assert.deepEqual(regles.map(([, tete]) => tete?.trim()), []);
  });

  test("la page charge la feuille de la pastille avant la peau", () => {
    const page = readFileSync(join(VUE, "index.html"), "utf8");
    const feuille = page.indexOf('href="composants/pill/pill.css"');
    assert.ok(feuille > 0 && feuille < page.indexOf('href="vue.css"'));
  });

  test("la peau lit les états de pill.js : chaque état a son ton", () => {
    const feuille = lire("composants/pill/pill.css");
    for (const state of STATES) assert.match(feuille, new RegExp(`\\[data-pastille="${state}"\\] \\{\\s*--ton:`));
  });
});
