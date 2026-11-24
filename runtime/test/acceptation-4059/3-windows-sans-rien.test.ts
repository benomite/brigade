// Test d'acceptation gelé (#4059), critère 3. Le contrat est celui de 2-macos-sans-homebrew.test.ts :
// `choisirInstallation(outil, { plateforme, presents })` du module `runtime/src/outils-requis/outils-requis.ts`
// rend `{ moyen, texte, lien, exige }`, `exige` nommant les outils hors système dont le chemin a besoin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirInstallation } from "../../src/outils-requis/outils-requis.ts";

test("on Windows with none of the three tools, each tool has an install path that needs no other tool the newcomer lacks", () => {
  const choisis: Record<string, string> = {};
  for (const outil of ["gh", "git", "claude"] as const) {
    const choix = choisirInstallation(outil, { plateforme: "win32", presents: [] });
    assert.ok(choix !== null && choix.moyen !== "" && choix.texte !== "", `un chemin pour ${outil}`);
    assert.deepEqual(choix.exige, [], `${outil} : aucun outil que le nouveau n'a pas`);
    assert.doesNotMatch(JSON.stringify(choix), /brew/i);
    choisis[outil] = choix.moyen;
  }
  assert.equal(Object.keys(choisis).length, 3);
});
