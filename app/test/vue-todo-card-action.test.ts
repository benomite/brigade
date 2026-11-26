// Le geste d'une carte de TODO (#3132) : une commande longue se lit en entier sur la carte, son bouton « copy » met la
// commande exacte dans le presse-papiers et dit « copied » ; une carte sans geste n'a pas de bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardDuChefDeTodo } from "../src/card-todo.ts";
import { REPOS, poserCardDeTodo } from "../src/vue/card-todo.js";
import { COPIE, COPIE_ECHOUEE, COPIER, actionDeLaQuestion } from "../src/vue/todo-card/action.js";
import { Faux, repos } from "./aides/fausse-vue.ts";

const COMMAND = 'gh issue create --repo benomite/brigade --title "Epic 3128: a very long title that no single line of a card could hold without cutting it" --body-file /tmp/corps-de-l-issue-qui-est-aussi-tres-long.md --label chef-todo';
const doc = { createElement: (balise: string) => new Faux(balise) };
const poser = (texte: string, actions: Record<string, unknown> = {}) => {
  const card = cardDuChefDeTodo({ sorte: "blocked", texte }) ?? assert.fail("pas de carte");
  const rien = { repondre: () => {}, ecrire: () => {}, demander: () => {}, ...actions };
  return (poserCardDeTodo(doc, 3132, card, REPOS, { captures: [], brouillon: "", cle: "p#3132" }, rien as never) as Faux[])[0] ?? assert.fail("rien de posé");
};
const AVEC_ACTION = `**Gesture for the chef:** From a machine with GitHub access, run: ${COMMAND}\n\nStation \`x\`: the cook stopped, blocked.`;

describe("le geste d'une carte de TODO (#3132)", () => {
  test("la commande entière est sur la carte, sans coupe, et son bouton « copy » est là", () => {
    const action = poser(AVEC_ACTION).dessous("div").find((un) => un.className === "geste-carte") ?? assert.fail("pas de bloc du geste");
    assert.equal(action.dessous("pre")[0]?.textContent, COMMAND);
    assert.match(action.dessous("p")[0]?.textContent ?? "", /^Gesture for the chef: From a machine with GitHub access,$/);
    assert.equal(action.dessous("button")[0]?.textContent, COPIER);
  });

  test("un clic sur « copy » met la commande exacte dans le presse-papiers, et le bouton dit « copied »", async () => {
    const copiees: string[] = [];
    const button = poser(AVEC_ACTION, { copier: async (texte: string) => void copiees.push(texte) }).dessous("button").find((un) => un.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
    button.click();
    await repos();
    assert.deepEqual(copiees, [COMMAND]);
    assert.equal(button.textContent, COPIE);
  });

  test("un presse-papiers qui refuse, ou qui manque, se dit « copy failed » avec sa raison au survol", async () => {
    for (const copier of [async () => Promise.reject(new Error("denied by the system")), () => undefined]) {
      const button = poser(AVEC_ACTION, { copier }).dessous("button").find((un) => un.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
      button.click();
      await repos();
      assert.equal(button.textContent, COPIE_ECHOUEE);
      assert.notEqual(button.title, "");
    }
  });

  test("une carte sans geste n'a ni bloc ni bouton « copy » ; un geste sans « run: » est copié tel quel", () => {
    const sans = poser("Should the release run be retried?\n- [resume] Retry it\n- [close] Close it");
    assert.equal(sans.dessous("button").some((un) => un.dataset.geste === "copier-le-geste"), false);
    assert.equal(sans.dessous("div").some((un) => un.className === "geste-carte"), false);
    assert.deepEqual(actionDeLaQuestion("Gesture for the chef: merge PR #12 by hand"), { avant: "", commande: "merge PR #12 by hand" });
    assert.equal(actionDeLaQuestion("Gesture for the chef:"), null);
    assert.equal(actionDeLaQuestion(null), null);
  });
});
