// #4026, critère 5 : un ticket mis de côté ou parqué (`parked`, d'abord WAITING — #4129) a une raison nommée et une date de reprise.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a ticket parked without reason or date gets both from the supervisor", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "parked"]);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {} });
  await a.tour();
  await a.calme();
  const texte = (faux.commentaires.get(1) ?? []).map((c) => c.body).join("\n");
  const reveille = !faux.ticket(1).labels.has("parked");
  assert.ok(
    reveille || (/invariant 3/i.test(texte) && /\b\d{4}-\d{2}-\d{2}\b/.test(texte) && /reason/i.test(texte)),
    `the ticket is woken, or a reason and a date were added; comments: ${texte}`,
  );
});
