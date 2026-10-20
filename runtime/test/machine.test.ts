// La garde machine : ce que la station lit de la machine, et quand elle la
// tient pour saturée. Aucun test ne dépend de la charge réelle du poste.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configMachine, direSaturation, direSaturationsEn, lireMachine, memoireMinParDefaut, reserver, saturation, saturations, seuilMemoire, type Machine, type Seuils } from "../src/machine.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { repertoireTemporaire } from "./outils.ts";

const GO = 1024 ** 3;
const SEUILS: Seuils = { chargeParCoeur: 1.5, memoireMinMo: 1024, disqueMinMo: 5120 };
// Ce que la station lit quand le chef n'a rien réglé.
const PAR_DEFAUT: Seuils = { ...SEUILS, memoireMinMo: null };
const CALME: Machine = { charge: 2, coeurs: 8, memoireDisponible: 8 * GO, memoireTotale: 16 * GO, disqueLibre: 100 * GO };

test("une machine qui respire ne retient rien", () => {
  assert.equal(saturation(CALME, SEUILS), null);
  assert.deepEqual(saturations(CALME, PAR_DEFAUT), []);
});

test("la charge se compare au nombre de cœurs : au-delà du seuil par cœur, le processeur est en cause", () => {
  assert.equal(saturation({ ...CALME, charge: 12 }, SEUILS), null);
  assert.deepEqual(saturation({ ...CALME, charge: 12.5 }, SEUILS), { resource: "cpu", observed: 12.5, limit: 12 });
});

test("la mémoire et le disque retiennent sous leur minimum, dits en Mo", () => {
  assert.deepEqual(saturation({ ...CALME, memoireDisponible: 0.5 * GO }, SEUILS), { resource: "memory", observed: 512, limit: 1024, limitFrom: "env" });
  assert.deepEqual(saturation({ ...CALME, disqueLibre: 2 * GO }, SEUILS), { resource: "disk", observed: 2048, limit: 5120 });
});

test("un minimum à zéro ne retient jamais", () => {
  assert.equal(saturation({ ...CALME, memoireDisponible: 0, disqueLibre: 0 }, { ...SEUILS, memoireMinMo: 0, disqueMinMo: 0 }), null);
});

test("rien de réglé, le minimum de mémoire dérive de la mémoire totale de la machine : un dixième, un Go au moins", () => {
  assert.deepEqual(seuilMemoire({ memoireTotale: 32 * GO }, PAR_DEFAUT), { mo: 3277, origine: { totalMb: 32768 } });
  assert.deepEqual(seuilMemoire({ memoireTotale: 16 * GO }, PAR_DEFAUT), { mo: 1638, origine: { totalMb: 16384 } });
  assert.deepEqual(seuilMemoire({ memoireTotale: 4 * GO }, PAR_DEFAUT), { mo: 1024, origine: { totalMb: 4096 } });
  assert.equal(memoireMinParDefaut(32050), 3205);
  // Réglé, il l'emporte, quelle que soit la machine.
  assert.deepEqual(seuilMemoire({ memoireTotale: 32 * GO }, SEUILS), { mo: 1024, origine: "env" });
});

test("deux machines de mémoire différente, à la même mémoire disponible : la plus grande retient, la plus petite non", () => {
  const disponible = 2 * GO;
  assert.deepEqual(saturations({ ...CALME, memoireDisponible: disponible, memoireTotale: 32 * GO }, PAR_DEFAUT), [
    { resource: "memory", observed: 2048, limit: 3277, limitFrom: { totalMb: 32768 } },
  ]);
  assert.deepEqual(saturations({ ...CALME, memoireDisponible: disponible, memoireTotale: 16 * GO }, PAR_DEFAUT), []);
});

test("toutes les ressources en cause sont dites, dans l'ordre : processeur, mémoire, disque", () => {
  const pleine = { ...CALME, charge: 18.4, memoireDisponible: 0.8 * GO, memoireTotale: 32 * GO };
  assert.deepEqual(saturations(pleine, PAR_DEFAUT), [
    { resource: "cpu", observed: 18.4, limit: 12 },
    { resource: "memory", observed: 819, limit: 3277, limitFrom: { totalMb: 32768 } },
  ]);
  // La première reste celle que lit qui n'en veut qu'une.
  assert.equal(saturation(pleine, PAR_DEFAUT)?.resource, "cpu");
});

test("une saturation ne se lève qu'avec de la marge : dix pour cent sous le seuil, ou au-dessus du minimum", () => {
  assert.equal(saturation({ ...CALME, charge: 11.5 }, SEUILS)?.resource, undefined);
  assert.equal(saturation({ ...CALME, charge: 11.5 }, SEUILS, "cpu")?.resource, "cpu");
  assert.equal(saturation({ ...CALME, charge: 10.5 }, SEUILS, "cpu"), null);
  assert.equal(saturation({ ...CALME, memoireDisponible: 1.05 * GO }, SEUILS, "memory")?.resource, "memory");
  assert.equal(saturation({ ...CALME, memoireDisponible: 1.05 * GO }, SEUILS, "disk"), null);
  assert.equal(saturation({ ...CALME, disqueLibre: 5.2 * GO }, SEUILS, "disk")?.resource, "disk");
  // Chaque ressource tenue a sa marge.
  const deux = { ...CALME, charge: 11.5, memoireDisponible: 1.05 * GO };
  assert.deepEqual(saturations(deux, SEUILS, ["cpu", "memory"]).map(({ resource }) => resource), ["cpu", "memory"]);
  assert.deepEqual(saturations(deux, SEUILS, ["memory"]).map(({ resource }) => resource), ["memory"]);
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
  assert.match(direSaturation({ resource: "memory", observed: 512, limit: 3277, limitFrom: { totalMb: 32768 } }), /^512 Mo de mémoire disponible pour 3\s277 au moins \(par défaut : 10 % des 32\s768 Mo de la machine\)$/);
  assert.match(direSaturation({ resource: "disk", observed: 2048, limit: 5120 }), /^2\s048 Mo de disque libre pour 5\s120 au moins$/);
});

test("en anglais, les ressources en cause sont nommées, puis chacune avec sa valeur, son seuil et d'où vient celui de la mémoire", () => {
  assert.deepEqual(direSaturationsEn([{ resource: "cpu", observed: 18.44, limit: 12 }]), { ressources: "CPU", detail: "load of 18.4 for at most 12" });
  assert.deepEqual(
    direSaturationsEn([
      { resource: "cpu", observed: 18.44, limit: 12 },
      { resource: "memory", observed: 812, limit: 3277, limitFrom: { totalMb: 32768 } },
    ]),
    { ressources: "CPU and memory", detail: "load of 18.4 for at most 12 · 812 MB of memory available for at least 3,277 MB (default: 10% of the machine's 32,768 MB)" },
  );
  assert.equal(direSaturationsEn([{ resource: "memory", observed: 812, limit: 2000, limitFrom: "env" }]).detail, "812 MB of memory available for at least 2,000 MB (set by BRIGADE_MIN_FREE_MEMORY_MB)");
});

test("les seuils ont un défaut, se règlent par l'environnement, et une valeur illisible est un refus", () => {
  assert.deepEqual(configMachine({}), PAR_DEFAUT);
  assert.deepEqual(configMachine({ BRIGADE_MIN_FREE_MEMORY_MB: "" }), PAR_DEFAUT);
  assert.deepEqual(configMachine({ BRIGADE_MAX_LOAD_PER_CORE: "0.8", BRIGADE_MIN_FREE_MEMORY_MB: "0", BRIGADE_MIN_FREE_DISK_MB: "20000" }), {
    chargeParCoeur: 0.8,
    memoireMinMo: 0,
    disqueMinMo: 20000,
  });
  assert.equal(configMachine({ BRIGADE_MIN_FREE_MEMORY_MB: "4096" }).memoireMinMo, 4096);
  for (const env of [{ BRIGADE_MAX_LOAD_PER_CORE: "0" }, { BRIGADE_MIN_FREE_MEMORY_MB: "-1" }, { BRIGADE_MIN_FREE_DISK_MB: "beaucoup" }]) {
    assert.throws(() => configMachine(env), ConfigInvalide);
  }
});

test("la machine se lit : des cœurs, une charge, de la mémoire et du disque", (t) => {
  const machine = lireMachine(repertoireTemporaire(t));

  assert.equal(machine.coeurs >= 1 && machine.charge >= 0, true);
  assert.equal(machine.memoireDisponible > 0, true);
  assert.equal(machine.memoireTotale >= machine.memoireDisponible, true);
  assert.equal(machine.disqueLibre > 0, true);
});
