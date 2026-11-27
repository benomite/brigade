// Test d'acceptation gelé (#4072). Critère 3 : après une mise à jour de l'app, la commande est toujours là et à la version de l'app.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const sources = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dossier, e.name)) : e.name.endsWith(".ts") ? [join(dossier, e.name)] : []));
const lire = (f: string) => readFileSync(f, "utf8");
// The module of the app that puts the `brigade` command on the computer: it writes a file named `brigade` into a user bin folder.
const poseurs = () =>
  sources(SRC).filter((f) => !f.endsWith("emplacements.ts") && /(writeFileSync|symlinkSync|copyFileSync|linkSync)/.test(lire(f)) && /(["'`]bin["'`]\s*,\s*["'`]brigade["'`]|\/bin\/brigade)/.test(lire(f)));

test("the command is written again at each start, and on the app's own version, not only when absent", () => {
  const trouves = poseurs();
  assert.ok(trouves.length > 0, "the app writes no `brigade` command");
  const texte = trouves.map(lire).join("\n");
  assert.match(texte, /version/i, "the written command is not tied to a version of the app");
  assert.doesNotMatch(texte, /if\s*\(\s*existsSync\([^)]*\)\s*\)\s*return/, "an existing command is left as it is: after an update it would keep the old version");
  const main = lire(join(SRC, "main.ts"));
  assert.ok(trouves.some((f) => main.includes(`/${f.slice(SRC.length + 1).replace(/\.ts$/, "")}`)), "the command is not written at the app's start");
});
