// #3914, critère 3 : l'entrée du manager tient la file, la queue du journal, l'étape de CI en échec avec ses lignes de
// log, et l'historique du ticket fautif.
import assert from "node:assert/strict";
import { test } from "node:test";
import { composerDossier } from "../../src/superviseur/dossier.ts";

test("the manager input holds the queue, the journal tail, the failing CI step with its log lines and the ticket history", async () => {
  const lectures = {
    file: async () => [{ ticket: 41, titre: "Queued ticket forty-one" }],
    queueDuJournal: async (lignes: number) => [`journal-line-a (last ${lignes})`, "journal-line-b"],
    etapeEnEchec: async () => ({ etape: "unit tests", lignes: ["log-line-1 boom", "log-line-2 stack"] }),
    historique: async (ticket: number) => [`#${ticket} taken by cook one`, `#${ticket} taken by cook two`],
  };
  const dossier = await composerDossier({ lectures, ticketFautif: 42, lignesDeJournal: 50 });
  assert.deepEqual(dossier.file, [{ ticket: 41, titre: "Queued ticket forty-one" }]);
  assert.deepEqual(dossier.journal, ["journal-line-a (last 50)", "journal-line-b"]);
  assert.deepEqual(dossier.ci, { etape: "unit tests", lignes: ["log-line-1 boom", "log-line-2 stack"] });
  assert.deepEqual(dossier.historique, ["#42 taken by cook one", "#42 taken by cook two"]);
  for (const attendu of ["Queued ticket forty-one", "journal-line-b", "unit tests", "log-line-2 stack", "taken by cook two"]) {
    assert.match(dossier.texte, new RegExp(attendu), `the text given to the manager holds "${attendu}"`);
  }
});
