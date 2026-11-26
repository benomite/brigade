// La carte du disque plein que pose la garde de la station (#4091) est une panne de la machine arrivée au chef : elle
// est notée avec sa date, et compte dans les sept jours de la veille du blocage (#4213).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import type { Pose } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { gardesDuTour } from "../../src/github-seul/garde-fous/garde-fous.ts";
import { configMachine, type Machine } from "../../src/machine.ts";
import { demarrer } from "../../src/runtime.ts";
import { outagesInLastSevenDays } from "../../src/stall-watchdog/watchdog.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const GO = 1024 * 1024 * 1024;
const DISQUE_PLEIN: Machine = { charge: 0, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: 2 * GO };
const NOW = new Date("2026-11-25T12:00:00.000Z");

async function poserLaCarte(t: TestContext, pose: Pose) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  let poses = 0;
  const avertis: string[] = [];
  const gardes = gardesDuTour({
    garde: runtime,
    station: "box/claude",
    repertoireEtat: repertoire,
    arbitre: null,
    machine: { lire: () => DISQUE_PLEIN, seuils: configMachine({}) },
    disquePlein: { sonder: async () => ({ propre: 0, consommateurs: [] }), poser: async () => (poses++, pose), lever: async () => {} },
    maintenant: () => NOW,
    avertir: (texte) => void avertis.push(texte),
  });
  await gardes.retenue(0);
  // La garde le dit une fois la carte posée et notée.
  await jusqua(() => poses === 1 && avertis.some((texte) => /a TODO card tells the chef/.test(texte)));
  return { repertoire, avertis };
}

test("the disk card the station guard posts is a machine outage, dated, counted in the week", async (t) => {
  const { repertoire, avertis } = await poserLaCarte(t, "posee");
  assert.equal(outagesInLastSevenDays(repertoire, NOW.getTime()), 1);
  assert.ok(avertis.some((texte) => texte.includes("(1 machine outage(s) reached the chef in the last 7 days)")));
});

test("a disk card that was already there is no new outage", async (t) => {
  const { repertoire, avertis } = await poserLaCarte(t, "deja");
  assert.equal(outagesInLastSevenDays(repertoire, NOW.getTime()), 0);
  assert.ok(avertis.some((texte) => texte.includes("(0 machine outage(s) reached the chef in the last 7 days)")));
});
