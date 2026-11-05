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
  assert.equal(todo.pourLeChef.length, 1);
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

test("TODO, a failed repair: listed for the chef with its reason", async (t) => {
  const { avec, corps } = await todoRendu(t, [ouverte({ labels: ["prio:0", "hors-cuisine"] })], { 50: [{ association: "OWNER", body: "<!-- brigade:echec n=3 -->\nthe cook stopped: gates stay red" }] });
  assert.equal(avec.file.length, 1);
  assert.equal(avec.file[0]!.nom, "#50");
  assert.match(corps, /## Awaiting the chef — 1 decision/);
  assert.match(corps, /its repair #50 failed/);
  assert.match(corps, /gates stay red/);
  assert.doesNotMatch(corps, /a repair is cooking/);
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
