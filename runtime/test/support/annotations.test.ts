// Le rapport du job Windows en annotations : ce qu'un cook lit par l'API de GitHub, sans le journal du job.
import assert from "node:assert/strict";
import { join, relative } from "node:path";
import { test } from "node:test";
import { annoter, type Evenement } from "./annotations.ts";

const RACINE = join(import.meta.dirname, "../../..");
const FICHIER = join(import.meta.dirname, "../closing/run.test.ts");

const echec = (name: string, line: number, cause: unknown): Evenement => ({ type: "test:fail", data: { name, nesting: 1, file: FICHIER, line, details: { type: "test", error: { message: "test failed", cause } } } });
const dit = (line: number, message: string): Evenement => ({ type: "test:diagnostic", data: { nesting: 1, file: FICHIER, line, message } });
const compte = (message: string): Evenement => ({ type: "test:diagnostic", data: { nesting: 0, message } });

test("a failing test becomes an error annotation on its file and line, with its error and what it said of itself", () => {
  const cause = new Error("Expected values to be strictly equal:\n\n'zone' !== 'nothing'\n");
  cause.stack = `${cause.message}\n    at TestContext.<anonymous> (file:///D:/a/brigade/brigade/runtime/test/closing/run.test.ts:350:12)\n    at Test.run (node:internal/test_runner/test:1402:25)\n    at new Promise (<anonymous>)`;
  const lignes = annoter([echec("un closer qui ne retire rien, ne livre rien", 341, cause), dit(341, 'closing pass f-1: zone — zone ["src/libre/outils.ts"], files compared [".claude/brigade/gates.sh"]'), echec("bloc", 17, "1 subtest failed")].slice(0, 2), RACINE).split("\n");

  assert.equal(
    lignes[0],
    "::error file=runtime/test/closing/run.test.ts,line=341,title=un closer qui ne retire rien%2C ne livre rien::" +
      "Expected values to be strictly equal:%0A%0A'zone' !== 'nothing'%0A%0A    at TestContext.<anonymous> (file:///D:/a/brigade/brigade/runtime/test/closing/run.test.ts:350:12)" +
      '%0Aℹ closing pass f-1: zone — zone ["src/libre/outils.ts"], files compared [".claude/brigade/gates.sh"]',
  );
  assert.equal(lignes.length, 2);
});

test("a failing suite is not annotated twice: only its failing tests are", () => {
  const suite: Evenement = { type: "test:fail", data: { name: "la passe", nesting: 0, file: FICHIER, line: 17, details: { type: "suite", error: { message: "1 subtest failed" } } } };
  assert.equal(annoter([suite], RACINE), "");
});

test("past nine failures, a tenth error annotation names the others: GitHub keeps ten per step", () => {
  const echecs = Array.from({ length: 12 }, (_, i) => echec(`test ${i + 1}`, i + 1, Object.assign(new Error(`raté ${i + 1}`), { stack: `Error: raté ${i + 1}` })));
  const lignes = annoter(echecs, RACINE).trimEnd().split("\n");
  assert.equal(lignes.length, 10);
  assert.match(lignes[8] ?? "", /^::error file=runtime\/test\/closing\/run\.test\.ts,line=9,title=test 9::Error: raté 9$/);
  assert.equal(lignes[9], "::error title=3 more failing tests::runtime/test/closing/run.test.ts:10 — test 10%0Aruntime/test/closing/run.test.ts:11 — test 11%0Aruntime/test/closing/run.test.ts:12 — test 12");
});

test("every skipped test is listed in one notice with its reason, and the counts in another", () => {
  const saute: Evenement = { type: "test:pass", data: { name: "le runtime s'arrête sur SIGTERM", nesting: 1, file: FICHIER, line: 121, skip: "skipped on win32: stops the runtime with SIGTERM: 100% sure" } };
  const joue: Evenement = { type: "test:pass", data: { name: "joué", nesting: 1, file: FICHIER, line: 130 } };
  assert.equal(
    annoter([saute, joue, compte("tests 2"), compte("pass 2"), compte("fail 0"), compte("skipped 1"), compte("duration_ms 12.5")], RACINE),
    "::notice title=1 tests skipped::runtime/test/closing/run.test.ts:121 — le runtime s'arrête sur SIGTERM — skipped on win32: stops the runtime with SIGTERM: 100%25 sure\n" +
      "::notice title=counts::tests 2, pass 2, fail 0, skipped 1\n",
  );
});

// `node --test` dit « test failed » d'un fichier dont le process meurt avant de rapporter : sa raison n'est
// que sur son stderr. Neuf fichiers de la part 7/8 de ff0b79c sont morts ainsi sans rien en dire (#2482).
test("a test file whose process dies before reporting is annotated with its exit code and the end of its stderr", () => {
  const fichier = (exitCode: number): Evenement => ({ type: "test:fail", data: { name: "test\\closing\\run.test.ts", nesting: 0, file: FICHIER, line: 1, details: { type: "test", error: { message: "test failed", cause: "test failed", exitCode, signal: null } } } });
  // Le stderr est nommé par le chemin que `node --test` a reçu, relatif à son répertoire.
  const stderr = (message: string): Evenement => ({ type: "test:stderr", data: { file: relative(process.cwd(), FICHIER), message } });
  const autre: Evenement = { type: "test:stderr", data: { file: join(import.meta.dirname, "../status.test.ts"), message: "rien à voir\n" } };
  const lignes = annoter([stderr("node:internal/modules/esm/resolve:241\n"), autre, stderr("Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\\a\\outils.ts'\n"), stderr("\n"), fichier(1)], RACINE).split("\n");
  assert.equal(
    lignes[0],
    "::error file=runtime/test/closing/run.test.ts,line=1,title=test\\closing\\run.test.ts::test failed%0A" +
      "the file's process exited with code 1; the end of its stderr:%0Anode:internal/modules/esm/resolve:241%0AError [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\\a\\outils.ts'",
  );
  assert.match(annoter([fichier(3)], RACINE), /::test failed%0Athe file's process exited with code 3, and wrote nothing on stderr\n$/);
  // Un test en échec dans un process qui a rapporté n'a pas de sortie de process : rien ne s'ajoute.
  assert.match(annoter([stderr("bavard\n"), echec("un test", 12, "raté")], RACINE), /::raté\n$/);
});
