// #4423, critère 2 : le commentaire du chef, d'un collaborateur avec l'écriture ou d'un agent de la cuisine passe comme avant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ticketRemis } from "../../src/claude.ts";

for (const [author, association] of [["chef", "OWNER"], ["maintainer", "MEMBER"], ["collab", "COLLABORATOR"], ["brigade", "OWNER"]] as const) {
  // brigade:guard
  test(`a comment from ${author} (${association}) flows through to the ticket given to the cook`, () => {
    const texte = ticketRemis({ number: 7, title: "A ticket", body: "The body.", commentaires: [{ author, association, body: `Note from ${author}.` }] });
    assert.match(texte, new RegExp(`\\*\\*Commentaire de ${author} \\(${association}\\)\\*\\*\\n\\nNote from ${author}\\.`));
  });
}
