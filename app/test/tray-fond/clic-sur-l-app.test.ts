// #4071 — Sur un Mac, l'icône de fond est un process du paquet de l'app : un clic sur l'app quittée (Dock, Finder) lui est
// adressé (`activate`) tant qu'elle tourne. Elle ouvre alors l'app, au lieu de ne rien faire.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");

// Electron, doublé : jamais « prêt » ; le système lui adresse un clic sur l'app une demi-seconde après son lancement.
// L'app qu'il ouvre, depuis le dépôt, est `getAppPath()` : un script qui laisse sa marque.
const FAUX_ELECTRON = `import { EventEmitter } from "node:events";
const souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === "then" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(nom + "." + String(p))), apply: () => souple(nom + "()"), construct: () => souple("new " + nom) });
class App extends EventEmitter {
  getPath() { return this.dossier ?? process.env.FAKE_USER_DATA; }
  setPath(_, v) { this.dossier = v; }
  getAppPath() { return process.env.FAKE_APP; }
  getVersion() { return "1.0.350"; }
  whenReady() { setTimeout(() => this.emit("activate"), 500); setInterval(() => {}, 60_000); return new Promise(() => {}); }
  exit(c) { process.exit(c); }
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
const CROCHET = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
Object.defineProperty(process, "resourcesPath", { value: process.env.FAKE_RESOURCES });
`;

test("a click on the app that the system sends to the running icon opens the app", async (t) => {
  const machine = repertoireTemporaire(t);
  mkdirSync(join(machine, "donnees"));
  mkdirSync(join(machine, "maison"));
  writeFileSync(join(machine, "crochet.mjs"), CROCHET);
  writeFileSync(join(machine, "faux-electron.mjs"), FAUX_ELECTRON);
  const ouverte = join(machine, "app-ouverte");
  writeFileSync(join(machine, "app.mjs"), `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(ouverte)}, "x");\n`);
  const ouverts: ChildProcess[] = [];
  t.after(() => ouverts.forEach((p) => p.kill("SIGKILL")));
  const icone = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(APP, "src", "tray-fond", "entree.ts"), "--tray-fond"], {
    cwd: APP,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...CACHE_DE_COMPILATION, HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_USER_DATA: join(machine, "donnees"), FAKE_RESOURCES: join(machine, "ressources"), FAKE_APP: join(machine, "app.mjs"), BRIGADE_APP_CONFIG: join(machine, "app.json"), BRIGADE_STATION_DIR: join(machine, "station") },
  });
  ouverts.push(icone);
  let sortie = "";
  let fini = false;
  icone.stdout.on("data", (m: Buffer) => (sortie += m.toString()));
  icone.stderr.on("data", (m: Buffer) => (sortie += m.toString()));
  icone.once("close", () => (fini = true));
  await jusqua(() => existsSync(ouverte) || fini, 10_000);
  assert.equal(existsSync(ouverte), true, `the app was not opened: ${sortie}`);
  assert.equal(fini, false, "the icon still runs");
});
