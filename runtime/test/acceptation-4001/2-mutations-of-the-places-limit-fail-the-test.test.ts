// #4001, critère 2 : si la limite de places monte ou descend d'un cran dans le
// code de prise, ou si une file propre aux tests s'ajoute, le test « dispatched
// concurrently up to the same places limit » échoue. Il échoue sur un constat
// (assertion), pas parce qu'une attente a expiré : une attente qui expire dit
// seulement que la machine est lente. Les mutations se font dans une copie du
// runtime ; le dépôt n'est jamais touché.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

const RUNTIME = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TEST = "test/tests-acceptation/ecritures-en-parallele.test.ts";
const PLACES = "if (enVol.size + aRendre.size + ecritures.length >= limite) {";
const FILE = "if (enEcriture().length >= limite) break;";

const MUTATIONS: ReadonlyArray<readonly [string, string, string]> = [
  ["the places limit raised by one", PLACES, "if (enVol.size + aRendre.size + ecritures.length >= limite + 1) {"],
  ["the places limit lowered by one", PLACES, "if (enVol.size + aRendre.size + ecritures.length >= limite - 1) {"],
  ["a tests-only queue (one writing at a time)", FILE, "if (enEcriture().length >= 1) break;"],
];

function copie(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "acceptation-4001-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  cpSync(RUNTIME, dossier, { recursive: true, filter: (source) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(source) });
  return dossier;
}

function lancer(dossier: string) {
  // Sous `node --test`, NODE_TEST_CONTEXT ferait du fils un simple relais : il ne lancerait rien.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  return spawnSync(process.execPath, ["--import", "./test-hang-guard/charger.ts", "--test", "--test-force-exit", "--test-timeout=60000", TEST], { cwd: dossier, encoding: "utf8", env, timeout: 90_000 });
}

for (const [nom, avant, apres] of MUTATIONS) {
  test(`with ${nom} in the dispatch code, the test fails on an assertion, not on a timeout`, (t) => {
    const dossier = copie(t);
    const source = join(dossier, "src/brigade-github.ts");
    const texte = readFileSync(source, "utf8");
    assert.ok(texte.includes(avant), `the dispatch code still holds « ${avant} »`);
    writeFileSync(source, texte.replace(avant, apres));
    const sortie = lancer(dossier);
    const dit = `${sortie.stdout}\n${sortie.stderr}`;
    assert.notEqual(sortie.status, 0, "the mutated dispatch fails the test");
    assert.doesNotMatch(dit, /condition jamais remplie/, "it fails on a fact, not on an expired wait");
    assert.match(dit, /AssertionError|expected|actual/i, "it fails on an assertion");
  });
}
