import assert from "node:assert/strict";
import { test } from "node:test";
import { commentaireDeLaFermeture, fermeReparation, type GitHubDeLaFermeture } from "../../src/base-rouge/ferme-reparation.ts";
import { marqueDeBaseRouge, type CheckDeLaBase } from "../../src/base-rouge/ouvre-reparation.ts";

type Issue = { number: number; body: string; state: "open" | "closed"; association: string };

class FauxDepot {
  commentaires: { numero: number; corps: string }[] = [];
  fermetures: number[] = [];
  issues: Issue[];
  constructor(issues: Issue[]) {
    this.issues = issues;
  }
  github(): GitHubDeLaFermeture {
    return {
      issuesDepuis: async () => this.issues,
      commenter: async (numero, corps) => void this.commentaires.push({ numero, corps }),
      fermerIssue: async (numero) => void this.fermetures.push(numero),
    };
  }
}

const VERTE: CheckDeLaBase[] = [{ name: "tests", outcome: "green" }];
const ROUGE: CheckDeLaBase[] = [{ name: "tests", outcome: "red" }];
const reparation = (number: number, state: "open" | "closed" = "open"): Issue => ({ number, body: `${marqueDeBaseRouge("a".repeat(40))}\n\n## Context`, state, association: "OWNER" });

test("a green base closes the open marked issue with a comment saying the base is green and the repair no longer needed", async () => {
  const depot = new FauxDepot([reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE), [7]);
  assert.deepEqual(depot.fermetures, [7]);
  assert.equal(depot.commentaires.length, 1);
  assert.equal(depot.commentaires[0]?.corps, commentaireDeLaFermeture("main"));
  assert.match(depot.commentaires[0]?.corps ?? "", /green again.*no longer needed/);
});

test("a green base with no marked issue closes nothing", async () => {
  const depot = new FauxDepot([]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("an already closed marked issue gets no second comment and no error", async () => {
  const depot = new FauxDepot([reparation(7, "closed")]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("a base still red leaves the marked issue open", async () => {
  const depot = new FauxDepot([reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(ROUGE), []);
  assert.deepEqual(depot.fermetures, []);
  assert.deepEqual(depot.commentaires, []);
});

test("unrelated open issues without the marker are never touched", async () => {
  const depot = new FauxDepot([{ number: 3, body: "A plain ticket", state: "open", association: "OWNER" }, reparation(7)]);
  assert.deepEqual(await fermeReparation({ github: depot.github(), base: "main" })(VERTE), [7]);
  assert.deepEqual(depot.fermetures, [7]);
  assert.deepEqual(depot.commentaires.map((c) => c.numero), [7]);
});
