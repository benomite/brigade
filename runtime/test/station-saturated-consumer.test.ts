// Le consommateur nommé d'une saturation (#4090), tel que l'état de la station le relit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { etatStation } from "../src/projections/stations.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";

test("a named consumer is read back with its cause, an empty or unreadable one is dropped (#4090)", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (payload: Record<string, unknown>) =>
    journal.ajouter({ project: "brigade", ticket: null, author: `station:${STATION}`, type: "station.saturated", payload } as never);
  noter({ station: STATION, resource: "disk", observed: 4096, limit: 5120, consumer: "espace/ (3200 MB)" });
  assert.deepEqual(etatStation(journal.base, STATION)?.saturatedCauses, [{ resource: "disk", observed: 4096, limit: 5120, consumer: "espace/ (3200 MB)" }]);
  noter({ station: STATION, resource: "disk", observed: 4096, limit: 5120, consumer: "" });
  assert.deepEqual(etatStation(journal.base, STATION)?.saturatedCauses, [{ resource: "disk", observed: 4096, limit: 5120 }]);
  noter({ station: STATION, resource: "cpu", observed: 13, limit: 12, consumer: 42 });
  assert.deepEqual(etatStation(journal.base, STATION)?.saturatedCauses, [{ resource: "cpu", observed: 13, limit: 12 }]);
});
