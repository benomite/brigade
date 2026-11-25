import assert from "node:assert/strict";
import { test } from "node:test";
import { ECHECS_ATTEINTS } from "../../src/github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

// A first failure is below the cap and below the try limit: the ticket does not go to the manager.
test("a first failed try does not send the ticket to the manager", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "the gates failed" }) });
  await a.tour();
  await a.calme();
  const corps = (faux.commentaires.get(894) ?? []).map(({ body }) => body).filter((b) => b.includes("the cook stopped without a delivery"));
  assert.equal(corps.length >= 1, true);
  assert.doesNotMatch(corps[0]!, /tries are spent|No manager runs|Set aside/);
  assert.equal(faux.ticket(894).labels.has(ECHECS_ATTEINTS), false);
});
