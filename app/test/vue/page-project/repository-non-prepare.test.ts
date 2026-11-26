// L'avis d'un projet pas préparé pour Brigade (#2628) : préparé, pas préparé, en route, raté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apresLaRead, EN_ROUTE, INCONNU, phraseDuRefusal, poserOpinionDeRepository, PREPARER, REESSAYER, type State } from "../../../src/vue/page-project/repository-non-prepare.js";
import { poserOpinionDuTodo } from "../../../src/vue/todo/opinion-todo.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const verif = { ready: false, missingBindings: ["Gates", "Worktrees"], missingLabels: ["fire"] };

const boutons = (n: Faux): Faux[] => (n.balise === "button" && n.dataset.geste !== undefined ? [n] : n.children.flatMap(boutons));
const texte = (n: Faux) => n.textContent ?? "";

describe("l'avis de dépôt", () => {
  test("préparé ou pas encore lu : rien", () => {
    assert.equal(poserOpinionDeRepository(doc, "page", apresLaRead({ ready: true, missingBindings: [], missingLabels: [] }), () => {}), undefined);
    assert.equal(poserOpinionDeRepository(doc, "page", INCONNU, () => {}), undefined);
  });

  for (const lieu of ["page", "todo"] as const) {
    test(`pas préparé, ${lieu} : la phrase de ce qui manque et un seul bouton`, () => {
      let clics = 0;
      const state = apresLaRead(verif);
      const opinion = (lieu === "page" ? poserOpinionDeRepository(doc, "page", state, () => clics++) : poserOpinionDuTodo(doc, state, () => clics++)) ?? assert.fail("pas d'avis");
      assert.equal(opinion.dataset.lieu, lieu);
      assert.match(texte(opinion), /Not set up for Brigade: 2 bindings and 1 label missing\./);
      assert.doesNotMatch(texte(opinion), /brigade:init/);
      const [button, ...autres] = boutons(opinion);
      assert.equal(autres.length, 0);
      assert.equal(button?.textContent, PREPARER);
      button?.click();
      assert.equal(clics, 1);
    });
  }

  test("en route : le bouton attend, la ligne le dit", () => {
    const opinion = poserOpinionDeRepository(doc, "page", { etape: "en-route", verif }, () => {}) ?? assert.fail("pas d'avis");
    assert.equal(boutons(opinion)[0]?.disabled, true);
    assert.match(texte(opinion), new RegExp(EN_ROUTE));
  });

  test("raté : une phrase et « Retry »", () => {
    const state: State = { etape: "refus", verif, dit: phraseDuRefusal(new Error("GitHub refused the labels.\nstack…")) };
    const opinion = poserOpinionDeRepository(doc, "page", state, () => {}) ?? assert.fail("pas d'avis");
    assert.match(texte(opinion), /GitHub refused the labels\./);
    assert.doesNotMatch(texte(opinion), /stack/);
    assert.equal(boutons(opinion)[0]?.textContent, REESSAYER);
    assert.equal(boutons(opinion)[0]?.disabled, false);
  });

  test("un refus sans phrase en dit une", () => {
    assert.equal(phraseDuRefusal(undefined), "The setup failed.");
  });
});
