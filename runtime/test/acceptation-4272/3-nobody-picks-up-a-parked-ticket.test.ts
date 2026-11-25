// Test d'acceptation gelé (#4272), critère 3.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : `runtime/src/parked/parked.ts` exporte `ouvrirParked({ etapes })` -> `{ park, unpark, lire, prenable }`.
// `etapes` : `Map<number, "backlog" | "cooking" | "pass">`, l'étape courante de chaque ticket. `park(ticket, who, for, until)` range l'étape courante dans la fiche et rend la fiche
// `{ ticket, who, for, until, step }` (`lire(ticket)` la relit, `undefined` si le ticket n'est pas parked). `unpark(ticket, reason)` avec `reason` = "date" | "fact" | "answer"
// remet `etapes` à l'étape sauvée et efface la fiche. `prenable(role, ticket)` avec `role` = "station" | "repair" | "supervisor" dit si ce rôle peut prendre le ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirParked } from "../../src/parked/parked.ts";

test("no station, repair or supervisor picks up a parked ticket before it is unparked", () => {
  const parked = ouvrirParked({ etapes: new Map([[5, "cooking" as const], [6, "backlog" as const]]) });
  const roles = ["station", "repair", "supervisor"] as const;
  for (const role of roles) assert.equal(parked.prenable(role, 5), true, `${role} can take a free ticket`);
  parked.park(5, "chef", "a design choice", "2026-12-01");
  for (const role of roles) {
    assert.equal(parked.prenable(role, 5), false, `${role} must not take a parked ticket`);
    assert.equal(parked.prenable(role, 6), true, `${role} still takes other tickets`);
  }
  parked.unpark(5, "answer");
  for (const role of roles) assert.equal(parked.prenable(role, 5), true, `${role} can take it once unparked`);
});
