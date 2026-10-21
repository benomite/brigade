// L'historique des tests : un tour de tests inscrit par la commande
// d'ingestion, et ce qu'on en relit pour chaque test — son dernier échec, ses
// tours, le temps qu'ils ont coûté.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal } from "../../../src/valeur-tests/historique/ingerer-cli.ts";
import { idDuTest, lireRapportJUnit } from "../../../src/valeur-tests/historique/junit.ts";
import { ouvrirHistorique } from "../../../src/valeur-tests/historique/registre.ts";
import { aArreter, appeler, ENV_ENFANT, repertoireTemporaire } from "../../outils.ts";

const RUNTIME = join(import.meta.dirname, "../../..");
const EXEMPLES = join(import.meta.dirname, "exemples");

type Cas = { fichier: string; nom: string; secondes: number; echec?: boolean; suite?: string };

// Un rapport tel que l'écrit `node --test --test-reporter=junit`, chemins réels
// sous `racine`.
function rapport(racine: string, cas: Cas[]): string {
  const reelle = realpathSync.native(racine);
  const ligne = ({ fichier, nom, secondes, echec, suite }: Cas) => {
    const attributs = `name="${nom}" time="${secondes.toFixed(6)}" classname="${suite ?? "test"}" file="${join(reelle, fichier)}"`;
    const testcase = echec
      ? `<testcase ${attributs} failure="boom">\n<failure type="testCodeFailure" message="boom">\nError: boom\n    at &lt;anonymous> (x.ts:1:1)\n</failure>\n</testcase>`
      : `<testcase ${attributs}/>`;
    return suite === undefined ? testcase : `<testsuite name="${suite}" time="0.01" tests="1">\n${testcase}\n</testsuite>`;
  };
  return ['<?xml version="1.0" encoding="utf-8"?>', "<testsuites>", ...cas.map(ligne), "<!-- tests 2 -->", "</testsuites>", ""].join("\n");
}

function atelier(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const etat = repertoireTemporaire(t);
  const historique = ouvrirHistorique(etat);
  aArreter(t, () => historique.fermer());
  const ecrire = (nom: string, xml: string) => {
    const chemin = join(racine, nom);
    writeFileSync(chemin, xml);
    return chemin;
  };
  const ingerer = async (fichier: string, ...options: string[]) => {
    const appel = appeler((a) => principal(a, { cwd: racine }), [fichier, "--root", racine, "--commit", "c0ffee", ...options], { BRIGADE_STATE_DIR: etat });
    return { code: await appel.fin, sortie: appel.sortie() };
  };
  return { racine, etat, historique, ecrire, ingerer };
}

test("le rapport du vrai lanceur, un test qui échoue et un qui réussit : les deux sont inscrits, le dernier échec est la date du tour pour l'un, null pour l'autre", async (t) => {
  const { racine, etat, historique } = atelier(t);
  const xml = join(racine, "tour.xml");
  const lance = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=junit", `--test-reporter-destination=${xml}`, join(EXEMPLES, "un-qui-reussit.ts"), join(EXEMPLES, "un-qui-echoue.ts")],
    { cwd: RUNTIME, env: ENV_ENFANT, encoding: "utf8" },
  );
  assert.equal(lance.status, 1, lance.stderr);

  // Les chemins se comptent depuis le runtime, où sont les exemples.
  const appel = appeler((a) => principal(a, { cwd: racine }), [xml, "--root", RUNTIME, "--commit", "c0ffee", "--date", "2026-10-01T10:00:00Z", "--run", "tour-1"], { BRIGADE_STATE_DIR: etat });
  const [code, sortie] = [await appel.fin, appel.sortie()];
  assert.equal(code, 0, sortie);
  assert.equal(sortie, "test run tour-1 recorded: 2 tests, 1 failed\n");

  const echoue = idDuTest("test/valeur-tests/historique/exemples/un-qui-echoue.ts", "un groupe > échoue");
  const reussit = idDuTest("test/valeur-tests/historique/exemples/un-qui-reussit.ts", "réussit");
  assert.deepEqual(historique.lastFailure(echoue), new Date("2026-10-01T10:00:00Z"));
  assert.equal(historique.lastFailure(reussit), null);
  assert.equal(historique.runCount(echoue), 1);
  assert.equal(historique.runCount(reussit), 1);
  assert.ok(historique.totalDuration(reussit) > 0);
});

test("un second tour où le test en échec réussit : son dernier échec reste celui du premier tour", async (t) => {
  const { racine, historique, ecrire, ingerer } = atelier(t);
  const id = idDuTest("test/a.test.ts", "fragile");
  const premier = ecrire("1.xml", rapport(racine, [{ fichier: "test/a.test.ts", nom: "fragile", secondes: 0.5, echec: true }]));
  const second = ecrire("2.xml", rapport(racine, [{ fichier: "test/a.test.ts", nom: "fragile", secondes: 0.25 }]));

  assert.equal((await ingerer(premier, "--date", "2026-10-01T10:00:00Z")).code, 0);
  assert.deepEqual(historique.lastFailure(id), new Date("2026-10-01T10:00:00Z"));
  assert.equal((await ingerer(second, "--date", "2026-10-02T10:00:00Z")).code, 0);
  assert.deepEqual(historique.lastFailure(id), new Date("2026-10-01T10:00:00Z"));
  // Un tour plus ancien, inscrit après coup, ne recule pas le dernier échec.
  const ancien = ecrire("0.xml", rapport(racine, [{ fichier: "test/a.test.ts", nom: "fragile", secondes: 0.5, echec: true }, { fichier: "test/b.test.ts", nom: "autre", secondes: 0 }]));
  assert.equal((await ingerer(ancien, "--date", "2026-09-01T10:00:00Z")).code, 0);
  assert.deepEqual(historique.lastFailure(id), new Date("2026-10-01T10:00:00Z"));
});

test("chaque tour inscrit ajoute un tour au compte du test, et sa durée à son temps total", async (t) => {
  const { racine, historique, ecrire, ingerer } = atelier(t);
  const id = idDuTest("test/a.test.ts", "groupe > lent");
  const tours = [1.5, 0.25, 2];
  let total = 0;
  for (const [i, secondes] of tours.entries()) {
    const xml = ecrire(`${i}.xml`, rapport(racine, [{ fichier: "test/a.test.ts", nom: "lent", suite: "groupe", secondes, echec: i === 1 }]));
    assert.equal((await ingerer(xml, "--run", `tour-${i}`)).code, 0);
    total += secondes * 1000;
    assert.equal(historique.runCount(id), i + 1);
    assert.equal(historique.totalDuration(id), total);
  }
  // Un test que l'historique n'a jamais vu : aucun tour, aucun temps, aucun échec.
  assert.equal(historique.runCount("test/a.test.ts > inconnu"), 0);
  assert.equal(historique.totalDuration("test/a.test.ts > inconnu"), 0);
  assert.equal(historique.lastFailure("test/a.test.ts > inconnu"), null);
});

test("le même tour inscrit deux fois ne compte qu'une — sous son identifiant, ou sous l'empreinte de son rapport quand il n'en a pas", async (t) => {
  const { racine, historique, ecrire, ingerer } = atelier(t);
  const id = idDuTest("test/a.test.ts", "un");
  const xml = ecrire("1.xml", rapport(racine, [{ fichier: "test/a.test.ts", nom: "un", secondes: 0.5, echec: true }]));

  assert.equal((await ingerer(xml, "--run", "tour-1")).code, 0);
  const encore = await ingerer(xml, "--run", "tour-1", "--date", "2026-12-01T00:00:00Z");
  assert.deepEqual(encore, { code: 0, sortie: "test run tour-1 is already recorded: nothing added\n" });
  assert.equal(historique.runCount(id), 1);
  assert.equal(historique.totalDuration(id), 500);

  // Sans `--run`, le tour est le rapport : le même fichier une seconde fois
  // n'ajoute rien, un autre rapport est un autre tour.
  const premiere = await ingerer(xml);
  assert.match(premiere.sortie, /^test run [0-9a-f]{64} recorded: 1 tests, 1 failed\n$/);
  assert.match((await ingerer(xml)).sortie, /is already recorded: nothing added/);
  assert.equal(historique.runCount(id), 2);
  assert.equal((await ingerer(ecrire("2.xml", readFileSync(xml, "utf8").replace("0.500000", "0.600000")))).code, 0);
  assert.equal(historique.runCount(id), 3);
});

test("un test sauté ou « à faire » est noté sans compter de tour ; celui qui échoue sous `todo` ne compte pas d'échec", (t) => {
  const { racine, historique } = atelier(t);
  const xml = [
    "<testsuites>",
    `<testcase name="sauté" time="0.000300" classname="test" file="${join(racine, "test/a.test.ts")}"><skipped type="skipped" message="x"/></testcase>`,
    `<testcase name="à faire" time="0.000300" classname="test" file="${join(racine, "test/a.test.ts")}" failure="x"><skipped type="todo" message="true"/><failure type="testCodeFailure" message="x">x</failure></testcase>`,
    "</testsuites>",
  ].join("\n");
  const resultats = lireRapportJUnit(xml, racine);
  assert.deepEqual(
    resultats.map((r) => [r.nom, r.issue]),
    [
      ["sauté", "skip"],
      ["à faire", "skip"],
    ],
  );
  assert.deepEqual(historique.inscrire({ run: "r", date: new Date("2026-10-01T00:00:00Z"), commit: "c0ffee", resultats }), { nouveau: true, tests: 2, echecs: 0 });
  for (const nom of ["sauté", "à faire"]) {
    assert.equal(historique.runCount(idDuTest("test/a.test.ts", nom)), 0);
    assert.equal(historique.lastFailure(idDuTest("test/a.test.ts", nom)), null);
  }
});

test("le rapport se lit tel que Node l'écrit : suites imbriquées, entités, un `>` dans un nom, un fichier qui ne se charge pas, un chemin hors de la racine", (t) => {
  const racine = repertoireTemporaire(t);
  const fichier = join(racine, "test", "a.test.ts");
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<testsuites>",
    '<testsuite name="haut" time="0.1">',
    '<testsuite name="bas &amp; fin" time="0.1">',
    `<testcase name="a &gt; b &lt;&quot;c&quot;&#10;" time="0.002000" classname="bas" file="${fichier}"/>`,
    "</testsuite>",
    `<testcase name="a > b" time="0.001000" classname="haut" file="${fichier}"/>`,
    "</testsuite>",
    `<testcase name="test/casse.test.ts" time="0.4" classname="test" file="${join(racine, "test", "casse.test.ts")}" failure="test failed"><failure type="testCodeFailure" message="test failed">[Error: test failed] &lt;x> "y"</failure></testcase>`,
    '<testcase name="ailleurs" time="0" classname="test" file="/hors/de/la/racine.test.ts"/>',
    "<!-- fail 1 -->",
    "</testsuites>",
  ].join("\n");
  assert.deepEqual(lireRapportJUnit(xml, racine), [
    { fichier: "test/a.test.ts", nom: 'haut > bas & fin > a > b <"c"\n', issue: "pass", dureeMs: 2 },
    { fichier: "test/a.test.ts", nom: "haut > a > b", issue: "pass", dureeMs: 1 },
    { fichier: "test/casse.test.ts", nom: "test/casse.test.ts", issue: "fail", dureeMs: 400 },
    { fichier: "/hors/de/la/racine.test.ts", nom: "ailleurs", issue: "pass", dureeMs: 0 },
  ]);
});

test("l'historique est en ajout seul : ni un tour ni un résultat ne se modifie ou ne s'efface", (t) => {
  const { historique } = atelier(t);
  historique.inscrire({ run: "r", date: new Date("2026-10-01T00:00:00Z"), commit: "c0ffee", resultats: [{ fichier: "test/a.test.ts", nom: "un", issue: "fail", dureeMs: 1 }] });
  for (const sql of ["UPDATE runs SET at = 'x'", "DELETE FROM runs", "UPDATE results SET outcome = 'pass'", "DELETE FROM results"]) {
    assert.throws(() => historique.base.executer(sql), /ajout seul/, sql);
  }
});

test("la commande refuse ce qui ne se lit pas : sans répertoire d'état ou sans rapport (2), un rapport absent ou qui n'est pas du JUnit (1) — et n'inscrit rien", async (t) => {
  const { racine, etat, historique, ecrire, ingerer } = atelier(t);
  const jouer = async (args: string[], env: Record<string, string>) => {
    const appel = appeler((a) => principal(a, { cwd: racine }), args, env);
    return { code: await appel.fin, sortie: appel.sortie() };
  };
  assert.equal((await jouer(["x.xml"], {})).code, 2);
  assert.equal((await jouer([], { BRIGADE_STATE_DIR: etat })).code, 2);
  assert.equal((await ingerer("x.xml", "--bientot", "1")).code, 2);
  assert.equal((await ingerer("x.xml", "--run", "a", "--run", "b")).code, 2);
  assert.equal((await ingerer("x.xml", "--date", "hier")).code, 2);
  const absent = await ingerer("absent.xml");
  assert.equal(absent.code, 1);
  assert.match(absent.sortie, /^brigade: the report cannot be read/);
  const tap = await ingerer(ecrire("tap.txt", "TAP version 13\nok 1 - passe\n"));
  assert.deepEqual(tap, { code: 1, sortie: "brigade: not a JUnit report: no <testsuites> element\n" });
  assert.deepEqual(historique.base.lire("SELECT count(*) AS n FROM runs"), [{ n: 0 }]);
});

test("`-` lit le rapport sur l'entrée standard", async (t) => {
  const { racine, etat, historique } = atelier(t);
  const xml = rapport(racine, [{ fichier: "test/a.test.ts", nom: "un", secondes: 0.1 }]);
  const appel = appeler((a) => principal(a, { cwd: racine, entree: () => xml }), ["-", "--root", racine, "--commit", "c0ffee"], { BRIGADE_STATE_DIR: etat });
  assert.equal(await appel.fin, 0, appel.sortie());
  assert.equal(historique.runCount(idDuTest("test/a.test.ts", "un")), 1);
});

test("sans `--root` ni `--commit`, la racine est celle du dépôt git où la commande est lancée, et le commit son HEAD", async (t) => {
  const { racine, etat, historique } = atelier(t);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=chef", "-c", "user.email=chef@example.com", ...args], { cwd: racine, env: ENV_ENFANT, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("commit", "--quiet", "--allow-empty", "-m", "départ");
  const head = git("rev-parse", "HEAD");
  const xml = join(racine, "tour.xml");
  writeFileSync(xml, rapport(racine, [{ fichier: "runtime/test/a.test.ts", nom: "un", secondes: 0.1 }]));
  mkdirSync(join(racine, "runtime"));
  const appel = appeler((a) => principal(a, { cwd: join(racine, "runtime") }), ["../tour.xml"], { BRIGADE_STATE_DIR: etat });
  assert.equal(await appel.fin, 0, appel.sortie());
  assert.deepEqual(historique.base.lire("SELECT commit_sha, test FROM runs JOIN results USING (run)"), [{ commit_sha: head, test: "runtime/test/a.test.ts > un" }]);
});
