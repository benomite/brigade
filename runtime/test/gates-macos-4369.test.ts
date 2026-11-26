// Sous macOS, les gates laissent la suite du runtime à la CI (#4369) : l'aiguillage
// est joué seul, extrait du vrai `gates.sh`, avec un faux `uname` devant le PATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

// Du `if` qui aiguille la suite du runtime à la ligne de la suite de l'app.
function aiguillage(): string {
  const lignes = readFileSync(GATES, "utf8").split("\n");
  const debut = lignes.findIndex((l) => l.startsWith('if [ "$(uname -s)" = Darwin ]'));
  const fin = lignes.findIndex((l, i) => i > debut && l.startsWith("suite app "));
  assert.ok(debut >= 0 && fin > debut, "aiguillage introuvable dans gates.sh");
  return lignes.slice(debut, fin + 1).join("\n");
}

function jouer(t: TestContext, os: string, env: Record<string, string> = {}): string {
  const dossier = repertoireTemporaire(t);
  writeFileSync(join(dossier, "uname"), `#!/bin/sh\necho ${os}\n`);
  chmodSync(join(dossier, "uname"), 0o755);
  const script = `ok() { echo "ok $*"; }\nsuite() { echo "suite $1"; }\n${aiguillage()}\n`;
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { PATH: `${dossier}:${process.env.PATH}`, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

describe("gates sous macOS (#4369)", { skip: posixOnly("bash et un faux uname") }, () => {
  test("sous Darwin la suite du runtime est laissée à la CI, celle de l'app tourne", (t) => {
    const sortie = jouer(t, "Darwin");
    assert.match(sortie, /^ok tests du runtime : non joués sous macOS.*CI de la PR \(Linux\)/m);
    assert.doesNotMatch(sortie, /^suite runtime/m);
    assert.match(sortie, /^suite app$/m);
  });

  test("BRIGADE_GATES_TOUT=1 rend la suite du runtime sous Darwin", (t) => {
    const sortie = jouer(t, "Darwin", { BRIGADE_GATES_TOUT: "1" });
    assert.match(sortie, /^suite runtime$/m);
    assert.match(sortie, /^suite app$/m);
    assert.doesNotMatch(sortie, /^ok /m);
  });

  test("sous Linux rien ne change : les deux suites tournent", (t) => {
    const sortie = jouer(t, "Linux");
    assert.equal(sortie, "suite runtime\nsuite app\n");
  });
});
