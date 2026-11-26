// #4423, critère 3 : un commentaire accepté (état stocké) est inclus comme un autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ticketRemis } from "../../src/claude.ts";

test("a comment from an author without write access, once accepted, is included in the ticket given to the cook", () => {
  const texte = ticketRemis({
    number: 7,
    title: "A ticket",
    body: "The body.",
    commentaires: [
      { author: "stranger", association: "NONE", body: "A useful remark.", accepted: true },
      { author: "other", association: "NONE", body: "A pending remark." },
    ],
  } as Parameters<typeof ticketRemis>[0]);
  assert.match(texte, /\*\*Commentaire de stranger \(NONE\)\*\*\n\nA useful remark\./);
  assert.doesNotMatch(texte, /A pending remark\./);
});
