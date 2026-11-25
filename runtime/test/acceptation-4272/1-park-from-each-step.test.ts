// Test d'acceptation gelé (#4272), critère 1.
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : `runtime/src/parked/parked.ts` exporte `ouvrirParked({ etapes })` -> `{ park, unpark, lire, prenable }`.
// `etapes` : `Map<number, "backlog" | "cooking" | "pass">`, l'étape courante de chaque ticket. `park(ticket, who, for, until)` range l'étape courante dans la fiche et rend la fiche
// `{ ticket, who, for, until, step }` (`lire(ticket)` la relit, `undefined` si le ticket n'est pas parked). `unpark(ticket, reason)` avec `reason` = "date" | "fact" | "answer"
// remet `etapes` à l'étape sauvée et efface la fiche. `prenable(role, ticket)` avec `role` = "station" | "repair" | "supervisor" dit si ce rôle peut prendre le ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirParked } from "../../src/parked/parked.ts";

test("parking a ticket from backlog, being cooked and at the pass shows who, for what and until when each time", () => {
  const etapes = new Map<number, "backlog" | "cooking" | "pass">([[1, "backlog"], [2, "cooking"], [3, "pass"]]);
  const parked = ouvrirParked({ etapes });
  const cas: [number, string, string, string, string][] = [
    [1, "chef", "a product choice", "2026-12-01", "backlog"],
    [2, "alice", "the API key", "the key is delivered", "cooking"],
    [3, "chef", "a review only the chef can make", "2026-12-10", "pass"],
  ];
  for (const [ticket, who, pour, until, step] of cas) {
    parked.park(ticket, who, pour, until);
    const fiche = parked.lire(ticket);
    assert.equal(fiche?.ticket, ticket);
    assert.equal(fiche?.who, who);
    assert.equal(fiche?.for, pour);
    assert.equal(fiche?.until, until);
    assert.equal(fiche?.step, step);
  }
});
