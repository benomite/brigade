// La couverture propre de chaque test : des suites d'exemple jouées sous le
// vrai lanceur avec le crochet de mesure, le rapport qu'on en tire, et la
// commande qui joue une zone entière et l'écrit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { principal } from "../../../src/valeur-tests/couverture/mesurer-cli.ts";
import { assembler, Couverture, lireCouverture, lireMesures, RapportIlisible, TestInconnu } from "../../../src/valeur-tests/couverture/rapport.ts";
import { appeler, ENV_ENFANT, jusqua, repertoireTemporaire, vivant } from "../../outils.ts";

const RUNTIME = join(import.meta.dirname, "../../..");
const EXEMPLES = join(import.meta.dirname, "exemples");
const CROCHET = pathToFileURL(join(RUNTIME, "src/valeur-tests/couverture/crochet.ts")).href;
const TOUR = { date: new Date("2026-10-21T10:00:00Z"), commit: "c0ffee", suites: [] };

// Joue des suites d'exemple avec le crochet, les chemins comptés depuis les
// exemples, et rend leur couverture.
function mesurer(t: TestContext, ...suites: string[]): Couverture {
  const dossier = repertoireTemporaire(t);
  const lance = spawnSync(process.execPath, ["--import", CROCHET, "--test", ...suites.map((suite) => join(EXEMPLES, suite))], {
    cwd: RUNTIME,
    env: { ...ENV_ENFANT, BRIGADE_COUVERTURE_DIR: dossier, BRIGADE_COUVERTURE_RACINE: EXEMPLES },
    encoding: "utf8",
  });
  assert.equal(lance.status, 0, `${lance.stdout}${lance.stderr}`);
  return new Couverture(assembler(lireMesures(dossier), TOUR));
}

// Les emplacements de `code.ts` que le test est seul à couvrir.
const dansLeCode = (couverture: Couverture, test: string) => couverture.uniqueCoverage(test).filter((emplacement) => emplacement.startsWith("code.ts:"));

test("A ne couvre que f, B f et g, C que f : g est à B seul, A et C n'ont rien en propre", (t) => {
  const couverture = mesurer(t, "trois-tests.ts");
  assert.deepEqual(couverture.tests(), ["trois-tests.ts > A", "trois-tests.ts > B", "trois-tests.ts > C"]);
  // g, lignes 6 à 8 de `code.ts` ; f, lignes 3 à 5.
  assert.deepEqual(couverture.uniqueCoverage("trois-tests.ts > B"), ["code.ts:6", "code.ts:7", "code.ts:8"]);
  assert.deepEqual(couverture.uniqueCoverage("trois-tests.ts > A"), []);
  assert.deepEqual(couverture.uniqueCoverage("trois-tests.ts > C"), []);
  const parTest = new Map(couverture.rapport.tests.map((r) => [r.name, r]));
  assert.deepEqual([parTest.get("A")?.covered, parTest.get("B")?.covered, parTest.get("C")?.covered], [3, 6, 3]);
  assert.deepEqual([parTest.get("A")?.uniqueCount, parTest.get("B")?.uniqueCount, parTest.get("C")?.uniqueCount], [0, 3, 0]);
});

test("une branche, un process lancé par un test, un sous-test : chacun est au compte du test qui le fait tourner, et aucun fichier de tests n'est du code", (t) => {
  const couverture = mesurer(t, "branches-et-process.ts");
  // Deux tests de la même fonction qui prennent chacun une branche.
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > le signe > positif"), ["code.ts:11", "code.ts:12"]);
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > le signe > négatif"), ["code.ts:13"]);
  // Un process lancé avec un environnement choisi, attendu ou non.
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > un process attendu"), ["code.ts:16", "code.ts:17"]);
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > un process lancé"), ["code.ts:19", "code.ts:20"]);
  // Le parent a ce qui tourne hors de son sous-test.
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > un parent"), ["code.ts:22", "code.ts:23"]);
  assert.deepEqual(dansLeCode(couverture, "branches-et-process.ts > un parent > son sous-test"), ["code.ts:25", "code.ts:26"]);
  const fichiers = new Set(couverture.rapport.tests.flatMap((r) => r.unique.map((emplacement) => emplacement.replace(/:\d+$/, ""))));
  assert.deepEqual([...fichiers].sort(), ["code.ts", "lance-h.ts", "lance-k.ts"]);
});

test("ce qui est sous un répertoire `test` n'est pas du code : comptés depuis le runtime, les exemples ne couvrent rien", (t) => {
  const dossier = repertoireTemporaire(t);
  const lance = spawnSync(process.execPath, ["--import", CROCHET, "--test", join(EXEMPLES, "trois-tests.ts")], {
    cwd: RUNTIME,
    env: { ...ENV_ENFANT, BRIGADE_COUVERTURE_DIR: dossier, BRIGADE_COUVERTURE_RACINE: RUNTIME },
    encoding: "utf8",
  });
  assert.equal(lance.status, 0, lance.stderr);
  const rapport = assembler(lireMesures(dossier), TOUR);
  assert.deepEqual(
    rapport.tests.map((r) => [r.test, r.covered]),
    ["A", "B", "C"].map((nom) => [`test/valeur-tests/couverture/exemples/trois-tests.ts > ${nom}`, 0]),
  );
});

test("un même test mesuré deux fois n'en fait qu'un, qui couvre ce que couvrent les deux", () => {
  const couverture = new Couverture(
    assembler(
      [
        { file: "t.ts", name: "double", lines: { "a.ts": [[1, 2]] } },
        { file: "t.ts", name: "double", lines: { "a.ts": [[2, 4]] } },
        { file: "t.ts", name: "autre", lines: { "a.ts": [[1, 1]] } },
      ],
      TOUR,
    ),
  );
  assert.deepEqual(couverture.tests(), ["t.ts > autre", "t.ts > double"]);
  assert.deepEqual(couverture.uniqueCoverage("t.ts > double"), ["a.ts:2", "a.ts:3", "a.ts:4"]);
  assert.deepEqual(couverture.uniqueCoverage("t.ts > autre"), []);
});

test("la couverture propre d'un test que la mesure n'a pas vu est une erreur qui le nomme, pas une liste vide", () => {
  const couverture = new Couverture(assembler([{ file: "t.ts", name: "vu", lines: {} }], TOUR));
  assert.deepEqual(couverture.uniqueCoverage("t.ts > vu"), []);
  assert.throws(() => couverture.uniqueCoverage("t.ts > jamais vu"), (erreur: unknown) => erreur instanceof TestInconnu && /unknown test: “t\.ts > jamais vu”/.test(erreur.message));
});

test("la commande joue la zone par sa commande de tests et écrit le rapport : chaque test, son compte de lignes en propre", async (t) => {
  const zone = repertoireTemporaire(t);
  const sortie = join(repertoireTemporaire(t), "test-coverage.json");
  writeFileSync(join(zone, "package.json"), JSON.stringify({ name: "zone", private: true, scripts: { test: `node --test ${JSON.stringify(join(EXEMPLES, "trois-tests.ts").replaceAll("\\", "/"))}` } }));

  const appel = appeler((a) => principal(a, { cwd: RUNTIME, maintenant: () => TOUR.date }), ["--zone", zone, "--root", EXEMPLES, "--out", sortie], ENV_ENFANT);
  const [code, texte] = [await appel.fin, appel.sortie()];
  assert.equal(code, 0, texte);
  assert.equal(texte, `measuring ${zone}…\ncoverage report written to ${sortie}: 3 tests, 1 with coverage of their own, 2 with none\n`);

  const rapport = JSON.parse(readFileSync(sortie, "utf8")) as { date: string; suites: unknown; tests: Array<{ test: string; uniqueCount: number }> };
  assert.equal(rapport.date, "2026-10-21T10:00:00.000Z");
  assert.deepEqual(rapport.suites, [{ zone, code: 0, timedOut: false }]);
  // A et C se couvrent l'un l'autre : rien en propre, ni pour l'un ni pour l'autre.
  assert.deepEqual(
    rapport.tests.map((r) => [r.test, r.uniqueCount]),
    [
      ["trois-tests.ts > A", 0],
      ["trois-tests.ts > B", 3],
      ["trois-tests.ts > C", 0],
    ],
  );
  const couverture = lireCouverture(sortie);
  assert.deepEqual(couverture.uniqueCoverage("trois-tests.ts > B"), ["code.ts:6", "code.ts:7", "code.ts:8"]);
  assert.throws(() => couverture.uniqueCoverage("trois-tests.ts > D"), TestInconnu);
});

test("une suite en échec : le rapport est écrit tout de même, la commande le dit et rend 1", async (t) => {
  const zone = repertoireTemporaire(t);
  const sortie = join(repertoireTemporaire(t), "test-coverage.json");
  writeFileSync(join(zone, "package.json"), JSON.stringify({ name: "zone", private: true, scripts: { test: `node --test ${JSON.stringify(join(EXEMPLES, "trois-tests.ts").replaceAll("\\", "/"))} && exit 1` } }));

  const appel = appeler((a) => principal(a, { cwd: RUNTIME }), ["--zone", zone, "--root", EXEMPLES, "--out", sortie], ENV_ENFANT);
  const [code, texte] = [await appel.fin, appel.sortie()];
  assert.equal(code, 1, texte);
  assert.match(texte, /the tests of .* failed \(code 1\); the tests measured so far are in the report/);
  assert.deepEqual(lireCouverture(sortie).rapport.suites, [{ zone, code: 1, timedOut: false }]);
  assert.deepEqual(lireCouverture(sortie).uniqueCoverage("trois-tests.ts > B"), ["code.ts:6", "code.ts:7", "code.ts:8"]);
});

test("une suite qui ne rend pas la main est tuée à son délai, groupe compris : le rapport porte les tests mesurés jusque-là, la commande le dit et rend 1", async (t) => {
  const zone = repertoireTemporaire(t);
  const repertoire = repertoireTemporaire(t);
  const sortie = join(repertoire, "test-coverage.json");
  const pid = join(repertoire, "bloque.pid");
  const [suite, bloque] = ["trois-tests.ts", "bloque.ts"].map((fichier) => JSON.stringify(join(EXEMPLES, fichier).replaceAll("\\", "/")));
  // La suite mesurée finit, puis un process de la zone se bloque. Le délai
  // couvre largement la suite, même dix fois plus lente.
  writeFileSync(join(zone, "package.json"), JSON.stringify({ name: "zone", private: true, scripts: { test: `node --test ${suite} && node ${bloque} ${JSON.stringify(pid.replaceAll("\\", "/"))}` } }));

  const appel = appeler((a) => principal(a, { cwd: RUNTIME }), ["--zone", zone, "--root", EXEMPLES, "--out", sortie, "--timeout", "30"], ENV_ENFANT);
  const [code, texte] = [await appel.fin, appel.sortie()];
  assert.equal(code, 1, texte);
  assert.match(texte, /the tests of .* were stopped after 30 s without ending; the tests measured so far are in the report/);
  assert.match(texte, /coverage report written to .*: 3 tests, 1 with coverage of their own, 2 with none/);
  const couverture = lireCouverture(sortie);
  assert.deepEqual(couverture.rapport.suites, [{ zone, code: null, timedOut: true }]);
  assert.deepEqual(couverture.uniqueCoverage("trois-tests.ts > B"), ["code.ts:6", "code.ts:7", "code.ts:8"]);
  // Le process bloqué, petit-enfant de la commande, est mort avec son groupe.
  await jusqua(() => !vivant(Number(readFileSync(pid, "utf8"))));
  // Ce qu'a dit la suite est à côté du rapport ; ses mesures n'y restent pas.
  assert.match(readFileSync(`${sortie}.${basename(zone)}.log`, "utf8"), /ℹ pass 3/);
  assert.deepEqual(readdirSync(repertoire).filter((nom) => nom.includes(".mesures-")), []);
  assert.ok(existsSync(sortie));
});

test("sans --out ni répertoire d'état, la commande ne joue rien et dit pourquoi", async () => {
  const appel = appeler((a) => principal(a, { cwd: RUNTIME }), ["--root", EXEMPLES], ENV_ENFANT);
  assert.equal(await appel.fin, 2);
  assert.match(appel.sortie(), /^brigade: neither --out nor BRIGADE_STATE_DIR is set\nusage: /);
});

test("un rapport qui n'en est pas un ne se relit pas", (t) => {
  const chemin = join(repertoireTemporaire(t), "test-coverage.json");
  writeFileSync(chemin, JSON.stringify({ tests: [] }));
  assert.throws(() => lireCouverture(chemin), RapportIlisible);
});
