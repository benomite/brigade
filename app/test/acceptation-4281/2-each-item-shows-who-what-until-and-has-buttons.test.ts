// Test d'acceptation gelé (#4281). Critère 2 : chaque item du TODO montre qui, pour quoi et jusqu'à quand, et porte ses boutons.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkedTodo } from "../../src/vue/parked/parked-todo.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("each item shows who, for what and until when, and one button per choice", () => {
  const records = [
    { ticket: 21, who: "chef", what: "the invoice approval", until: "2026-12-03", step: "pris" },
    { ticket: 22, who: "chef", what: "the logo choice", until: "the vendor answers", step: "pass" },
  ];
  const todo = parkedTodo(doc, { records, chef: "chef", choices: ["go on", "drop it"], answer: () => {} }) as unknown as Faux;
  const items = todo.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined);
  assert.equal(items.length, 2);
  for (const [i, item] of items.entries()) {
    const r = records[i]!;
    assert.equal(item.dataset.ticket, String(r.ticket));
    assert.match(item.textContent, /chef/);
    assert.ok(item.textContent.includes(r.what), "for what");
    assert.ok(item.textContent.includes(r.until), "until when");
    assert.deepEqual(item.dessous("button").map((b) => b.textContent.trim()), ["go on", "drop it"]);
  }
});
