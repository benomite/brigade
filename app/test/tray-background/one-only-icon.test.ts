// #3864 — Un seul process d'icône par compte : une deuxième icône, lancée alors que la première vit, s'efface ; la première
// reste. Le verrou est le fichier de pid de l'icône (instance.ts), pas le verrou d'instance unique d'Electron.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");

// Electron, doublé : ni fenêtre ni icône, et jamais « prêt », pour que l'icône ne lise aucune station.
const FAKE_ELECTRON = `import { EventEmitter } from "node:events";
const dit = (e) => process.stdout.write("@@" + JSON.stringify(e) + "\\n");
const souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === "then" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(nom + "." + String(p))), apply: () => souple(nom + "()"), construct: () => souple("new " + nom) });
class App extends EventEmitter {
  getPath() { return this.dossier ?? process.env.FAKE_USER_DATA; }
  setPath(_, v) { this.dossier = v; }
  whenReady() { setInterval(() => {}, 60_000); return new Promise(() => {}); }
  exit(c) { dit({ evenement: "exit", code: c }); process.exit(c); }
  dock = souple("dock");
}
export const app = new App();
export const dialog = souple("dialog");
export const Menu = souple("Menu");
export const nativeImage = souple("nativeImage");
export const Tray = souple("Tray");
export const BrowserWindow = souple("BrowserWindow");
export default { app };
`;
const HOOK = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
Object.defineProperty(process, "resourcesPath", { value: process.env.FAKE_RESOURCES });
`;

test("une deuxième icône de fond s'efface, la première reste", async (t) => {
  const machine = repertoireTemporaire(t);
  mkdirSync(join(machine, "donnees"));
  mkdirSync(join(machine, "maison"));
  writeFileSync(join(machine, "crochet.mjs"), HOOK);
  writeFileSync(join(machine, "faux-electron.mjs"), FAKE_ELECTRON);
  const openOnes: ChildProcess[] = [];
  t.after(() => openOnes.forEach((p) => p.kill("SIGKILL")));
  // `--import` lit un module comme un `import` : sous Windows, un chemin absolu (`C:\…`) y est lu comme une URL au schéma `c:`,
  // que Node refuse — l'icône mourait avant d'être lancée (#3869). Une URL `file:` se lit partout.
  const launch = () => {
    const p = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(APP, "src", "tray-background", "entry.ts"), "--tray-fond"], {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...CACHE_OF_COMPILATION, HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_USER_DATA: join(machine, "donnees"), FAKE_RESOURCES: join(machine, "ressources"), BRIGADE_APP_CONFIG: join(machine, "app.json"), BRIGADE_STATION_DIR: join(machine, "station") },
    });
    openOnes.push(p);
    const state = { sortie: "", code: undefined as number | null | undefined };
    p.stdout.on("data", (m: Buffer) => (state.sortie += m.toString()));
    p.stderr.on("data", (m: Buffer) => (state.sortie += m.toString()));
    p.once("close", (code) => (state.code = code));
    return state;
  };

  const first = launch();
  // Elle vit : elle a pris la place (son fichier de pid), elle ne s'est pas effacée.
  await jusqua(() => first.code !== undefined || existsSync(join(machine, "donnees", "tray-fond", "tray.pid")), 6_000);
  await new Promise((finished) => setTimeout(finished, 500));
  assert.equal(first.code, undefined, `the first icon left: ${first.sortie}`);
  const second = launch();
  await jusqua(() => second.code !== undefined, 10_000);
  assert.equal(second.code, 0, "the second icon leaves");
  assert.match(second.sortie, /"evenement":"exit"/);
  assert.equal(first.code, undefined, "the first icon still runs");
});
