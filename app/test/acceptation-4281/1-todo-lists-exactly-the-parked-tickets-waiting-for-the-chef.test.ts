// Test d'acceptation gelé (#4281). Critère 1 : avec de faux enregistrements, le TODO montre chaque ticket parked qui attend le chef, et aucun autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkedTodo } from "../../src/vue/parked/parked-todo.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const record = (ticket: number, who: string) => ({ ticket, who, what: `thing ${ticket}`, until: "2026-12-01", step: "pris" });

test("the TODO shows every parked ticket whose who is the chef, and no other", () => {
  const records = [record(11, "chef"), record(12, "Camille"), record(13, "chef"), record(14, "Luc"), record(15, "chef")];
  const todo = parkedTodo(doc, { records, chef: "chef", choices: ["go on"], answer: () => {} }) as unknown as Fake;
  const shown = todo.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined).map(({ dataset }) => Number(dataset.ticket));
  assert.deepEqual(shown.sort(), [11, 13, 15]);
});
