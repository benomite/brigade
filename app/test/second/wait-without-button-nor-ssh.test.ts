// #4116, puis #4129 — le second ne demande jamais au chef de cliquer, et n'a jamais besoin de SSH vers la boîte pour parquer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROLE = readFileSync(join(import.meta.dirname, "..", "..", "src", "second", "role.md"), "utf8");

test("le rôle ne renvoie ni vers un bouton ni vers la boîte pour mettre en attente", () => {
  const start = ROLE.indexOf("Putting a ticket on hold");
  const section = ROLE.slice(ROLE.indexOf("A ticket that waits for someone else"));
  assert.ok(start >= 0);
  assert.ok(!/ssh/i.test(section), "la section d'attente parle de SSH");
  assert.ok(!/needs the box|only runs on the box/i.test(section));
  assert.ok(!/brigade <name> (?:waiting|parked)/.test(section), "la section d'attente dépend encore d'une commande de la boîte");
  assert.ok(/not need the box|without the box|no box/i.test(section), "le rôle ne dit pas que l'attente se passe de la boîte");
});
