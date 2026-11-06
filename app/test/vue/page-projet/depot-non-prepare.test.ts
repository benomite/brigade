// L'avis d'un projet pas préparé pour Brigade (#2628) : préparé, pas préparé, en route, raté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apresLaLecture, EN_ROUTE, INCONNU, phraseDuRefus, poserAvisDeDepot, PREPARER, REESSAYER, type Etat } from "../../../src/vue/page-projet/depot-non-prepare.js";
import { poserAvisDuTodo } from "../../../src/vue/todo/avis-todo.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const verif = { ready: false, missingBindings: ["Gates", "Worktrees"], missingLabels: ["fire"] };

const boutons = (n: Faux): Faux[] => (n.balise === "button" && n.dataset.geste !== undefined ? [n] : n.children.flatMap(boutons));
const texte = (n: Faux) => n.textContent ?? "";

describe("l'avis de dépôt", () => {
  test("préparé ou pas encore lu : rien", () => {
    assert.equal(poserAvisDeDepot(doc, "page", apresLaLecture({ ready: true, missingBindings: [], missingLabels: [] }), () => {}), undefined);
    assert.equal(poserAvisDeDepot(doc, "page", INCONNU, () => {}), undefined);
  });

  for (const lieu of ["page", "todo"] as const) {
    test(`pas préparé, ${lieu} : la phrase de ce qui manque et un seul bouton`, () => {
      let clics = 0;
      const etat = apresLaLecture(verif);
      const avis = (lieu === "page" ? poserAvisDeDepot(doc, "page", etat, () => clics++) : poserAvisDuTodo(doc, etat, () => clics++)) ?? assert.fail("pas d'avis");
      assert.equal(avis.dataset.lieu, lieu);
      assert.match(texte(avis), /Not set up for Brigade: 2 bindings and 1 label missing\./);
      assert.doesNotMatch(texte(avis), /brigade:init/);
      const [bouton, ...autres] = boutons(avis);
      assert.equal(autres.length, 0);
      assert.equal(bouton?.textContent, PREPARER);
      bouton?.click();
      assert.equal(clics, 1);
    });
  }

  test("en route : le bouton attend, la ligne le dit", () => {
    const avis = poserAvisDeDepot(doc, "page", { etape: "en-route", verif }, () => {}) ?? assert.fail("pas d'avis");
    assert.equal(boutons(avis)[0]?.disabled, true);
    assert.match(texte(avis), new RegExp(EN_ROUTE));
  });

  test("raté : une phrase et « Retry »", () => {
    const etat: Etat = { etape: "refus", verif, dit: phraseDuRefus(new Error("GitHub refused the labels.\nstack…")) };
    const avis = poserAvisDeDepot(doc, "page", etat, () => {}) ?? assert.fail("pas d'avis");
    assert.match(texte(avis), /GitHub refused the labels\./);
    assert.doesNotMatch(texte(avis), /stack/);
    assert.equal(boutons(avis)[0]?.textContent, REESSAYER);
    assert.equal(boutons(avis)[0]?.disabled, false);
  });

  test("un refus sans phrase en dit une", () => {
    assert.equal(phraseDuRefus(undefined), "The setup failed.");
  });
});
