// Test d'acceptation gelé (#4272), critère 2.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : `runtime/src/parked/parked.ts` exporte `ouvrirParked({ etapes })` -> `{ park, unpark, lire, prenable }`.
// `etapes` : `Map<number, "backlog" | "cooking" | "pass">`, l'étape courante de chaque ticket. `park(ticket, who, for, until)` range l'étape courante dans la fiche et rend la fiche
// `{ ticket, who, for, until, step }` (`lire(ticket)` la relit, `undefined` si le ticket n'est pas parked). `unpark(ticket, reason)` avec `reason` = "date" | "fact" | "answer"
// remet `etapes` à l'étape sauvée et efface la fiche. `prenable(role, ticket)` avec `role` = "station" | "repair" | "supervisor" dit si ce rôle peut prendre le ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirParked } from "../../src/parked/parked.ts";

test("a ticket unparked by date, by fact and by answer returns to the exact step it had before it was parked", () => {
  for (const reason of ["date", "fact", "answer"] as const) {
    for (const step of ["backlog", "cooking", "pass"] as const) {
      const etapes = new Map<number, "backlog" | "cooking" | "pass">([[7, step]]);
      const parked = ouvrirParked({ etapes });
      parked.park(7, "chef", "a decision", "2026-12-01");
      etapes.set(7, "backlog");
      parked.unpark(7, reason);
      assert.equal(etapes.get(7), step, `${reason} from ${step}`);
      assert.equal(parked.lire(7), undefined, "no longer parked");
    }
  }
});
