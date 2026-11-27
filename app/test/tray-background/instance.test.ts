// #3864 — Le verrou de l'icône de fond est un fichier de pid, pas celui d'Electron, réservé à l'app.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { takeThePlace } from "../../src/tray-background/instance.ts";

test("la place libre est prise, celle d'un process vivant est rendue, celle d'un mort ou d'un fichier illisible est reprise", (t) => {
  const file = join(repertoireTemporaire(t), "dossier", "tray.pid");
  assert.equal(takeThePlace(file, 4_000_001), undefined);
  assert.equal(readFileSync(file, "utf8"), "4000001");
  assert.equal(takeThePlace(file, process.pid), undefined, "a dead holder's place is taken");
  assert.equal(takeThePlace(file, 4_000_002), process.pid, "a living holder keeps it");
  writeFileSync(file, "n'importe quoi");
  assert.equal(takeThePlace(file, 4_000_003), undefined);
});
