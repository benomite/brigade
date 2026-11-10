import assert from "node:assert/strict";
import { test } from "node:test";
import { commentaireIllisible, commentaireRetenue, REPONSE_ECRITE } from "../src/commentaire-reponse-chef.ts";

test("avec une réponse écrite sur l'issue, le commentaire dit qu'elle l'est et que le label part", () => {
  assert.equal(commentaireRetenue(true), "Your answer is written on the issue and the label removed, so the manager judges it again.");
  assert.equal(commentaireIllisible(true), "Your answer is written on the issue for it to read.");
});

test("sans réponse sur l'issue, le commentaire ne dit ni qu'elle est écrite ni que le chef a répondu ni que le label part", () => {
  for (const texte of [commentaireRetenue(false), commentaireIllisible(false)]) {
    assert.ok(!texte.includes(REPONSE_ECRITE), texte);
    assert.ok(!/answered|label removed|is removed/i.test(texte), texte);
    assert.match(texte, /No answer was found on the issue yet/);
  }
  assert.match(commentaireRetenue(false), /label stays/);
});
