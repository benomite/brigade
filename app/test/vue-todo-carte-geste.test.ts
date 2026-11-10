// Le geste d'une carte de TODO (#3132) : une commande longue se lit en entier sur la carte, son bouton « copy » met la
// commande exacte dans le presse-papiers et dit « copied » ; une carte sans geste n'a pas de bouton.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { carteDuChefDeTodo } from "../src/carte-todo.ts";
import { REPOS, poserCarteDeTodo } from "../src/vue/carte-todo.js";
import { COPIE, COPIE_ECHOUEE, COPIER, gesteDeLaQuestion } from "../src/vue/todo-carte/geste.js";
import { Faux, repos } from "./aides/fausse-vue.ts";

const COMMANDE = 'gh issue create --repo benomite/brigade --title "Epic 3128: a very long title that no single line of a card could hold without cutting it" --body-file /tmp/corps-de-l-issue-qui-est-aussi-tres-long.md --label chef-todo';
const doc = { createElement: (balise: string) => new Faux(balise) };
const poser = (texte: string, gestes: Record<string, unknown> = {}) => {
  const carte = carteDuChefDeTodo({ sorte: "blocked", texte }) ?? assert.fail("pas de carte");
  const rien = { repondre: () => {}, ecrire: () => {}, demander: () => {}, ...gestes };
  return (poserCarteDeTodo(doc, 3132, carte, REPOS, { captures: [], brouillon: "", cle: "p#3132" }, rien as never) as Faux[])[0] ?? assert.fail("rien de posé");
};
const AVEC_GESTE = `**Gesture for the chef:** From a machine with GitHub access, run: ${COMMANDE}\n\nStation \`x\`: the cook stopped, blocked.`;

describe("le geste d'une carte de TODO (#3132)", () => {
  test("la commande entière est sur la carte, sans coupe, et son bouton « copy » est là", () => {
    const geste = poser(AVEC_GESTE).dessous("div").find((un) => un.className === "geste-carte") ?? assert.fail("pas de bloc du geste");
    assert.equal(geste.dessous("pre")[0]?.textContent, COMMANDE);
    assert.match(geste.dessous("p")[0]?.textContent ?? "", /^Gesture for the chef: From a machine with GitHub access,$/);
    assert.equal(geste.dessous("button")[0]?.textContent, COPIER);
  });

  test("un clic sur « copy » met la commande exacte dans le presse-papiers, et le bouton dit « copied »", async () => {
    const copiees: string[] = [];
    const bouton = poser(AVEC_GESTE, { copier: async (texte: string) => void copiees.push(texte) }).dessous("button").find((un) => un.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
    bouton.click();
    await repos();
    assert.deepEqual(copiees, [COMMANDE]);
    assert.equal(bouton.textContent, COPIE);
  });

  test("un presse-papiers qui refuse, ou qui manque, se dit « copy failed » avec sa raison au survol", async () => {
    for (const copier of [async () => Promise.reject(new Error("denied by the system")), () => undefined]) {
      const bouton = poser(AVEC_GESTE, { copier }).dessous("button").find((un) => un.dataset.geste === "copier-le-geste") ?? assert.fail("pas de bouton");
      bouton.click();
      await repos();
      assert.equal(bouton.textContent, COPIE_ECHOUEE);
      assert.notEqual(bouton.title, "");
    }
  });

  test("une carte sans geste n'a ni bloc ni bouton « copy » ; un geste sans « run: » est copié tel quel", () => {
    const sans = poser("Should the release run be retried?\n- [resume] Retry it\n- [close] Close it");
    assert.equal(sans.dessous("button").some((un) => un.dataset.geste === "copier-le-geste"), false);
    assert.equal(sans.dessous("div").some((un) => un.className === "geste-carte"), false);
    assert.deepEqual(gesteDeLaQuestion("Gesture for the chef: merge PR #12 by hand"), { avant: "", commande: "merge PR #12 by hand" });
    assert.equal(gesteDeLaQuestion("Gesture for the chef:"), null);
    assert.equal(gesteDeLaQuestion(null), null);
  });
});
