// Un app.json écrit par l'app avant #534 (l'interface passée en anglais) se lit avec les mêmes
// réglages. La fixture reproduit la forme écrite à la base de la PR #574 : commit 0e8a23f
// (`app/src/config.ts` et `app/src/couleurs.ts` y lisent hotes, projets[nom, dossier, hote,
// calibrage, stations, couleurs]). #534 n'a changé que les textes et les noms de la palette,
// pas les clés ni les valeurs persistées (couleurs en `#rrggbb`).
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { lireConfiguration } from "../src/config.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "app-json-avant-534.json");

test("un app.json d'avant #534 est lu avec les mêmes projets, hôtes, couleurs et réglages", (t) => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-app-"));
  t.after(() => rmSync(maison, { recursive: true, force: true }));
  for (const dossier of ["code/brigade", "code/atelier", "notes/carnet"]) mkdirSync(join(maison, dossier), { recursive: true });
  const chemin = join(maison, "app.json");
  copyFileSync(FIXTURE, chemin);

  assert.deepEqual(lireConfiguration(chemin, maison), {
    chemin,
    hotes: ["cuisine-paris", "box-lyon"],
    projets: [
      {
        nom: "brigade",
        dossier: join(maison, "code/brigade"),
        calibrage: { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "sonnet", effort: "medium" } },
        box: { hote: "cuisine-paris" },
        stations: ["mac/claude"],
        couleurs: { onglet: "#a98cf2", accent: "#d77ee0" },
      },
      { nom: "atelier", dossier: join(maison, "code/atelier"), box: { hote: "box-lyon" }, couleurs: { onglet: "#f28cbf" } },
      { nom: "carnet", dossier: join(maison, "notes/carnet") },
    ],
  });
});
