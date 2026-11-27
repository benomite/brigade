// Test d'acceptation gelé (#4072). Critère 1 : sur un Mac où l'app est installée, un terminal neuf (et l'onglet du second) trouve `brigade`, sans geste du chef.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const sources = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(folder, e.name)) : e.name.endsWith(".ts") ? [join(folder, e.name)] : []));
const read = (f: string) => readFileSync(f, "utf8");
// The module of the app that puts the `brigade` command on the computer: it writes a file named `brigade` into a user bin folder.
const setters = () =>
  sources(SRC).filter((f) => !f.endsWith("locations.ts") && /(writeFileSync|symlinkSync|copyFileSync|linkSync)/.test(read(f)) && /(["'`]bin["'`]\s*,\s*["'`]brigade["'`]|\/bin\/brigade)/.test(read(f)));

test("the installed app puts `brigade` in a bin folder of the user, from its own start, with no step from the chef", () => {
  const found = setters();
  assert.ok(found.length > 0, "no module of app/src writes a `brigade` command into ~/.local/bin (or /usr/local/bin, /opt/homebrew/bin)");
  const main = read(join(SRC, "main.ts"));
  const called = found.some((f) => main.includes(`/${f.slice(SRC.length + 1).replace(/\.ts$/, "")}`));
  assert.ok(called, "app/src/main.ts does not use the module that writes the `brigade` command: it would not be there at the app's start");
  assert.ok(found.some((f) => /darwin/.test(read(f))), "the command is not written for macOS");
});
