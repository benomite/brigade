// #4219, criterion 6: the same issue with no stored decision is put on hold after one tick, with a comment carrying the
// manager's stated reason.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

test("after one tick the issue is on hold and carries the manager's reason", async (t) => {
  const c = cuisine(t, { issues: [issue(30, ["fire"])] });
  const raison = "not a workable ticket: a decision issue";
  c.gh.repondre(30, `${MARQUEUR_MANAGER}\n**Manager — ${raison}.**`);
  assert.equal(cartesEnTodo(c.journal.base).length, 0);

  await jusqua(() => (c.gh.lire(30)?.labels ?? []).includes("waiting"), 10_000);

  assert.equal(cartesEnTodo(c.journal.base).length, 0);
  assert.ok(
    c.gh.commentaires.some(([n, corps]) => n === 30 && corps.includes(raison)),
    "a comment on the issue states the manager's reason",
  );
});
