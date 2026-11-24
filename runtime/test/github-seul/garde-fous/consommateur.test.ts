// Le plus gros consommateur nommé avec `station.saturated` (#4090) : les gardes
// du tour, sur un vrai runtime, avec une machine que le test rend, et le lecteur
// qu'elle porte.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { LireConsommateur } from "../../../src/consommateur.ts";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { gardesDuTour } from "../../../src/github-seul/garde-fous/garde-fous.ts";
import { configMachine, type Machine } from "../../../src/machine.ts";
import { etatStation } from "../../../src/projections/stations.ts";
import { demarrer } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const STATION = "box/claude";
const GO = 1024 * 1024 * 1024;
// 8 cœurs : au seuil par défaut, la charge retient au-delà de 12, le disque sous 5 120 Mo.
const BOX: Machine = { charge: 16.2, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: 4 * GO };

function gardes(t: TestContext, consommateur?: LireConsommateur) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const avertis: string[] = [];
  const du = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: null, machine: { lire: () => (consommateur === undefined ? BOX : { ...BOX, consommateur }), seuils: configMachine({}) }, avertir: (texte) => avertis.push(texte) });
  const saturees = () => runtime.journal.tout().flatMap((evenement) => (evenement.type === "station.saturated" ? [evenement.payload] : []));
  return { du, avertis, saturees, etat: () => etatStation(runtime.journal.base, STATION) };
}

test("a station saturated on CPU and disk names the top process and the biggest brigade directory: in the journal, the state and the warning (#4090)", async (t) => {
  const { du, avertis, saturees, etat } = gardes(t, (resource) => (resource === "cpu" ? { name: "node (pid 42)", amount: "380% CPU" } : { name: "espace/", amount: "3.2 GB" }));
  assert.equal(await du.retenue(1), "machine");
  assert.deepEqual(saturees(), [
    { station: STATION, resource: "cpu", observed: 16.2, limit: 12, consumer: "node (pid 42) (380% CPU)", also: [{ resource: "disk", observed: 4096, limit: 5120, consumer: "espace/ (3.2 GB)" }] },
  ]);
  assert.deepEqual(etat()?.saturatedCauses.map(({ consumer }) => consumer), ["node (pid 42) (380% CPU)", "espace/ (3.2 GB)"]);
  assert.equal(
    avertis[0],
    `brigade : the machine under GitHub-only station ${STATION} runs short of CPU and disk — load of 16.2 for at most 12 — biggest: node (pid 42) (380% CPU) · 4,096 MB of disk free for at least 5,120 MB — biggest: espace/ (3.2 GB)`);
});

// Sans consommateur nommé, la saturation reste ce qu'elle était, octet pour octet (« byte-for-byte what they are today »).
// brigade:guard
test("a consumer that names nobody, throws or is absent leaves the saturation byte for byte as before (#4090)", async (t) => {
  const AVANT = { station: STATION, resource: "cpu", observed: 16.2, limit: 12, also: [{ resource: "disk", observed: 4096, limit: 5120 }] };
  const DIT = `brigade : the machine under GitHub-only station ${STATION} runs short of CPU and disk — load of 16.2 for at most 12 · 4,096 MB of disk free for at least 5,120 MB`;
  for (const consommateur of [undefined, () => null, () => { throw new Error("ps: not found"); }] as (LireConsommateur | undefined)[]) {
    const { du, avertis, saturees } = gardes(t, consommateur);
    assert.equal(await du.retenue(1), "machine");
    assert.deepEqual(saturees(), [AVANT]);
    assert.equal(avertis[0], DIT);
  }
});
