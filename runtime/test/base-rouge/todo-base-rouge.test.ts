import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";
import { baseRougeDesOuvertes, baseRougeDuTodo, lireLaBaseRouge, type IssueDeReparation } from "../../src/base-rouge/todo-base-rouge.ts";
import type { Issue, IssueOuverte } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import { rendreLeTableau } from "../../src/tableau/rendu/rendre.ts";
import { repertoireTemporaire } from "../outils.ts";

const SHA = "abcdef0123456789abcdef0123456789abcdef01";

const issue = (surcharge: Partial<IssueDeReparation> = {}): IssueDeReparation => ({
  number: 50,
  title: "Repair the red base",
  state: "open",
  labels: ["prio:0", "fire"],
  body: `Fix it.\n\n${marqueDeBaseRouge(SHA)}`,
  association: "OWNER",
  createdAt: "2026-11-01T10:00:00Z",
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
  await t.test("hors-cuisine with a product question: the question is the card", () => {
    const todo = baseRougeDuTodo([
      issue({
        labels: ["prio:0", "hors-cuisine"],
        commentaires: [
          { association: "OWNER", body: "<!-- brigade:echec n=3 -->\nStation `a`: the cook stopped without a delivery — gates stay red" },
          { association: "OWNER", body: "<!-- brigade:todo kind=product-question -->\nShould the repair drop the legacy export?" },
        ],
      }),
    ]);
    assert.equal(todo.enCours.length, 0);
    assert.equal(todo.pourLeSecond.length, 0);
    assert.equal(todo.pourLeChef.length, 1);
    assert.equal(todo.pourLeChef[0]!.ticket, 50);
    assert.match(todo.pourLeChef[0]!.texte, /legacy export/);
  });
  await t.test("#2061, 2026-11-05: three echec markers, hors-cuisine, no question: no card, the second is told why", () => {
    const echec = (n: number) => ({ association: "OWNER", body: `<!-- brigade:echec n=${n} -->\nStation \`a\`: the cook stopped without a delivery — stale conflicting branch` });
    const todo = baseRougeDuTodo([issue({ number: 2061, labels: ["prio:0", "hors-cuisine"], commentaires: [echec(1), echec(2), echec(3)] })]);
    assert.deepEqual(todo.pourLeChef, []);
    assert.deepEqual(todo.enCours, []);
    assert.equal(todo.pourLeSecond.length, 1);
    assert.equal(todo.pourLeSecond[0]!.ticket, 2061);
    assert.match(todo.pourLeSecond[0]!.pourquoi, /stale conflicting branch/);
  });
  await t.test("chef-todo without a readable card: not shown, the second is told why", () => {
    const todo = baseRougeDuTodo([issue({ labels: ["chef-todo"], commentaires: [{ association: "OWNER", body: "<!-- brigade:todo kind=abandoned -->\n" }] })]);
    assert.deepEqual(todo.pourLeChef, []);
    assert.match(todo.pourLeSecond[0]!.pourquoi, /no readable card/);
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
    const todo = baseRougeDuTodo([issue({ labels: ["blocked-on-human"], commentaires: [{ association: "NONE", body: "<!-- brigade:echec n=1 -->\nsecret lie" }] })]);
    assert.doesNotMatch(todo.pourLeChef[0]!.texte, /secret lie/);
  });
});

test("no marked ticket: nothing changes", () => {
  assert.deepEqual(baseRougeDuTodo([]), { enCours: [], pourLeChef: [], pourLeSecond: [] });
  assert.deepEqual(baseRougeDuTodo([issue({ body: "A plain ticket." })]), { enCours: [], pourLeChef: [], pourLeSecond: [] });
  assert.deepEqual(baseRougeDuTodo([issue({ association: "NONE" })]), { enCours: [], pourLeChef: [], pourLeSecond: [] });
});

test("a marked ticket closed (base green): no base-red line", () => {
  assert.deepEqual(baseRougeDuTodo([issue({ state: "closed" }), issue({ state: "closed", labels: ["hors-cuisine"] })]), { enCours: [], pourLeChef: [], pourLeSecond: [] });
});

test("the reader fetches comments of failed repairs only, and a failing read raises", async () => {
  const lus: number[] = [];
  const sansCommentaires = ({ commentaires: _, ...reste }: IssueDeReparation) => reste;
  const github = {
    issuesOuvertes: async () => [sansCommentaires(issue({ number: 1 })), sansCommentaires(issue({ number: 2, labels: ["hors-cuisine"] }))],
    commentaires: async (numero: number) => {
      lus.push(numero);
      return [];
    },
  };
  const todo = await lireLaBaseRouge(github);
  assert.deepEqual(lus, [2]);
  assert.equal(todo.enCours.length, 1);
  assert.equal(todo.pourLeChef.length, 0);
  assert.equal(todo.pourLeSecond.length, 1);
  await assert.rejects(lireLaBaseRouge({ issuesOuvertes: async () => Promise.reject(new Error("rate limited")), commentaires: async () => [] }), /rate limited/);
});

// Par la construction réelle de TODO : le tableau du journal, rendu en markdown.
const ouverte = (surcharge: Partial<IssueOuverte> = {}): IssueOuverte => ({
  number: 50,
  title: "Repair the red base",
  labels: ["prio:0", "fire"],
  state: "open",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  url: "https://github.com/acme/brigade/issues/50",
  body: `Fix it.\n\n${marqueDeBaseRouge(SHA)}`,
  association: "OWNER",
  ...surcharge,
});

async function todoRendu(t: TestContext, ouvertes: Issue[], commentaires: Record<number, { body: string; association: string }[]> = {}) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  // Fermé avant que son répertoire s'efface : sous Windows, une base ouverte ne s'efface pas, et
  // l'effacement se reprend deux minutes avant d'échouer (#2421).
  t.after(() => journal.fermer());
  const instant = new Date("2026-11-05T10:00:00.000Z");
  const lire = async (avec: Issue[]) => baseRougeDesOuvertes(avec, async (n) => (commentaires[n] ?? []).map((c) => ({ ...c, author: "bot", createdAt: "2026-11-02T00:00:00Z" })));
  const sans = tableauDuJournal(journal, "acme", instant, { depot: "acme/brigade" });
  const avec = tableauDuJournal(journal, "acme", instant, { depot: "acme/brigade", baseRouge: await lire(ouvertes) });
  return { sans, avec, corps: rendreLeTableau(avec, instant) };
}

test("TODO, a repair being cooked: a line saying the base is red, outside the chef's queue", async (t) => {
  const { sans, avec, corps } = await todoRendu(t, [ouverte()]);
  assert.deepEqual(avec.file, sans.file);
  assert.equal(avec.bilans.length, sans.bilans.length + 1);
  assert.match(corps, /The base is red at abcdef0: a repair is cooking \(#50\)\./);
  assert.match(corps, /## Awaiting the chef — nothing/);
});

test("TODO, a failed repair with a question for the chef: listed with the question", async (t) => {
  const { avec, corps } = await todoRendu(t, [ouverte({ labels: ["prio:0", "hors-cuisine"] })], { 50: [{ association: "OWNER", body: "<!-- brigade:todo kind=product-question -->\nKeep the legacy export?" }] });
  assert.equal(avec.file.length, 1);
  assert.equal(avec.file[0]!.nom, "#50");
  assert.match(corps, /## Awaiting the chef — 1 decision/);
  assert.match(corps, /its repair #50 failed/);
  assert.match(corps, /Keep the legacy export\?/);
  assert.doesNotMatch(corps, /a repair is cooking/);
});

test("TODO, a failed repair set aside with no question (#2061): no card for the chef", async (t) => {
  const { avec, corps } = await todoRendu(t, [ouverte({ labels: ["prio:0", "hors-cuisine"] })], { 50: [1, 2, 3].map((n) => ({ association: "OWNER", body: `<!-- brigade:echec n=${n} -->\nthe cook stopped: gates stay red` })) });
  assert.equal(avec.file.length, 0);
  assert.match(corps, /## Awaiting the chef — nothing/);
  assert.match(corps, /repair #50 failed and is the second's to handle/);
});

test("TODO, no marked ticket: unchanged compared to before", async (t) => {
  const { sans, avec } = await todoRendu(t, [ouverte({ body: "A plain ticket." }), ouverte({ number: 51, association: "NONE" })]);
  assert.deepEqual(avec, sans);
  assert.equal(rendreLeTableau(avec, new Date("2026-11-05T10:00:00.000Z")), rendreLeTableau(sans, new Date("2026-11-05T10:00:00.000Z")));
});

test("TODO, a marked ticket closed (base green): no base-red line", async (t) => {
  const { sans, avec, corps } = await todoRendu(t, [ouverte({ state: "closed" })]);
  assert.deepEqual(avec, sans);
  assert.doesNotMatch(corps, /base is red/);
});
