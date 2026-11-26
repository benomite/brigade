// #4272 : la fiche parked — `{ ticket, who, for, until, step }` —, ce que `park` rend, la reprise à l'étape rangée quand
// l'étape a bougé entre-temps, les refus, et la fiche lue d'une issue GitHub (`ficheDeLIssue`, `parkedDuTour`) que la
// prise de la station, la réparation et les gestes du superviseur lisent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/marque.ts";
import { parquerLaPanne } from "../../src/parked/panne.ts";
import { ficheDeLIssue, ouvrirParked, parkedDuTour, type Etape } from "../../src/parked/parked.ts";

const AUTEUR = { association: "OWNER" };

test("park returns the card it writes, with the step it was at", () => {
  const parked = ouvrirParked({ etapes: new Map<number, Etape>([[1, "pass"]]) });
  const fiche = parked.park(1, "alice", "the API key", "the key is delivered");
  assert.deepEqual(fiche, { ticket: 1, who: "alice", for: "the API key", until: "the key is delivered", step: "pass" });
  assert.deepEqual(parked.lire(1), fiche);
});

test("unpark puts back the saved step even when the step moved meanwhile, for each reason", () => {
  for (const reason of ["date", "fact", "answer"] as const) {
    for (const [step, ailleurs] of [["backlog", "pass"], ["cooking", "backlog"], ["pass", "cooking"]] as const) {
      const etapes = new Map<number, Etape>([[7, step]]);
      const parked = ouvrirParked({ etapes });
      parked.park(7, "chef", "a decision", "2026-12-01");
      etapes.set(7, ailleurs);
      assert.equal(parked.unpark(7, reason)?.step, step);
      assert.equal(etapes.get(7), step, `${reason} from ${step}`);
    }
  }
});

test("a ticket is not parked twice, nor without who, for what, until when, nor at no step; unparking a free ticket does nothing", () => {
  const etapes = new Map<number, Etape>([[3, "cooking"]]);
  const parked = ouvrirParked({ etapes });
  assert.throws(() => parked.park(3, " ", "x", "y"), /who/);
  assert.throws(() => parked.park(3, "chef", "", "y"), /for what/);
  assert.throws(() => parked.park(3, "chef", "x", ""), /until when/);
  assert.throws(() => parked.park(99, "chef", "x", "y"), /no step/);
  parked.park(3, "chef", "x", "y");
  etapes.set(3, "pass");
  assert.throws(() => parked.park(3, "bob", "z", "w"), /already parked/);
  assert.equal(parked.lire(3)?.step, "cooking", "the first card holds its step");
  assert.equal(parked.unpark(4, "date"), undefined);
});

test("a fault parks the ticket on the chef until the chef answers, from any step", () => {
  for (const step of ["backlog", "cooking", "pass"] as const) {
    const parked = ouvrirParked({ etapes: new Map([[9, step]]) });
    const fiche = parquerLaPanne({ parked, ticket: 9, texte: "frozen ticket #9 holds the file zone runtime/src/x/" });
    assert.deepEqual(fiche, { ticket: 9, who: "chef", for: "frozen ticket #9 holds the file zone runtime/src/x/", until: "the chef answers", step });
    assert.equal(parked.prenable("station", 9), false);
  }
});

test("the card of a GitHub issue: who, for what, until when from its marked comment, the step from its labels", () => {
  const pourUnTiers = corpsDuParking({ what: "the API key", who: "the client", followUp: "2026-12-01T10:00:00.000Z", fact: "the client sends the key" });
  assert.deepEqual(ficheDeLIssue(4, ["fire", "taken", "parked"], [{ body: pourUnTiers, ...AUTEUR }]), { ticket: 4, who: "the client", for: "the API key", until: "the client sends the key", step: "cooking" });
  const pourLeChef = corpsDuParking({ what: "which column order", who: "the chef", followUp: "2026-12-01T10:00:00.000Z" });
  assert.deepEqual(ficheDeLIssue(5, ["fire", "in-pass", "chef-todo"], [{ body: pourLeChef, ...AUTEUR }]), { ticket: 5, who: "chef", for: "which column order", until: "2026-12-01 10:00 UTC", step: "pass" });
  // Sans commentaire marqué d'un auteur du dépôt, rien n'est inventé.
  assert.deepEqual(ficheDeLIssue(6, ["parked"], [{ body: pourUnTiers, association: "NONE" }]), { ticket: 6, who: null, for: null, until: null, step: "backlog" });
  assert.equal(ficheDeLIssue(7, ["fire", "taken"], []), undefined);
});

test("the card of a station turn: parked issues are taken by no role, the others by every role", () => {
  const parked = parkedDuTour([
    { number: 1, labels: ["fire", "parked"] },
    { number: 2, labels: ["chef-todo"] },
    { number: 3, labels: ["fire", "taken"] },
  ]);
  for (const role of ["station", "repair", "supervisor"] as const) {
    assert.equal(parked.prenable(role, 1), false, role);
    assert.equal(parked.prenable(role, 2), false, role);
    assert.equal(parked.prenable(role, 3), true, role);
  }
  assert.equal(parked.lire(1)?.step, "backlog");
});
