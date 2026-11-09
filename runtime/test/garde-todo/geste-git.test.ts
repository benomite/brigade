// Le geste git n'est jamais une carte de TODO : un merge, un rebase, un fetch,
// une mise à jour de branche ou une relance ne crée aucune carte, et la
// proposition devient le ticket `fix` de la cuisine ; un vrai choix de produit
// entre toujours.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../../src/attend.ts";
import { brancherLeTriage, cartesRetenues, entrerDansTodo, type Proposition } from "../../src/carte-todo.ts";
import { gesteGit, LABELS_DE_REPARATION } from "../../src/garde-todo/geste-git.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);
const carte = (enonce: string, type = "product"): Proposition => ({ type, resume: "A delivery is waiting on the base.", enonce, choix: [{ texte: "Yes." }, { texte: "No." }] });

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: 7, author: "github", type: "ticket.arrived", payload: { title: "Ticket 7", priority: null, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/7", card: { waitsFor: [], zone: [], problems: [] } } });
  return { journal, todo: () => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT) };
}

for (const [geste, enonce] of [
  ["merge", "Merge PR #2907?"],
  ["rebase", "Rebase cook/12-x on main?"],
  ["fetch", "Fetch origin and tell me when it is done?"],
  ["bring", "Bring origin/main into cook/2914-github?"],
  ["update", "Please update the branch cook/2914-github?"],
  ["rerun", "Rerun the CI?"],
] as const) {
  test(`« ${enonce} » : aucune carte, un ticket fix sur la cuisine (${geste})`, (t) => {
    const { journal, todo } = cuisine(t);
    const entree = entrerDansTodo(journal, "brigade", 7, carte(enonce), "manager");
    assert.equal(entree.porte, "reparation");
    if (entree.porte !== "reparation") return;
    assert.deepEqual(entree.fix.labels, LABELS_DE_REPARATION);
    assert.ok(entree.fix.labels.includes("fix"));
    assert.match(entree.fix.corps, new RegExp(enonce.replace(/[?.]/g, "\\$&")));
    assert.deepEqual(todo(), []);
    assert.deepEqual(cartesRetenues(journal.base), []);
    assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type IN ('todo.entered', 'todo.held')").length, 0);
    assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type = 'todo.rerouted'").length, 1);
  });
}

test("un geste git est détourné même quand le triage retient les cartes", (t) => {
  const { journal } = cuisine(t);
  aArreter(t, brancherLeTriage(journal.base, () => true));
  assert.equal(gesteGit(carte("Merge PR #2907?")), "merge");
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Merge PR #2907?"), "manager").porte, "reparation");
});

test("une vraie décision de produit entre toujours dans le TODO", (t) => {
  const { journal, todo } = cuisine(t);
  for (const enonce of ["Which merge strategy should the project use, squash or rebase?", "Should the export be CSV or JSON?"]) {
    assert.equal(gesteGit(carte(enonce)), null);
  }
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Should the export be CSV or JSON?"), "manager").porte, "todo");
  assert.equal(todo().length, 1);
  assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type = 'todo.rerouted'").length, 0);
});
