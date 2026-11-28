// Le geste d'une carte de TODO (#3132) : une commande longue se lit en entier sur la carte, son bouton « copy » met la
// commande exacte dans le presse-papiers et dit « copied » ; une carte sans geste n'a pas de bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardOfChefOfTodo } from "../src/card-todo.ts";
import { REPOS, setCardOfTodo } from "../src/vue/card-todo.js";
import { COPIED, COPY_FAILED, COPY, actionOfTheQuestion } from "../src/vue/todo-card/action.js";
import { Fake, repos } from "./helpers/false-vue.ts";

const COMMAND = 'gh issue create --repo benomite/brigade --title "Epic 3128: a very long title that no single line of a card could hold without cutting it" --body-file /tmp/corps-de-l-issue-qui-est-aussi-tres-long.md --label chef-todo';
const doc = { createElement: (balise: string) => new Fake(balise) };
const set = (text: string, actions: Record<string, unknown> = {}) => {
  const card = cardOfChefOfTodo({ sorte: "blocked", texte: text }) ?? assert.fail("pas de carte");
  const nothing = { repondre: () => {}, ecrire: () => {}, demander: () => {}, ...actions };
  return (setCardOfTodo(doc, 3132, card, REPOS, { brouillon: "", cle: "p#3132" }, nothing as never) as Fake[])[0] ?? assert.fail("rien de posé");
};
const WITH_ACTION = `**Gesture for the chef:** From a machine with GitHub access, run: ${COMMAND}\n\nStation \`x\`: the cook stopped, blocked.`;

describe("le geste d'une carte de TODO (#3132)", () => {
  test("la commande entière est sur la carte, sans coupe, et son bouton « copy » est là", () => {
    const action = set(WITH_ACTION).dessous("div").find((oneOf) => oneOf.className === "geste-carte") ?? assert.fail("pas de bloc du geste");
    assert.equal(action.dessous("pre")[0]?.textContent, COMMAND);
    assert.match(action.dessous("p")[0]?.textContent ?? "", /^Gesture for the chef: From a machine with GitHub access,$/);
    assert.equal(action.dessous("button")[0]?.textContent, COPY);
  });

  test("un clic sur « copy » met la commande exacte dans le presse-papiers, et le bouton dit « copied »", async () => {
    const copied: string[] = [];
    const button = set(WITH_ACTION, { copier: async (text: string) => void copied.push(text) }).dessous("button").find((oneOf) => oneOf.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
    button.click();
    await repos();
    assert.deepEqual(copied, [COMMAND]);
    assert.equal(button.textContent, COPIED);
  });

  test("un presse-papiers qui refuse, ou qui manque, se dit « copy failed » avec sa raison au survol", async () => {
    for (const copy of [async () => Promise.reject(new Error("denied by the system")), () => undefined]) {
      const button = set(WITH_ACTION, { copier: copy }).dessous("button").find((oneOf) => oneOf.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
      button.click();
      await repos();
      assert.equal(button.textContent, COPY_FAILED);
      assert.notEqual(button.title, "");
    }
  });

  test("une carte sans geste n'a ni bloc ni bouton « copy » ; un geste sans « run: » est copié tel quel", () => {
    const without = set("Should the release run be retried?\n- [resume] Retry it\n- [close] Close it");
    assert.equal(without.dessous("button").some((oneOf) => oneOf.dataset.geste === "copier-le-geste"), false);
    assert.equal(without.dessous("div").some((oneOf) => oneOf.className === "geste-carte"), false);
    assert.deepEqual(actionOfTheQuestion("Gesture for the chef: merge PR #12 by hand"), { avant: "", commande: "merge PR #12 by hand" });
    assert.equal(actionOfTheQuestion("Gesture for the chef:"), null);
    assert.equal(actionOfTheQuestion(null), null);
  });
});
