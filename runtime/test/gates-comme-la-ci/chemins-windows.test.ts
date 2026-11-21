// Les gates jouent tous les tests sur un changement qui lance la CI Windows, qui les joue tous (#3996) : leurs
// chemins sont ceux de `pull_request.paths` de `runtime-windows.yml`, recopiés dans `gates.sh`. Ce test tient les
// deux listes d'accord : un chemin ajouté à l'une et oublié dans l'autre le rougit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

function cheminsDeLaCiWindows(): string[] {
  const lignes = readFileSync(join(RACINE, ".github/workflows/runtime-windows.yml"), "utf8").split("\n");
  const debut = lignes.findIndex((ligne, i) => ligne === "  pull_request:" && lignes[i + 1] === "    paths:");
  assert.notEqual(debut, -1, "runtime-windows.yml has a pull_request.paths list");
  const chemins: string[] = [];
  for (const ligne of lignes.slice(debut + 2)) {
    const chemin = /^ {6}- "([^"]+)"$/.exec(ligne)?.[1];
    if (chemin === undefined) break;
    chemins.push(chemin.replace(/\*\*$/, "*"));
  }
  return chemins.sort();
}

function cheminsDesGates(): string[] {
  const ligne = readFileSync(join(RACINE, ".claude/brigade/gates.sh"), "utf8").split("\n").find((l) => l.includes("COMME_LA_CI_WINDOWS=1 ;;"));
  assert.ok(ligne !== undefined, "gates.sh plays every test on the Windows CI's paths");
  return ligne.trim().replace(/\).*$/, "").split("|").sort();
}

test("the gates play every test on exactly the paths that start the Windows CI on a PR, which plays them all", () => {
  assert.deepEqual(cheminsDesGates(), cheminsDeLaCiWindows());
});
