// Test d'acceptation gelé (#4079). Critère 2 : l'infobulle ou le menu de l'icône dit l'état de la station (« no project on
// this station ») et les comptes (« 0 cooking · 0 for you »), dans la même icône — au même endroit, app/src/tray/.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const TRAY = join(import.meta.dirname, "../../src/tray");

test("the tray code of app/src/tray/ carries the station state and the counts", () => {
  assert.ok(existsSync(TRAY), "app/src/tray/ exists");
  const texte = readdirSync(TRAY, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(TRAY, f), "utf8"))
    .join("\n");
  assert.match(texte, /no project on this station/);
  assert.match(texte, /cooking · /);
  assert.match(texte, /for you/);
  assert.match(texte, /setToolTip|setTitle|setContextMenu/);
});
