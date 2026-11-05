// Les durées des runs de CI, des gates et des tests de chaque projet, que la
// station retient (#2348) : par genre, dans l'ordre, les 200 dernières, sous
// l'état du projet — et jamais celles d'un autre projet.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DUREES_GARDEES, enregistrerDuree, fichierDesDurees, lireDurees, noterDureeDeLaCi, noterDureeDesGates, noterDureeEntre } from "../src/lenteur/durees.ts";
import { ETATS } from "../src/station/configuration.ts";
import { repertoireTemporaire } from "./outils.ts";

test("les durées d'un projet se relisent par genre, la plus récente en dernier, et seules les 200 dernières de chaque genre restent", (t) => {
  const ou = { env: { BRIGADE_STATION_DIR: repertoireTemporaire(t) } };
  assert.deepEqual(lireDurees("web", ou), { ci: [], gates: [], tests: [] });
  assert.equal(enregistrerDuree("web", "ci", 312.5, ou), true);
  assert.equal(enregistrerDuree("web", "gates", 41, ou), true);
  assert.equal(enregistrerDuree("web", "tests", 18.25, ou), true);
  assert.equal(enregistrerDuree("web", "ci", 290, ou), true);
  assert.deepEqual(lireDurees("web", ou), { ci: [312.5, 290], gates: [41], tests: [18.25] });

  for (let i = 0; i < DUREES_GARDEES + 5; i++) enregistrerDuree("web", "gates", i, ou);
  const { ci, gates, tests } = lireDurees("web", ou);
  assert.equal(DUREES_GARDEES, 200);
  assert.equal(gates.length, 200);
  // Les plus anciennes sont tombées : 41, puis 0 à 4.
  assert.deepEqual(gates.slice(0, 2), [5, 6]);
  assert.equal(gates.at(-1), DUREES_GARDEES + 4);
  // Le plafond d'un genre ne touche pas les autres.
  assert.deepEqual(ci, [312.5, 290]);
  assert.deepEqual(tests, [18.25]);
});

test("une durée invalide, un genre inconnu ou un nom de projet qui sortirait de l'état ne s'écrit pas, sans lever", (t) => {
  const station = repertoireTemporaire(t);
  const ou = { env: { BRIGADE_STATION_DIR: station } };
  assert.equal(enregistrerDuree("web", "ci", -1, ou), false);
  assert.equal(enregistrerDuree("web", "ci", Number.NaN, ou), false);
  assert.equal(enregistrerDuree("web", "ci", Number.POSITIVE_INFINITY, ou), false);
  assert.equal(enregistrerDuree("web", "build" as "ci", 3, ou), false);
  assert.equal(enregistrerDuree("../web", "ci", 3, ou), false);
  assert.deepEqual(lireDurees("web", ou), { ci: [], gates: [], tests: [] });
  assert.equal(existsSync(join(station, ETATS)), false);
  // Ni station ni état du projet : rien n'est retenu, rien ne lève.
  assert.equal(enregistrerDuree("web", "ci", 3, { env: {} }), false);
  assert.equal(enregistrerDuree("web", "ci", 3, { env: { BRIGADE_STATE_DIR: station, BRIGADE_PROJECT: "shop" } }), false);
});

test("les durées survivent au redémarrage de la station : elles sont dans le fichier, sous l'état du projet, et un module neuf les relit", async (t) => {
  const station = repertoireTemporaire(t);
  const ou = { env: { BRIGADE_STATION_DIR: station } };
  enregistrerDuree("web", "ci", 120, ou);
  enregistrerDuree("web", "tests", 9.5, ou);
  enregistrerDuree("web", "tests", 11, ou);

  const fichier = join(station, ETATS, "web", "durees.json");
  assert.equal(fichierDesDurees("web", ou), fichier);
  assert.deepEqual(JSON.parse(readFileSync(fichier, "utf8")), { ci: [120], gates: [], tests: [9.5, 11] });

  // Une instance du module qui n'a rien vu passer : la station redémarrée.
  const neuf = (await import(new URL("../src/lenteur/durees.ts?redemarrage", import.meta.url).href)) as typeof import("../src/lenteur/durees.ts");
  assert.deepEqual(neuf.lireDurees("web", ou), { ci: [120], gates: [], tests: [9.5, 11] });
  assert.equal(neuf.enregistrerDuree("web", "gates", 30, ou), true);
  assert.deepEqual(lireDurees("web", ou), { ci: [120], gates: [30], tests: [9.5, 11] });
});

test("un fichier illisible se lit vide, et ce qui y est retenu ensuite repart de zéro", (t) => {
  const station = repertoireTemporaire(t);
  const ou = { env: { BRIGADE_STATION_DIR: station } };
  mkdirSync(join(station, ETATS, "web"), { recursive: true });
  writeFileSync(join(station, ETATS, "web", "durees.json"), "{ tronqué");
  assert.deepEqual(lireDurees("web", ou), { ci: [], gates: [], tests: [] });
  assert.equal(enregistrerDuree("web", "ci", 7, ou), true);
  assert.deepEqual(lireDurees("web", ou), { ci: [7], gates: [], tests: [] });
});

test("deux projets de la même station ne voient jamais les durées l'un de l'autre", (t) => {
  const ou = { env: { BRIGADE_STATION_DIR: repertoireTemporaire(t) } };
  enregistrerDuree("web", "ci", 300, ou);
  enregistrerDuree("web", "gates", 40, ou);
  enregistrerDuree("shop", "ci", 60, ou);
  enregistrerDuree("shop", "tests", 5, ou);
  assert.deepEqual(lireDurees("web", ou), { ci: [300], gates: [40], tests: [] });
  assert.deepEqual(lireDurees("shop", ou), { ci: [60], gates: [], tests: [5] });
  assert.deepEqual(lireDurees("blog", ou), { ci: [], gates: [], tests: [] });
  assert.notEqual(fichierDesDurees("web", ou), fichierDesDurees("shop", ou));
});

test("hors station, le process retient les durées de son seul projet, dans son répertoire d'état", (t) => {
  const etat = repertoireTemporaire(t);
  const ou = { env: { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "web" } };
  assert.equal(enregistrerDuree("web", "gates", 12, ou), true);
  assert.equal(fichierDesDurees("web", ou), join(etat, "durees.json"));
  assert.deepEqual(lireDurees("web", ou), { ci: [], gates: [12], tests: [] });
  assert.deepEqual(lireDurees("shop", ou), { ci: [], gates: [], tests: [] });
});

test("les crochets des gates et des tests retiennent ce que leurs sites ont déjà dans les mains", (t) => {
  const ou = { env: { BRIGADE_STATION_DIR: repertoireTemporaire(t) } };
  // Un passage des gates et ce qu'il a coûté, tel que `jouerGatesMesurees` le rend.
  assert.equal(noterDureeDesGates("web", { durationMs: 41_250, cpuMs: 90_000 }, ou), true);
  // Le setup en échec : les gates n'ont pas tourné.
  assert.equal(noterDureeDesGates("web", null, ou), false);
  // Des tests, de leur lancement à leur résultat.
  assert.equal(noterDureeEntre("web", "tests", "2026-11-05T10:00:00.000Z", "2026-11-05T10:00:18.500Z", ou), true);
  assert.equal(noterDureeEntre("web", "tests", new Date("2026-11-05T10:01:00Z"), Date.parse("2026-11-05T10:01:03Z"), ou), true);
  assert.equal(noterDureeEntre("web", "tests", "2026-11-05T10:00:05Z", "2026-11-05T10:00:00Z", ou), false);
  assert.equal(noterDureeEntre("web", "tests", "jamais", "2026-11-05T10:00:00Z", ou), false);
  assert.deepEqual(lireDurees("web", ou), { ci: [], gates: [41.25], tests: [18.5, 3] });
});

test("le crochet de la CI retient un run fini une fois par commit, même relu après un redémarrage", async (t) => {
  const station = repertoireTemporaire(t);
  const ou = { env: { BRIGADE_STATION_DIR: station } };
  const sha = "a".repeat(40);
  const jobs = [
    { started_at: "2026-11-05T10:00:00Z", completed_at: "2026-11-05T10:03:00Z" },
    { started_at: "2026-11-05T10:00:30Z", completed_at: "2026-11-05T10:05:12Z" },
  ];
  // Un job qui tourne encore : la CI n'est pas finie.
  assert.equal(noterDureeDeLaCi("web", sha, [jobs[0]!, { started_at: "2026-11-05T10:00:30Z", completed_at: null }], ou), false);
  assert.equal(noterDureeDeLaCi("web", sha, [], ou), false);
  assert.equal(noterDureeDeLaCi("web", sha, jobs, ou), true);
  // Le sondage suivant relit la même CI : elle est déjà comptée.
  assert.equal(noterDureeDeLaCi("web", sha, jobs, ou), false);
  const neuf = (await import(new URL("../src/lenteur/durees.ts?redemarrage-ci", import.meta.url).href)) as typeof import("../src/lenteur/durees.ts");
  assert.equal(neuf.noterDureeDeLaCi("web", sha, jobs, ou), false);
  // Un autre commit, ou le même commit sur un autre projet, compte.
  assert.equal(noterDureeDeLaCi("web", "b".repeat(40), jobs.slice(0, 1), ou), true);
  assert.equal(noterDureeDeLaCi("shop", sha, jobs, ou), true);
  assert.deepEqual(lireDurees("web", ou), { ci: [312, 180], gates: [], tests: [] });
  assert.deepEqual(lireDurees("shop", ou), { ci: [312], gates: [], tests: [] });
  // Les autres genres s'écrivent sans rien oublier des commits vus.
  enregistrerDuree("web", "gates", 7, ou);
  assert.equal(noterDureeDeLaCi("web", sha, jobs, ou), false);
});
