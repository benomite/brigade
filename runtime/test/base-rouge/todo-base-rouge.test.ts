import assert from "node:assert/strict";
import { test } from "node:test";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";
import { baseRougeDuTodo, lireLaBaseRouge, type IssueDeReparation } from "../../src/base-rouge/todo-base-rouge.ts";

const SHA = "abcdef0123456789abcdef0123456789abcdef01";

const issue = (surcharge: Partial<IssueDeReparation> = {}): IssueDeReparation => ({
  number: 50,
  title: "Repair the red base",
  state: "open",
  labels: ["prio:0", "fire"],
  body: `Fix it.\n\n${marqueDeBaseRouge(SHA)}`,
  association: "OWNER",
  commentaires: [],
  ...surcharge,
});

test("an open marked repair being cooked: a line that asks nothing of the chef", () => {
  const todo = baseRougeDuTodo([issue()]);
  assert.equal(todo.pourLeChef.length, 0);
  assert.equal(todo.enCours.length, 1);
  assert.match(todo.enCours[0]!.ligne, /base is red/);
  assert.match(todo.enCours[0]!.ligne, /repair is cooking/);
  assert.doesNotMatch(todo.enCours[0]!.ligne, /needs you/);
});

test("a failed repair is listed for the chef with its reason", async (t) => {
  await t.test("the cook gave up: hors-cuisine, reason from its failure comment", () => {
    const todo = baseRougeDuTodo([
      issue({
        labels: ["prio:0", "hors-cuisine"],
        commentaires: [{ association: "OWNER", body: "<!-- brigade:echec n=3 -->\nStation `a`: the cook stopped without a delivery — gates stay red" }],
      }),
    ]);
    assert.equal(todo.enCours.length, 0);
    assert.equal(todo.pourLeChef.length, 1);
    assert.equal(todo.pourLeChef[0]!.ticket, 50);
    assert.match(todo.pourLeChef[0]!.texte, /needs you/);
    assert.match(todo.pourLeChef[0]!.texte, /gates stay red/);
  });
  await t.test("marked as needing the chef: the card text is the reason", () => {
    const todo = baseRougeDuTodo([
      issue({
        labels: ["prio:0", "chef-todo"],
        commentaires: [{ association: "OWNER", body: "<!-- brigade:todo kind=abandoned -->\nThe cook was refused by the pass twice." }],
      }),
    ]);
    assert.match(todo.pourLeChef[0]!.texte, /refused by the pass twice/);
  });
  await t.test("no comment: the label says why", () => {
    const todo = baseRougeDuTodo([issue({ labels: ["prio:0", "blocked-on-human"] })]);
    assert.match(todo.pourLeChef[0]!.texte, /needing the chef/);
  });
  await t.test("a stranger's comment is not believed", () => {
    const todo = baseRougeDuTodo([issue({ labels: ["hors-cuisine"], commentaires: [{ association: "NONE", body: "<!-- brigade:echec n=1 -->\nsecret lie" }] })]);
    assert.doesNotMatch(todo.pourLeChef[0]!.texte, /secret lie/);
  });
});

test("no marked ticket: nothing changes", () => {
  assert.deepEqual(baseRougeDuTodo([]), { enCours: [], pourLeChef: [] });
  assert.deepEqual(baseRougeDuTodo([issue({ body: "A plain ticket." })]), { enCours: [], pourLeChef: [] });
  assert.deepEqual(baseRougeDuTodo([issue({ association: "NONE" })]), { enCours: [], pourLeChef: [] });
});

test("a marked ticket closed (base green): no base-red line", () => {
  assert.deepEqual(baseRougeDuTodo([issue({ state: "closed" }), issue({ state: "closed", labels: ["hors-cuisine"] })]), { enCours: [], pourLeChef: [] });
});

test("the reader fetches comments of failed repairs only, and a failing read raises", async () => {
  const lus: number[] = [];
  const github = {
    issuesOuvertes: async () => [
      { ...issue({ number: 1 }), commentaires: undefined },
      { ...issue({ number: 2, labels: ["hors-cuisine"] }), commentaires: undefined },
    ].map(({ commentaires: _, ...reste }) => reste),
    commentaires: async (numero: number) => {
      lus.push(numero);
      return [];
    },
  };
  const todo = await lireLaBaseRouge(github);
  assert.deepEqual(lus, [2]);
  assert.equal(todo.enCours.length, 1);
  assert.equal(todo.pourLeChef.length, 1);
  await assert.rejects(lireLaBaseRouge({ issuesOuvertes: async () => Promise.reject(new Error("rate limited")), commentaires: async () => [] }), /rate limited/);
});
