// Le plus gros consommateur d'une machine saturée (#4090) : lu sur les sorties
// de `du` et de `ps` que le test rend, sans rien lancer — sauf les deux cas
// qui jouent les vrais outils, là où ils existent.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lectures, lireConsommateur } from "../src/consommateur.ts";
import { repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const casse = (): never => {
  throw new Error("boom");
};

const lu = (du: (repertoires: string[]) => string | null, ps: () => string | null = () => "") => lireConsommateur({ repertoires: () => ["/b/espace", "/b/brigade"], du, ps });

test("a saturated disk names the biggest brigade-owned directory, with its size (#4090)", () => {
  let mesures: string[] = [];
  const disque = lu((repertoires) => {
    mesures = repertoires;
    return "3355443\t/b/espace\n120\t/b/brigade\n2048\t/tmp\n";
  });
  assert.deepEqual(disque("disk"), { name: "espace/", amount: "3.2 GB" });
  assert.deepEqual(mesures, ["/b/espace", "/b/brigade"]);
  assert.deepEqual(lu(() => "1048575\t/b/espace\n9\t/home/brigade/.npm\n")("disk"), { name: "espace/", amount: "1024 MB" });
  assert.deepEqual(lu(() => "1048576\t/b/espace\n")("disk"), { name: "espace/", amount: "1.0 GB" });
  assert.deepEqual(lu(() => "9\t/b/espace\r\n4096\t/home/brigade/.npm\r\n")("disk"), { name: ".npm/", amount: "4 MB" });
});

test("a saturated CPU names the process that takes the most of it (#4090)", () => {
  assert.deepEqual(lu(() => "", () => "    1  0.1 systemd\n   42 380.5 node\n  7  12 claude\n")("cpu"), { name: "node (pid 42)", amount: "380.5% CPU" });
});

test("an unreadable source, an empty measure, a missing tool or the memory name nobody (#4090)", () => {
  assert.equal(lu(casse)("disk"), null);
  assert.equal(lu(() => "", casse)("cpu"), null);
  assert.equal(lireConsommateur({ repertoires: casse, du: () => "9\t/b/espace\n", ps: () => "" })("disk"), null);
  assert.equal(lu(() => null)("disk"), null);
  assert.equal(lu(() => "", () => null)("cpu"), null);
  assert.equal(lu(() => "du: cannot read directory\n")("disk"), null);
  assert.equal(lu(() => "", () => "")("cpu"), null);
  assert.equal(lu(() => "9\t/b/espace\n", () => "  7 50 node\n")("memory"), null);
  // Chaque ressource ne lit que sa mesure : un `du` qui échoue laisse le processeur nommé, et l'inverse.
  assert.deepEqual(lu(casse, () => "  7 50 node\n")("cpu"), { name: "node (pid 7)", amount: "50% CPU" });
  assert.deepEqual(lu(() => "9\t/b/espace\n", casse)("disk"), { name: "espace/", amount: "0 MB" });
});

test("the directories measured are the projects' state directories, the station's temporary one and the npm cache — never the whole disk (#4090)", (t) => {
  const box = repertoireTemporaire(t);
  for (const projet of ["brigade", "espace"]) mkdirSync(join(box, projet));
  const env = { TMPDIR: join(box, "tmp"), npm_config_cache: join(box, "cache-npm"), HOME: join(box, "maison") };
  assert.deepEqual([...lectures(join(box, "brigade"), env).repertoires()].sort(), [join(box, "brigade"), join(box, "cache-npm"), join(box, "espace"), join(box, "tmp")].sort());
  // Sans cache npm réglé : celui du compte, sous son HOME.
  assert.deepEqual(lectures(join(box, "brigade"), { TMPDIR: join(box, "tmp"), HOME: join(box, "maison") }).repertoires().at(-1), join(box, "maison", ".npm"));
  // Un parent qui ne se lit pas : seul le répertoire de la station se mesure, avec le temporaire et le cache npm.
  assert.deepEqual(lectures(join(box, "nulle-part", "brigade"), env).repertoires(), [join(box, "nulle-part", "brigade"), join(box, "tmp"), join(box, "cache-npm")]);
});

test("a measuring tool that cannot be launched names nobody (#4090)", (t) => {
  const box = repertoireTemporaire(t);
  const chemin = process.env.PATH;
  process.env.PATH = join(box, "vide");
  try {
    const reel = lireConsommateur({ ...lectures(box, {}), repertoires: () => [box] });
    assert.equal(reel("disk"), null);
    assert.equal(reel("cpu"), null);
  } finally {
    process.env.PATH = chemin;
  }
});

test("the real `du` and `ps` name a directory and a process (#4090)", { skip: posixOnly("`du -sk` and `ps -Ao` are POSIX tools Windows has not: there a saturation names nobody and reads as before") }, (t) => {
  const box = repertoireTemporaire(t);
  mkdirSync(join(box, "espace"));
  const reel = lireConsommateur({ ...lectures(box, {}), repertoires: () => [join(box, "espace"), join(box, "absent")] });
  assert.deepEqual(reel("disk"), { name: "espace/", amount: "0 MB" });
  assert.match(reel("cpu")?.name ?? "", /^\S.* \(pid \d+\)$/);
  assert.match(reel("cpu")?.amount ?? "", /^\d+(\.\d+)?% CPU$/);
});
