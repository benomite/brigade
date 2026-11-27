// L'avis d'un projet pas préparé pour Brigade (#2628) : préparé, pas préparé, en route, raté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { afterTheRead, EN_ROUTE, UNKNOWN, sentenceOfRefusal, setOpinionOfRepository, PREPARE, RETRY, type State } from "../../../src/vue/page-project/repository-not-prepare.js";
import { setOpinionOfTodo } from "../../../src/vue/todo/opinion-todo.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const check = { ready: false, missingBindings: ["Gates", "Worktrees"], missingLabels: ["fire"] };

const buttons = (n: Fake): Fake[] => (n.balise === "button" && n.dataset.geste !== undefined ? [n] : n.children.flatMap(buttons));
const text = (n: Fake) => n.textContent ?? "";

describe("l'avis de dépôt", () => {
  test("préparé ou pas encore lu : rien", () => {
    assert.equal(setOpinionOfRepository(doc, "page", afterTheRead({ ready: true, missingBindings: [], missingLabels: [] }), () => {}), undefined);
    assert.equal(setOpinionOfRepository(doc, "page", UNKNOWN, () => {}), undefined);
  });

  for (const place of ["page", "todo"] as const) {
    test(`pas préparé, ${place} : la phrase de ce qui manque et un seul bouton`, () => {
      let clics = 0;
      const state = afterTheRead(check);
      const opinion = (place === "page" ? setOpinionOfRepository(doc, "page", state, () => clics++) : setOpinionOfTodo(doc, state, () => clics++)) ?? assert.fail("pas d'avis");
      assert.equal(opinion.dataset.lieu, place);
      assert.match(text(opinion), /Not set up for Brigade: 2 bindings and 1 label missing\./);
      assert.doesNotMatch(text(opinion), /brigade:init/);
      const [button, ...others] = buttons(opinion);
      assert.equal(others.length, 0);
      assert.equal(button?.textContent, PREPARE);
      button?.click();
      assert.equal(clics, 1);
    });
  }

  test("en route : le bouton attend, la ligne le dit", () => {
    const opinion = setOpinionOfRepository(doc, "page", { etape: "en-route", verif: check }, () => {}) ?? assert.fail("pas d'avis");
    assert.equal(buttons(opinion)[0]?.disabled, true);
    assert.match(text(opinion), new RegExp(EN_ROUTE));
  });

  test("raté : une phrase et « Retry »", () => {
    const state: State = { etape: "refus", verif: check, dit: sentenceOfRefusal(new Error("GitHub refused the labels.\nstack…")) };
    const opinion = setOpinionOfRepository(doc, "page", state, () => {}) ?? assert.fail("pas d'avis");
    assert.match(text(opinion), /GitHub refused the labels\./);
    assert.doesNotMatch(text(opinion), /stack/);
    assert.equal(buttons(opinion)[0]?.textContent, RETRY);
    assert.equal(buttons(opinion)[0]?.disabled, false);
  });

  test("un refus sans phrase en dit une", () => {
    assert.equal(sentenceOfRefusal(undefined), "The setup failed.");
  });
});
