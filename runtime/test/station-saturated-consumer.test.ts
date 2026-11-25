// Le consommateur nommé d'une saturation (#4090), tel que l'état de la station et `status` le relisent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatStation } from "../src/projections/stations.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

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

test("`status` shows no saturation line, whatever the saturation journal says: the machine holds nothing (#4285)", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (type: string, payload: Record<string, unknown>) => journal.ajouter({ project: "brigade", ticket: null, author: `station:${STATION}`, type, payload } as never);
  noter("station.announced", { station: STATION, engine: "claude", provides: ["code"], maxCooks: 30, cores: 8 });
  noter("station.saturated", { station: STATION, resource: "disk", observed: 4096, limit: 5120, consumer: "espace/ (3.2 GB)", also: [{ resource: "cpu", observed: 13, limit: 12, consumer: "node (pid 42) (380% CPU)" }] });
  const maintenant = new Date(`${JOUR_HORLOGE}T10:03:02.000Z`);
  assert.deepEqual(decrireEtat(lireEtat(journal, maintenant), maintenant).filter((ligne) => /SATURATED/.test(ligne)), []);
});
