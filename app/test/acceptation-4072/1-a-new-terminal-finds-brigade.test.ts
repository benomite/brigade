// Test d'acceptation gelé (#4072). Critère 1 : sur un Mac où l'app est installée, un terminal neuf (et l'onglet du second) trouve `brigade`, sans geste du chef.
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

test("the installed app puts `brigade` in a bin folder of the user, from its own start, with no step from the chef", () => {
  const trouves = poseurs();
  assert.ok(trouves.length > 0, "no module of app/src writes a `brigade` command into ~/.local/bin (or /usr/local/bin, /opt/homebrew/bin)");
  const main = lire(join(SRC, "main.ts"));
  const appelee = trouves.some((f) => main.includes(`/${f.slice(SRC.length + 1).replace(/\.ts$/, "")}`));
  assert.ok(appelee, "app/src/main.ts does not use the module that writes the `brigade` command: it would not be there at the app's start");
  assert.ok(trouves.some((f) => /darwin/.test(lire(f))), "the command is not written for macOS");
});
