// #4079 — L'app et l'icône de la station de fond actives ensemble : un seul objet Tray est créé (src/tray/icone.ts), et la
// station seule en pose une.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");

// Electron, doublé : chaque `new Tray` s'écrit dans un fichier commun aux process.
const FAUX_ELECTRON = `import { appendFileSync } from "node:fs";
export class Tray { constructor() { appendFileSync(process.env.FAKE_TRAYS, process.pid + "\\n"); } on() {} destroy() {} }
export const nativeImage = { createFromPath: () => ({ isEmpty: () => false }), createEmpty: () => ({}) };
export const Menu = { buildFromTemplate: () => ({}) };
export default {};
`;
const CROCHET = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
`;
// Ce que fait le process : poser l'icône comme l'app ou la station de fond, puis rester vivant.
const POSEUR = `import { creerLIcone } from ${JSON.stringify(pathToFileURL(join(APP, "src", "tray", "icone.ts")).href)};
const icone = creerLIcone({ isEmpty: () => false }, "darwin");
process.stdout.write(icone === undefined ? "yielded\\n" : "created\\n");
setInterval(() => {}, 60_000);
`;

test("l'app et la station de fond actives ensemble : un seul Tray existe", async (t) => {
  const machine = repertoireTemporaire(t);
  mkdirSync(join(machine, "maison"));
  writeFileSync(join(machine, "crochet.mjs"), CROCHET);
  writeFileSync(join(machine, "faux-electron.mjs"), FAUX_ELECTRON);
  writeFileSync(join(machine, "poseur.mjs"), POSEUR);
  const pids: number[] = [];
  t.after(() => pids.forEach((pid) => process.kill(pid, "SIGKILL")));
  const lancer = async (): Promise<string> => {
    const p = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(machine, "poseur.mjs")], {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...CACHE_DE_COMPILATION, HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_TRAYS: join(machine, "trays"), BRIGADE_APP_CONFIG: join(machine, "app.json") },
    });
    pids.push(p.pid!);
    let sortie = "";
    p.stdout.on("data", (m: Buffer) => (sortie += m.toString()));
    p.stderr.on("data", (m: Buffer) => (sortie += m.toString()));
    await jusqua(() => sortie.includes("\n"), 15_000);
    return sortie.split("\n")[0]!;
  };
  const crees = () => (existsSync(join(machine, "trays")) ? readFileSync(join(machine, "trays"), "utf8").split("\n").filter(Boolean) : []);

  assert.equal(await lancer(), "created", "the station's icon alone raises one icon");
  assert.equal(crees().length, 1);
  assert.equal(await lancer(), "yielded", "the app, started while the station's icon lives, raises none");
  assert.equal(crees().length, 1, "one Tray exists with the app and the station both active");
});
