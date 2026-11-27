// Un app.json écrit par l'app avant #534 (l'interface passée en anglais) se lit avec les mêmes
// réglages. La fixture reproduit la forme écrite à la base de la PR #574 : commit 0e8a23f
// (`app/src/config.ts` et `app/src/colors.ts` y lisent hotes, projets[nom, dossier, hote,
// calibrage, stations, couleurs] ; hotes, hote et stations sont des clés héritées, que l'app ignore aujourd'hui). #534 n'a changé que les textes et les noms de la palette,
// pas les clés ni les valeurs persistées (couleurs en `#rrggbb`).
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readConfiguration } from "../src/config.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "app-json-before-534.json");

test("un app.json d'avant #534 est lu avec les mêmes projets, couleurs et réglages — les clés héritées `hotes`, `hote` et `stations` sont lues sans erreur et ignorées", (t) => {
  const home = mkdtempSync(join(tmpdir(), "brigade-app-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const folder of ["code/brigade", "code/atelier", "notes/carnet"]) mkdirSync(join(home, folder), { recursive: true });
  const path = join(home, "app.json");
  copyFileSync(FIXTURE, path);

  assert.deepEqual(readConfiguration(path, home), {
    chemin: path,
    projets: [
      {
        nom: "brigade",
        dossier: join(home, "code/brigade"),
        calibrage: { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "sonnet", effort: "medium" } },
        couleurs: { onglet: "#a98cf2", accent: "#d77ee0" },
      },
      { nom: "atelier", dossier: join(home, "code/atelier"), couleurs: { onglet: "#f28cbf" } },
      { nom: "carnet", dossier: join(home, "notes/carnet") },
    ],
  });
});
