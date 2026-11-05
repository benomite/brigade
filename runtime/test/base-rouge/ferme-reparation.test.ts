import assert from "node:assert/strict";
import { test } from "node:test";
import { commentaireDeLaFermeture, fermeReparation, type GitHubDeLaFermeture } from "../../src/base-rouge/ferme-reparation.ts";
import { marqueDeBaseRouge, type CheckDeLaBase } from "../../src/base-rouge/ouvre-reparation.ts";

type Issue = { number: number; body: string; state: "open" | "closed"; labels: string[] };

class FauxDepot {
  commentaires: { numero: number; corps: string }[] = [];
  fermetures: number[] = [];
  lectures: number[] = [];
  issues: Issue[];
  constructor(issues: Issue[]) {
    this.issues = issues;
  }
  // Les tickets que le tour lit, sans leur corps.
  tickets() {
    return this.issues.map(({ number, labels, state }) => ({ number, labels, state }));
  }
  github(): GitHubDeLaFermeture {
    return {
      corpsDuTicket: async (numero) => {
        this.lectures.push(numero);
        return this.issues.find((issue) => issue.number === numero)?.body ?? "";
      },
      commenter: async (numero, corps) => void this.commentaires.push({ numero, corps }),
      fermerIssue: async (numero) => void this.fermetures.push(numero),
    };
  }
}

const VERTE: CheckDeLaBase[] = [{ name: "tests", outcome: "green" }];
const ROUGE: CheckDeLaBase[] = [{ name: "tests", outcome: "red" }];
const reparation = (number: number, state: "open" | "closed" = "open"): Issue => ({ number, body: `${marqueDeBaseRouge("a".repeat(40))}\n\n## Context`, state, labels: ["fire", "prio:0"] });

test("a green base closes the open marked issue with a comment saying the base is green and the repair no longer needed", async () => {
  const depot = new FauxDepot([reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE, depot.tickets()), [7]);
  assert.deepEqual(depot.fermetures, [7]);
  assert.equal(depot.commentaires.length, 1);
  assert.equal(depot.commentaires[0]?.corps, commentaireDeLaFermeture("main"));
  assert.match(depot.commentaires[0]?.corps ?? "", /green again.*no longer needed/);
});

test("a green base with no marked issue closes nothing", async () => {
  const depot = new FauxDepot([]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE, depot.tickets()), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("an already closed marked issue gets no second comment and no error", async () => {
  const depot = new FauxDepot([reparation(7, "closed")]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE, depot.tickets()), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("a green base with no open ticket reads and writes nothing", async () => {
  const depot = new FauxDepot([{ number: 3, body: "A plain ticket", state: "open", labels: ["fire"] }]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE, depot.tickets()), []);
  assert.deepEqual(depot.lectures, []);
});

test("a base still red leaves the marked issue open", async () => {
  const depot = new FauxDepot([reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(ROUGE, depot.tickets()), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("unrelated open issues without the marker are never touched", async () => {
  const depot = new FauxDepot([{ number: 3, body: "A plain ticket", state: "open", labels: ["fire"] }, { number: 4, body: "A prio:0 ticket without the marker", state: "open", labels: ["fire", "prio:0"] }, reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE, depot.tickets()), [7]);
  assert.deepEqual(depot.fermetures, [7]);
  assert.deepEqual(depot.commentaires.map((c) => c.numero), [7]);
  assert.ok(!depot.lectures.includes(3), "a ticket that is not a repair candidate is not even read");
});
