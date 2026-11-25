// #4129, critère 4 : le TODO du chef est exactement les tickets parked qui l'attendent, chacun avec ses boutons ; répondre envoie le ticket plus loin, sans copier-coller.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

test("docs/todo-cards.md says the TODO is the parked tickets that wait for the chef, with buttons, and the answer sends the ticket on", () => {
  const doc = readFileSync(join(RACINE, "docs/todo-cards.md"), "utf8");
  assert.match(doc, /parked/i, "the doc does not speak of parked tickets");
  assert.match(doc, /wait(s|ing)? for the chef/i);
  assert.match(doc, /buttons?/i);
  assert.match(doc, /copy-paste/i);
  assert.match(doc, /sends? the ticket on/i);
});
