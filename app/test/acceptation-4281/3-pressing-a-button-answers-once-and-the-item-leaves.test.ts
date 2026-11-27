// Test d'acceptation gelé (#4281). Critère 3 : un bouton appelle l'action de réponse une fois, avec le ticket et la réponse choisie ; l'item quitte le TODO ; aucun texte n'est copié à la main.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkedTodo } from "../../src/vue/parked/parked-todo.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

test("a button calls answer once with the ticket and the chosen answer, then the item leaves", async () => {
  const records = [
    { ticket: 31, who: "chef", what: "pick a colour", until: "2026-12-01", step: "pris" },
    { ticket: 32, who: "chef", what: "approve the copy", until: "2026-12-02", step: "pass" },
  ];
  const calls: unknown[][] = [];
  const todo = parkedTodo(doc, { records, chef: "chef", choices: ["go on", "drop it"], answer: (...args: unknown[]) => void calls.push(args) }) as unknown as Fake;
  const item = (n: number) => todo.dessous("li").find(({ dataset }) => dataset.ticket === String(n));
  (item(31) ?? assert.fail("no item")).dessous("button").find((b) => b.textContent.trim() === "drop it")?.click();
  await repos();
  assert.deepEqual(calls, [[31, "drop it"]]);
  assert.equal(item(31), undefined, "the answered item leaves");
  assert.ok(item(32), "the other item stays");
  assert.equal(todo.dessous("textarea").length + todo.dessous("input").length, 0, "nothing to type or paste");
});
