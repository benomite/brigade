// La garde machine : ce que la station lit de la machine, et quand elle la
// tient pour saturée. Aucun test ne dépend de la charge réelle du poste.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configMachine, direSaturation, lireMachine, reserver, saturation, type Machine } from "../src/machine.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

const GO = 1024 ** 3;
const SEUILS = { chargeParCoeur: 1.5, memoireMinMo: 1024, disqueMinMo: 5120 };
const CALME: Machine = { charge: 2, coeurs: 8, memoireDisponible: 8 * GO, disqueLibre: 100 * GO };

test("une machine qui respire ne retient rien", () => {
  assert.equal(saturation(CALME, SEUILS), null);
});

test("la charge se compare au nombre de cœurs : au-delà du seuil par cœur, le processeur est en cause", () => {
  assert.equal(saturation({ ...CALME, charge: 12 }, SEUILS), null);
  assert.deepEqual(saturation({ ...CALME, charge: 12.5 }, SEUILS), { resource: "cpu", observed: 12.5, limit: 12 });
});

test("la mémoire et le disque retiennent sous leur minimum, dits en Mo", () => {
  assert.deepEqual(saturation({ ...CALME, memoireDisponible: 0.5 * GO }, SEUILS), { resource: "memory", observed: 512, limit: 1024 });
  assert.deepEqual(saturation({ ...CALME, disqueLibre: 2 * GO }, SEUILS), { resource: "disk", observed: 2048, limit: 5120 });
});

test("un minimum à zéro ne retient jamais", () => {
  assert.equal(saturation({ ...CALME, memoireDisponible: 0, disqueLibre: 0 }, { ...SEUILS, memoireMinMo: 0, disqueMinMo: 0 }), null);
});

test("une saturation ne se lève qu'avec de la marge : dix pour cent sous le seuil, ou au-dessus du minimum", () => {
  assert.equal(saturation({ ...CALME, charge: 11.5 }, SEUILS)?.resource, undefined);
  assert.equal(saturation({ ...CALME, charge: 11.5 }, SEUILS, "cpu")?.resource, "cpu");
  assert.equal(saturation({ ...CALME, charge: 10.5 }, SEUILS, "cpu"), null);
  assert.equal(saturation({ ...CALME, memoireDisponible: 1.05 * GO }, SEUILS, "memory")?.resource, "memory");
  assert.equal(saturation({ ...CALME, memoireDisponible: 1.05 * GO }, SEUILS, "disk"), null);
  assert.equal(saturation({ ...CALME, disqueLibre: 5.2 * GO }, SEUILS, "disk")?.resource, "disk");
});

test("un cook tout juste parti pèse d'avance : une unité de charge et 512 Mo, que la machine ne montre pas encore", () => {
  assert.deepEqual(reserver(CALME, 3), { ...CALME, charge: 5, memoireDisponible: 6.5 * GO });
  assert.equal(saturation(reserver(CALME, 10), SEUILS), null);
  assert.equal(saturation(reserver(CALME, 11), SEUILS)?.resource, "cpu");
  assert.equal(saturation(reserver({ ...CALME, coeurs: 64 }, 15), SEUILS)?.resource, "memory");
});

test("une saturation se lit avec ce qui est observé et ce qui est exigé", () => {
  assert.equal(direSaturation({ resource: "cpu", observed: 16.24, limit: 15 }), "charge de 16,2 pour 15 au plus");
  assert.match(direSaturation({ resource: "memory", observed: 512, limit: 1024 }), /^512 Mo de mémoire disponible pour 1\s024 au moins$/);
  assert.match(direSaturation({ resource: "disk", observed: 2048, limit: 5120 }), /^2\s048 Mo de disque libre pour 5\s120 au moins$/);
});

test("les seuils ont un défaut, se règlent par l'environnement, et une valeur illisible est un refus", () => {
  assert.deepEqual(configMachine({}), SEUILS);
  assert.deepEqual(configMachine({ BRIGADE_MAX_LOAD_PER_CORE: "0.8", BRIGADE_MIN_FREE_MEMORY_MB: "0", BRIGADE_MIN_FREE_DISK_MB: "20000" }), {
    chargeParCoeur: 0.8,
    memoireMinMo: 0,
    disqueMinMo: 20000,
  });
  for (const env of [{ BRIGADE_MAX_LOAD_PER_CORE: "0" }, { BRIGADE_MIN_FREE_MEMORY_MB: "-1" }, { BRIGADE_MIN_FREE_DISK_MB: "beaucoup" }]) {
    assert.throws(() => configMachine(env), ConfigInvalide);
  }
});

test("la machine se lit : des cœurs, une charge, de la mémoire et du disque", (t) => {
  const machine = lireMachine(repertoireTemporaire(t));

  assert.equal(machine.coeurs >= 1 && machine.charge >= 0, true);
  assert.equal(machine.memoireDisponible > 0, true);
  assert.equal(machine.disqueLibre > 0, true);
});
