// Un seul run du superviseur par projet à la fois (#3943) : un réveil pendant
// un run ne lance rien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lancerUnSeulRun } from "../../src/superviseur/un-seul-run.ts";

// Un run qui tient jusqu'à ce que le test le lâche.
function runTenu() {
  let lacher = () => {};
  const tenu = new Promise<void>((resolve) => (lacher = resolve));
  const causes: string[] = [];
  return {
    causes,
    lacher,
    run: async (cause: string) => {
      causes.push(cause);
      await tenu;
    },
  };
}

test("un second réveil pendant un run ne lance rien ; le run fini, un réveil en relance un", async () => {
  const premier = runTenu();
  const second = runTenu();
  const encours = lancerUnSeulRun("projet-a", "main-red", premier.run);
  assert.notEqual(encours, null);
  assert.equal(lancerUnSeulRun("projet-a", "takes", second.run), null);
  assert.deepEqual([premier.causes, second.causes], [["main-red"], []]);
  premier.lacher();
  await encours;
  const troisieme = runTenu();
  troisieme.lacher();
  await lancerUnSeulRun("projet-a", "no-merge", troisieme.run);
  assert.deepEqual(troisieme.causes, ["no-merge"]);
});

test("le run d'un projet ne retient pas celui d'un autre", async () => {
  const a = runTenu();
  const b = runTenu();
  const runA = lancerUnSeulRun("projet-b", "main-red", a.run);
  const runB = lancerUnSeulRun("projet-c", "main-red", b.run);
  assert.notEqual(runB, null);
  a.lacher();
  b.lacher();
  await Promise.all([runA, runB]);
  assert.deepEqual([a.causes, b.causes], [["main-red"], ["main-red"]]);
});

test("sans réveil, rien ne part", () => {
  const run = runTenu();
  assert.equal(lancerUnSeulRun("projet-d", null, run.run), null);
  assert.deepEqual(run.causes, []);
});

test("un run qui échoue rend son échec et libère le projet", async () => {
  await assert.rejects(lancerUnSeulRun("projet-e", "takes", async () => Promise.reject(new Error("le manager est tombé"))) ?? Promise.resolve(), /le manager est tombé/);
  const run = runTenu();
  run.lacher();
  await lancerUnSeulRun("projet-e", "takes", run.run);
  assert.deepEqual(run.causes, ["takes"]);
});
