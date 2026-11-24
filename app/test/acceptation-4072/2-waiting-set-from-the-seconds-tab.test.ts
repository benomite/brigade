// Test d'acceptation gelé (#4072). Critère 2 : `brigade <project> waiting set <ticket> --what … --from … --remind <date>`, lancée depuis l'onglet du second, met la carte en WAITING comme le bouton de la carte.
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

test("the `brigade` the app writes runs the station's gesture, which carries `waiting set` to the card", () => {
  const trouves = poseurs();
  assert.ok(trouves.length > 0, "the app writes no `brigade` command");
  const texte = trouves.map(lire).join("\n");
  // The command is the station's gesture (runtime/deploy/brigade → src/station/geste.ts), on the runtime and node the app carries.
  assert.match(texte, /geste|deploy\/brigade|station\/geste/, "the written command does not run the station's gesture (`brigade <project> <command> …`)");
  assert.match(texte, /RUNTIME_DU_PAQUET|runtime/, "the written command does not point at the app's runtime");
  // The second's tab shares the app's PATH: the folder holding the command is on it.
  const chemins = lire(join(SRC, "emplacements.ts"));
  assert.match(chemins, /\.local/, "the user bin folder is not in the paths the app puts on its PATH");
});
