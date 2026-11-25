// Admission à la charge (#4210) : la porte de prise de la station GitHub seul
// (`gardesDuTour`, `github-seul/garde-fous/garde-fous.ts`) demande au module
// d'admission avant chaque cook — le premier compris —, sur la machine qu'elle
// vient de lire. Les gardes sont les vraies, sur un vrai runtime ; seule la
// machine est simulée.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { plafondAdmis } from "../../src/admission-charge/admission-charge.ts";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import { gardesDuTour } from "../../src/github-seul/garde-fous/garde-fous.ts";
import { configMachine, type Machine } from "../../src/machine.ts";
import { etatStation } from "../../src/projections/stations.ts";
import { demarrer } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const STATION = "box/claude";
const GO = 1024 * 1024 * 1024;
// La box du 2026-11-23 : 8 cœurs, de la mémoire et du disque à revendre ; seule sa charge bouge.
const BOX = (charge: number): Machine => ({ charge, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: 100 * GO });
const INSTANT = new Date("2026-11-25T09:00:00Z");

function gardes(t: TestContext, lire: () => Machine) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const avertis: string[] = [];
  const tour = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: null, machine: { lire, seuils: configMachine({}) }, maintenant: () => INSTANT, avertir: (texte) => avertis.push(texte) });
  return { tour, avertis, held: () => etatStation(runtime.journal.base, STATION)?.heldReason ?? null };
}

test("a load of 27 on 8 cores defers even the first cook, says so in the log, and the cook is taken once the load drops", async (t) => {
  let charge = 27;
  const { tour, avertis, held } = gardes(t, () => BOX(charge));
  assert.equal(await tour.retenue(0), "machine");
  assert.equal(held(), "machine");
  assert.match(avertis.join("\n"), /admission deferred — a new cook waits on the rail: load of 27 on 8 cores, for at most 13\.2 \(GitHub-only station box\/claude\)/);
  // La réparation de la saturation passe toujours (#4100).
  assert.equal(await tour.retenue(0, 4097), null);
  charge = 1;
  assert.equal(await tour.retenue(0), null);
  assert.equal(held(), null);
});

test("at ease, the machine admits cooks up to the cap its cores allow, and defers the next", async (t) => {
  const { tour, avertis } = gardes(t, () => BOX(0));
  const plafond = plafondAdmis(8);
  assert.equal(await tour.retenue(plafond - 1), null);
  assert.equal(await tour.retenue(plafond), "machine");
  assert.match(avertis.join("\n"), new RegExp(`${plafond} running, for at most ${plafond} on 8 cores`));
});

test("with no cook in flight, a CPU spike within the #4142 margin admits the cook; beyond it, the cook waits", async (t) => {
  let charge = 12.48;
  const { tour } = gardes(t, () => BOX(charge));
  assert.equal(await tour.retenue(0), null);
  charge = 13.5;
  assert.equal(await tour.retenue(0), "machine");
});

test("a machine that cannot be read defers nothing, as before; read again at 27 on 8 cores, it defers the cook", async (t) => {
  let lisible = false;
  const { tour, avertis } = gardes(t, () => {
    if (!lisible) throw new Error("statfs refused");
    return BOX(27);
  });
  assert.equal(await tour.retenue(0), null);
  assert.match(avertis.join("\n"), /could not be read \(statfs refused\)/);
  lisible = true;
  assert.equal(await tour.retenue(0), "machine");
});
