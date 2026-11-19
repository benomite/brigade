// #3864 — Le verrou de l'icône de fond est un fichier de pid, pas celui d'Electron, réservé à l'app.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { prendreLaPlace } from "../../src/tray-fond/instance.ts";

test("la place libre est prise, celle d'un process vivant est rendue, celle d'un mort ou d'un fichier illisible est reprise", (t) => {
  const fichier = join(repertoireTemporaire(t), "dossier", "tray.pid");
  assert.equal(prendreLaPlace(fichier, 4_000_001), undefined);
  assert.equal(readFileSync(fichier, "utf8"), "4000001");
  assert.equal(prendreLaPlace(fichier, process.pid), undefined, "a dead holder's place is taken");
  assert.equal(prendreLaPlace(fichier, 4_000_002), process.pid, "a living holder keeps it");
  writeFileSync(fichier, "n'importe quoi");
  assert.equal(prendreLaPlace(fichier, 4_000_003), undefined);
});
