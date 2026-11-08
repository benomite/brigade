// La garde d'autonomie de TODO : une demande technique (merge, rebase, rerun)
// n'entre jamais dans la file du chef, elle est renvoyée au triage avec sa
// raison ; une question de produit et une relecture humaine y entrent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../../src/attend.ts";
import { cartesRetenues, entrerDansTodo, type Proposition } from "../../src/carte-todo.ts";
import { refuserDemandeTechnique } from "../../src/garde-todo/garde.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);
const carte = (enonce: string, type = "product"): Proposition => ({
  type,
  resume: "A delivery is waiting on the base.",
  enonce,
  choix: [{ texte: "Yes." }, { texte: "No." }],
});

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  journal.ajouter({
    project: "brigade",
    ticket: 7,
    author: "github",
    type: "ticket.arrived",
    payload: { title: "Ticket 7", priority: null, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/7", card: { waitsFor: [], zone: [], problems: [] } },
  });
  return { journal, todo: () => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT) };
}

for (const [mot, enonce] of [
  ["merge", "Merge PR #2908?"],
  ["rebase", "Rebase branch cook/12-x on main?"],
  ["rerun", "Rerun the CI?"],
  ["rerun", "Please re-run the failing checks?"],
  ["merge", "Can you merge pull request #12?"],
] as const) {
  test(`une carte qui demande « ${enonce} » n'est pas dans le TODO du chef : elle est renvoyée au triage, raison écrite`, (t) => {
    const { journal, todo } = cuisine(t);
    const entree = entrerDansTodo(journal, "brigade", 7, carte(enonce), "manager");
    assert.equal(entree.porte, "triage");
    assert.match(entree.porte === "triage" ? (entree.raison ?? "") : "", new RegExp(`technical ask .*${mot}.*manager or a cook`));
    assert.deepEqual(todo(), []);
    const [retenue] = cartesRetenues(journal.base);
    assert.equal(retenue?.enonce, enonce);
    assert.match(retenue?.refus ?? "", /^technical ask/);
    const [refus] = journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'todo.refused'");
    assert.match(JSON.parse(refus?.payload ?? "{}").reason, /^technical ask/);
  });
}

test("une carte de produit et une demande de relecture humaine entrent toujours dans le TODO", (t) => {
  const { journal, todo } = cuisine(t);
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Which merge strategy should the project use, squash or rebase?"), "manager").porte, "todo");
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Can you review the wording of the new onboarding screen?"), "manager").porte, "todo");
  assert.equal(todo().length, 1);
});

test("la garde ne lit que la question, pas les choix", () => {
  assert.equal(refuserDemandeTechnique({ enonce: "Is the empty rail right?", choix: [{ texte: "Merge PR #1." }] }), null);
});
