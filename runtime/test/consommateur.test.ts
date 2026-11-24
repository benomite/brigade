// Le plus gros consommateur d'une machine saturée (#4090) : lu sur les sorties
// de `du` et de `ps` que le test rend, sans rien lancer.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lectures, lireConsommateur } from "../src/consommateur.ts";
import { lireMachine } from "../src/machine.ts";
import { repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const casse = (): never => {
  throw new Error("boom");
};

const lu = (du: (repertoires: string[]) => string, ps: () => string = () => "") => lireConsommateur({ repertoires: () => ["/b/espace", "/b/brigade"], du, ps });

test("a saturated disk names the biggest brigade-owned directory, with its size (#4090)", () => {
  let mesures: string[] = [];
  const disque = lu((repertoires) => {
    mesures = repertoires;
    return "3355443\t/b/espace\n120\t/b/brigade\n2048\t/tmp\n";
  });
  assert.deepEqual(disque("disk"), { name: "espace/", amount: "3.2 GB" });
  assert.deepEqual(mesures, ["/b/espace", "/b/brigade"]);
  assert.deepEqual(lu(() => "1048575\t/b/espace\n9\t/home/brigade/.npm\n")("disk"), { name: "espace/", amount: "1024 MB" });
  assert.deepEqual(lu(() => "9\t/b/espace\n4096\t/home/brigade/.npm\n")("disk"), { name: ".npm/", amount: "4 MB" });
});

test("a saturated CPU names the process that takes the most of it (#4090)", () => {
  assert.deepEqual(lu(() => "", () => "    1  0.1 systemd\n   42 380.5 node\n  7  12 claude\n")("cpu"), { name: "node (pid 42)", amount: "380.5% CPU" });
});

test("an unreadable source, an empty measure or the memory name nobody (#4090)", () => {
  assert.equal(lu(casse)("disk"), null);
  assert.equal(lu(() => "", casse)("cpu"), null);
  assert.equal(lireConsommateur({ repertoires: casse, du: () => "9\t/b/espace\n", ps: () => "" })("disk"), null);
  assert.equal(lu(() => "du: cannot read directory\n")("disk"), null);
  assert.equal(lu(() => "", () => "")("cpu"), null);
  assert.equal(lu(() => "9\t/b/espace\n", () => "  7 50 node\n")("memory"), null);
  // Chaque ressource ne lit que sa mesure : un `du` qui échoue laisse le processeur nommé.
  assert.deepEqual(lu(casse, () => "  7 50 node\n")("cpu"), { name: "node (pid 7)", amount: "50% CPU" });
});

test("the directories measured are the projects' state directories, the station's temporary one and the npm cache — never the whole disk (#4090)", (t) => {
  const box = repertoireTemporaire(t);
  for (const projet of ["brigade", "espace"]) mkdirSync(join(box, projet));
  const repertoires = lectures(join(box, "brigade"), { npm_config_cache: join(box, "cache-npm") }).repertoires();
  assert.deepEqual([...repertoires].sort(), [join(box, "brigade"), join(box, "cache-npm"), join(box, "espace"), tmpdir()].sort());
  // Un parent qui ne se lit pas : seul le répertoire de la station se mesure, avec le temporaire et le cache npm.
  assert.deepEqual(lectures(join(box, "nulle-part", "brigade"), { npm_config_cache: join(box, "cache-npm") }).repertoires(), [join(box, "nulle-part", "brigade"), tmpdir(), join(box, "cache-npm")]);
});

test("the real `du` measures what it can read, and a directory it cannot read names nobody (#4090)", (t) => {
  const box = repertoireTemporaire(t);
  mkdirSync(join(box, "espace"));
  const reel = lectures(join(box, "espace"), {});
  assert.deepEqual(lireConsommateur({ ...reel, repertoires: () => [join(box, "espace")] })("disk"), { name: "espace/", amount: "0 MB" });
  assert.equal(lireConsommateur({ ...reel, repertoires: () => [join(box, "absent")] })("disk"), null);
});

test("the machine read for real carries the real reader: the top process of `ps` names the CPU, nobody names the memory (#4090)", { skip: posixOnly("reads the real `ps`, which Windows does not have: its CPU reader names nobody there") }, (t) => {
  const { consommateur } = lireMachine(repertoireTemporaire(t));
  assert.match(consommateur?.("cpu")?.name ?? "", /^\S.* \(pid \d+\)$/);
  assert.match(consommateur?.("cpu")?.amount ?? "", /^\d+(\.\d+)?% CPU$/);
  assert.equal(consommateur?.("memory"), null);
});
