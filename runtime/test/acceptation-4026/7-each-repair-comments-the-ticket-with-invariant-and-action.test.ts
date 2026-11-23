// #4026, critère 7 : chaque réparation écrit sur le ticket quel invariant a cassé et ce que le superviseur a fait.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("the comment of a repair says which invariant broke and what the supervisor did", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "waiting"]);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {} });
  await a.tour();
  await a.calme();
  const commentaires = (faux.commentaires.get(1) ?? []).filter((c) => /invariant/i.test(c.body));
  assert.equal(commentaires.length >= 1, true, "a repair comment exists on the ticket");
  const corps = commentaires[0]!.body;
  assert.match(corps, /invariant 3/i, "names the invariant that broke");
  assert.match(corps, /\b(added|released|woke|woken|reran|relaunched|stopped)\b/i, "says what the supervisor did");
});
