// Un fichier de tests ne laisse rien dans le répertoire temporaire : la suite
// est rejouée à chaque arrêt, et ce qu'elle y sème s'y accumule.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

for (const fichier of ["main", "superviseur"]) {
  test(`${fichier}.test.ts ne laisse rien dans le répertoire temporaire`, (t) => {
    const tmp = repertoireTemporaire(t);

    execFileSync(process.execPath, ["--test", join(import.meta.dirname, `${fichier}.test.ts`)], {
      env: { ...ENV_ENFANT, TMPDIR: tmp },
      stdio: "ignore",
    });

    assert.deepEqual(readdirSync(tmp), []);
  });
}
