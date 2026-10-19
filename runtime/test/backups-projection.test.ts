// La dernière sauvegarde réussie, telle que le journal la raconte.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { openLog } from "../src/log.ts";
import { lastBackup } from "../src/projections/backups.ts";
import { horloge, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

function kitchen(t: TestContext) {
  const log = openLog(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => log.fermer());
  const backup = (name: string, lastSeq: number) =>
    log.ajouter({ project: "brigade", ticket: null, author: "sauvegarde", type: "backup.completed", payload: { name, lastSeq, events: lastSeq, streams: 0 } });
  return { base: log.base, sauvegarder: backup };
}

test("un projet jamais sauvegardé n'a pas de dernière sauvegarde", (t) => {
  assert.equal(lastBackup(kitchen(t).base), null);
});

test("la dernière sauvegarde se lit avec sa date, son nom et l'événement jusqu'où elle va ; la suivante la remplace", (t) => {
  const { base, sauvegarder: backup } = kitchen(t);
  backup("2026-10-07T03-30-00Z", 3);

  assert.deepEqual(lastBackup(base), { at: `${JOUR_HORLOGE}T10:00:00.000Z`, name: "2026-10-07T03-30-00Z", lastSeq: 3 });

  backup(`${JOUR_HORLOGE}T03-30-00Z`, 9);

  assert.deepEqual(lastBackup(base), { at: `${JOUR_HORLOGE}T10:00:01.000Z`, name: `${JOUR_HORLOGE}T03-30-00Z`, lastSeq: 9 });
});
