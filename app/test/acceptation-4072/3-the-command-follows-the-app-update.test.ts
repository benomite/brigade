// Test d'acceptation gelé (#4072). Critère 3 : après une mise à jour de l'app, la commande est toujours là et à la version de l'app.
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

test("the command is written again at each start, and on the app's own version, not only when absent", () => {
  const found = setters();
  assert.ok(found.length > 0, "the app writes no `brigade` command");
  const text = found.map(read).join("\n");
  assert.match(text, /version/i, "the written command is not tied to a version of the app");
  assert.doesNotMatch(text, /if\s*\(\s*existsSync\([^)]*\)\s*\)\s*return/, "an existing command is left as it is: after an update it would keep the old version");
  const main = read(join(SRC, "main.ts"));
  assert.ok(found.some((f) => main.includes(`/${f.slice(SRC.length + 1).replace(/\.ts$/, "")}`)), "the command is not written at the app's start");
});
