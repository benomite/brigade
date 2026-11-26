// La convention des cartes du chef sur GitHub (#2217, #2221) : le commentaire marqué donne la sorte et le texte de la carte.
// Leur lecture — une carte par issue au label `chef-todo` — est celle de tout ce qui attend le chef (wait-du-chef.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardDuComment } from "../../src/tableau/todo-github.ts";

describe("le commentaire marqué", () => {
  test("la sorte et le texte, en clair", () => {
    assert.deepEqual(cardDuComment("<!-- brigade:todo kind=merge-by-hand -->\nMerge PR 12 yourself.\n"), { sorte: "merge-by-hand", texte: "Merge PR 12 yourself." });
    assert.equal(cardDuComment("a comment like another"), null);
  });
});
