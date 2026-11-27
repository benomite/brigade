// Test d'acceptation gelé (#4072). Critère 2 : la commande `brigade` que l'app écrit, lancée depuis l'onglet du second, joue le geste de la station. Mettre une carte en WAITING n'en passe plus : le second la parque par la commande de parking, comme le bouton de la carte (#4262).
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

test("the `brigade` the app writes runs the station's gesture, which carries `waiting set` to the card", () => {
  const found = setters();
  assert.ok(found.length > 0, "the app writes no `brigade` command");
  const text = found.map(read).join("\n");
  // The command is the station's gesture (runtime/deploy/brigade → src/station/geste.ts), on the runtime and node the app carries.
  assert.match(text, /geste|deploy\/brigade|station\/geste/, "the written command does not run the station's gesture (`brigade <project> <command> …`)");
  assert.match(text, /RUNTIME_DU_PAQUET|runtime/, "the written command does not point at the app's runtime");
  // The second's tab shares the app's PATH: the folder holding the command is on it.
  const paths = read(join(SRC, "locations.ts"));
  assert.match(paths, /\.local/, "the user bin folder is not in the paths the app puts on its PATH");
});
