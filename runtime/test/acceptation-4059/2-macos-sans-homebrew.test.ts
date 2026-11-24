// Test d'acceptation gelé (#4059), critère 2. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/outils-requis/outils-requis.ts` exporte `choisirInstallation(outil, machine)`, où `machine` est
// `{ plateforme: "darwin" | "win32", presents: string[] }` — les commandes présentes sur la machine (`brew`, `winget`,
// `outils-developpeur` pour l'installeur des outils de développement d'Apple, `gh`, `git`, `claude`…) — et qui rend le chemin
// choisi `{ moyen: string, texte: string, lien: string, exige: string[] }` : `exige` nomme les outils, hors ceux du système
// (shell, curl, PowerShell, navigateur), dont ce chemin a besoin.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { choisirInstallation } from "../../src/outils-requis/outils-requis.ts";

const DEPOT = join(import.meta.dirname, "..", "..", "..");

test("on macOS with no Homebrew and no developer tools, no path needs Homebrew, and no 'brew install' advice is left in app/src and runtime/src", () => {
  for (const outil of ["gh", "git", "claude"] as const) {
    const choix = choisirInstallation(outil, { plateforme: "darwin", presents: [] });
    assert.ok(choix !== null && choix.texte !== "", `un chemin pour ${outil}`);
    assert.doesNotMatch(JSON.stringify(choix), /brew/i, outil);
    assert.deepEqual(choix.exige, [], `${outil} : aucun outil que le nouveau n'a pas`);
  }
  let trouve = "";
  try {
    trouve = execFileSync("grep", ["-ri", "brew install", "app/src", "runtime/src"], { cwd: DEPOT, encoding: "utf8" });
  } catch {
    // grep sort en erreur quand il ne trouve rien : c'est voulu.
  }
  assert.equal(trouve, "", "aucun conseil `brew install` ne reste");
});
