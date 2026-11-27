// #4071 — Sur un Mac, l'icône de fond est un process du paquet de l'app : un clic sur l'app quittée (Dock, Finder) lui est
// adressé (`activate`) tant qu'elle tourne. Elle ouvre alors l'app, au lieu de ne rien faire.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { setTimeout as wait } from "node:timers/promises";
import { clickOnTheApp } from "../../src/tray-background/tray-background.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");

// Electron, doublé : jamais « prêt » ; il émet `activate` dès son lancement, comme quand launchd démarre l'agent, puis le système
// lui adresse un clic sur l'app trois secondes après.
// L'app qu'il ouvre, depuis le dépôt, est `getAppPath()` : un script qui laisse sa marque.
const FAKE_ELECTRON = `import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
const souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === "then" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(nom + "." + String(p))), apply: () => souple(nom + "()"), construct: () => souple("new " + nom) });
class App extends EventEmitter {
  getPath() { return this.dossier ?? process.env.FAKE_USER_DATA; }
  setPath(_, v) { this.dossier = v; }
  getAppPath() { return process.env.FAKE_APP; }
  getVersion() { return "1.0.350"; }
  whenReady() {
    setTimeout(() => { this.emit("activate"); writeFileSync(process.env.FAKE_LANCEMENT, "x"); }, 0);
    setTimeout(() => this.emit("activate"), 3_000);
    setInterval(() => {}, 60_000);
    return new Promise(() => {});
  }
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
const HOOK = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
Object.defineProperty(process, "resourcesPath", { value: process.env.FAKE_RESOURCES });
`;

test("an activate in the icon's first seconds is its own launch; a later one is a click on the app", () => {
  assert.equal(clickOnTheApp(10_000, 10_000), false, "at launch");
  assert.equal(clickOnTheApp(10_000, 10_000 + 1_999), false);
  assert.equal(clickOnTheApp(10_000, 12_000), true);
  assert.equal(clickOnTheApp(10_000, 60_000), true);
});

test("a click on the app that the system sends to the running icon opens the app; the activate of the icon's own launch, at login, does not", async (t) => {
  const machine = repertoireTemporaire(t);
  mkdirSync(join(machine, "donnees"));
  mkdirSync(join(machine, "maison"));
  writeFileSync(join(machine, "crochet.mjs"), HOOK);
  writeFileSync(join(machine, "faux-electron.mjs"), FAKE_ELECTRON);
  const openOne = join(machine, "app-ouverte");
  writeFileSync(join(machine, "app.mjs"), `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(openOne)}, "x");\n`);
  const openOnes: ChildProcess[] = [];
  t.after(() => openOnes.forEach((p) => p.kill("SIGKILL")));
  const icon = spawn(process.execPath, ["--import", pathToFileURL(join(machine, "crochet.mjs")).href, join(APP, "src", "tray-background", "entry.ts"), "--tray-fond"], {
    cwd: APP,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...CACHE_OF_COMPILATION, HOME: join(machine, "maison"), FAKE_ELECTRON: join(machine, "faux-electron.mjs"), FAKE_USER_DATA: join(machine, "donnees"), FAKE_RESOURCES: join(machine, "ressources"), FAKE_APP: join(machine, "app.mjs"), FAKE_LANCEMENT: join(machine, "lancement"), BRIGADE_APP_CONFIG: join(machine, "app.json"), BRIGADE_STATION_DIR: join(machine, "station") },
  });
  openOnes.push(icon);
  let output = "";
  let finished = false;
  icon.stdout.on("data", (m: Buffer) => (output += m.toString()));
  icon.stderr.on("data", (m: Buffer) => (output += m.toString()));
  icon.once("close", () => (finished = true));
  await jusqua(() => existsSync(join(machine, "lancement")) || finished, 10_000);
  await wait(1_500);
  assert.equal(existsSync(openOne), false, `the icon's launch opened the app: ${output}`);
  await jusqua(() => existsSync(openOne) || finished, 10_000);
  assert.equal(existsSync(openOne), true, `the app was not opened: ${output}`);
  assert.equal(finished, false, "the icon still runs");
});
