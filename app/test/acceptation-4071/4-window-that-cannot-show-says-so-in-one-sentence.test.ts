// Test d'acceptation gelé (#4071). Critère 4 : une fenêtre qui ne peut pas se montrer est dite en une phrase, avec quoi faire.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/workstation/role.ts";
import { holdingOfTheStation } from "../../src/workstation/station.ts";
import { launchTheBackground, readStateOfBackground } from "../../src/station-background/background.ts";
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");
const UNDER_POSIX: string | false = process.platform === "win32" ? "the fake host is stopped by a signal, which Windows does not send like a POSIX system" : false;

// La station d'essai : un cook qui écrit dans son worktree tant qu'il vit ; un SIGTERM — l'arrêt de la station — laisse sa marque.
const STATION = `import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dossier = process.env.BRIGADE_STATION_DIR;
const worktree = join(dossier, "worktree");
mkdirSync(worktree, { recursive: true });
const cook = spawn(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], 'travail non commité'); setInterval(() => {}, 60000)", join(worktree, "travail.txt")], { stdio: "ignore" });
writeFileSync(join(dossier, "cook.pid"), String(cook.pid));
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { writeFileSync(join(dossier, "station-arretee"), "x"); clearInterval(veille); cook.kill(); process.exit(0); });
`;

// Electron, doublé : aucun Electron lancé. Chaque chose que l'app en fait est dite sur la sortie standard. Le verrou d'instance
// unique est refusé quand FAKE_VERROU_REFUSE est posé — ce que le Mac rend à l'app rouverte tant que le processus de l'icône,
// du même paquet, tourne. Une fenêtre dont le chargement échoue, quand FAKE_CHARGEMENT_ECHOUE est posé.
const FAKE_ELECTRON = `import { EventEmitter } from "node:events";
const dit = (e) => process.stdout.write("@@" + JSON.stringify({ ...e, t: Date.now() }) + "\\n");
const souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === "then" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(nom + "." + String(p))), apply: () => souple(nom + "()"), construct: () => souple("new " + nom) });
class App extends EventEmitter {
  isPackaged = true;
  getPath() { return process.env.FAKE_USER_DATA; }
  setPath() {}
  getVersion() { return "1.0.349"; }
  getName() { return "Brigade"; }
  requestSingleInstanceLock() { const refuse = Boolean(process.env.FAKE_VERROU_REFUSE); dit({ evenement: "verrou", obtenu: !refuse }); return !refuse; }
  whenReady() { return Promise.resolve(); }
  quit() { dit({ evenement: "quit" }); setTimeout(() => process.exit(0), 10); }
  exit(c) { dit({ evenement: "exit", code: c }); process.exit(c); }
  relaunch() {}
  setAppUserModelId() {}
  focus() {}
  dock = souple("dock");
  commandLine = souple("commandLine");
}
export const app = new App();
const fenetres = [];
export class BrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.visible = options.show !== false;
    fenetres.push(this);
    dit({ evenement: "fenetre-creee", visible: this.visible });
    this.webContents = souple("webContents");
  }
  static getAllWindows() { return fenetres.slice(); }
  loadFile() { if (process.env.FAKE_CHARGEMENT_ECHOUE) return Promise.reject(new Error("ERR_FILE_NOT_FOUND (-6) loading vue/index.html")); dit({ evenement: "fenetre-chargee" }); return Promise.resolve(); }
  loadURL() { return Promise.resolve(); }
  show() { this.visible = true; dit({ evenement: "fenetre-montree" }); }
  hide() { this.visible = false; }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  isDestroyed() { return false; }
  restore() {}
  focus() {}
  setMenu() {}
  setBounds() {}
}
export const dialog = { showErrorBox: (titre, contenu) => dit({ evenement: "dialogue", titre, contenu }), showMessageBox: (...a) => { const o = a.at(-1) ?? {}; dit({ evenement: "dialogue", titre: o.message, contenu: o.detail }); return Promise.resolve({ response: 0 }); } };
export const ipcMain = souple("ipcMain");
export const Menu = souple("Menu");
export const nativeImage = souple("nativeImage");
export const Notification = souple("Notification");
export const powerMonitor = souple("powerMonitor");
export const protocol = souple("protocol");
export const shell = souple("shell");
export const Tray = souple("Tray");
export default { app };
`;
const HOOK = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
Object.defineProperty(process, "resourcesPath", { value: process.env.FAKE_RESOURCES });
`;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

type Event = { evenement: string; t: number; [key: string]: unknown };

// Un Mac où l'icône de fond (`--tray-fond`, du même paquet que l'app) tourne, et — avec `station` — la station de fond, son
// hôte réel et son cook. `ouvrirLApp` y ouvre l'app installée, point d'entrée réel sous l'Electron doublé.
async function oneMac(t: TestContext, options: { station?: boolean } = {}) {
  const machine = repertoireTemporaire(t);
  const resources = join(machine, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(resources, "runtime", "src", "station"), { recursive: true });
  writeFileSync(join(resources, "runtime", "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(resources, "runtime", PRINCIPAL), STATION);
  symlinkSync(APP, join(resources, "app"));
  mkdirSync(join(machine, "modules", "node-pty"), { recursive: true });
  writeFileSync(join(machine, "modules", "node-pty", "package.json"), `${JSON.stringify({ name: "node-pty", version: "0.0.0" })}\n`);
  for (const folder of ["maison", "donnees"]) mkdirSync(join(machine, folder));
  writeFileSync(join(machine, "crochet.mjs"), HOOK);
  writeFileSync(join(machine, "faux-electron.mjs"), FAKE_ELECTRON);
  const root = join(machine, "station");
  const embedded = join(resources, "runtime", PRINCIPAL);

  const icon = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", "--tray-fond"], { stdio: "ignore" });
  const openOnes: ChildProcess[] = [];
  const station = { hote: 0, cook: 0 };
  t.after(async () => {
    for (const app of openOnes) app.kill("SIGKILL");
    icon.kill("SIGKILL");
    if (station.hote > 0 && alive(station.hote)) process.kill(station.hote, "SIGTERM");
    await jusqua(() => station.hote === 0 || !alive(station.hote), 2_000);
    if (station.cook > 0 && alive(station.cook)) process.kill(station.cook, "SIGKILL");
  });
  if (options.station) {
    launchTheBackground({ node: process.execPath, embarque: embedded, racine: root, env: { ...process.env } });
    await jusqua(() => holdingOfTheStation(root) !== undefined && existsSync(join(root, "worktree", "travail.txt")) && readStateOfBackground(root) !== null, 5_000);
    station.hote = holdingOfTheStation(root) ?? assert.fail("the station host did not start");
    station.cook = Number(readFileSync(join(root, "cook.pid"), "utf8"));
    assert.ok(alive(station.hote) && alive(station.cook), "the station host and its cook run before the app opens");
  }

  // L'app ouverte : ce qu'elle fait dans les secondes qui comptent. `pidLaisse` : le pid que le fichier `app.pid` de l'app
  // quittée porte encore — celui d'un process vivant, qui n'est plus l'app (le pid a été rendu à un autre).
  async function openTheApp(env: Record<string, string> = {}, pidLeaves?: number) {
    if (pidLeaves !== undefined) writeFileSync(join(machine, "donnees", "app.pid"), String(pidLeaves));
    const events: Event[] = [];
    let output = "";
    let errors = "";
    const app = spawn(process.execPath, ["--import", join(machine, "crochet.mjs"), join(APP, "src", "tray-background", "entry.ts")], {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...CACHE_OF_COMPILATION,
        NODE_PATH: join(machine, "modules"),
        HOME: join(machine, "maison"),
        FAKE_ELECTRON: join(machine, "faux-electron.mjs"),
        FAKE_RESOURCES: resources,
        FAKE_USER_DATA: join(machine, "donnees"),
        BRIGADE_STATION_DIR: root,
        BRIGADE_APP_CONFIG: join(machine, "app.json"),
        BRIGADE_NODE_BIN: process.execPath,
        ...env,
      },
    });
    openOnes.push(app);
    let finished = false;
    app.once("close", () => (finished = true));
    app.stdout.on("data", (piece: Buffer) => {
      output += piece.toString();
      const lines = output.split("\n");
      output = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("@@")) events.push(JSON.parse(line.slice(2)) as Event);
    });
    app.stderr.on("data", (piece: Buffer) => (errors += piece.toString()));
    const shownOne = () => {
      const created = events.find((e) => e.evenement === "fenetre-creee");
      return created !== undefined && (created.visible === true || events.some((e) => e.evenement === "fenetre-montree"));
    };
    await jusqua(() => shownOne() || finished, 10_000);
    return {
      evenements: events,
      montree: shownOne(),
      erreurs: () => errors,
      // L'app quittée : elle part sans rien nettoyer de plus que ce qu'elle nettoie d'elle-même.
      quitter: async () => {
        app.kill("SIGKILL");
        await jusqua(() => finished, 5_000);
      },
    };
  }

  return { racine: root, hote: station.hote, cook: station.cook, icone: icon.pid ?? 0, ouvrirLApp: openTheApp };
}

function stationIntact(ordi: Awaited<ReturnType<typeof oneMac>>) {
  assert.equal(holdingOfTheStation(ordi.racine), ordi.hote, "the station host is the same process");
  assert.ok(alive(ordi.hote), "the station host still runs");
  assert.equal(existsSync(join(ordi.racine, "station-arretee")), false, "the station was never stopped");
  assert.equal(Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8")), ordi.cook, "no cook was re-created");
  assert.ok(alive(ordi.cook), "the cook still runs");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");
  assert.notEqual(readStateOfBackground(ordi.racine)?.etat, "arretee");
}

test("a window that cannot be shown is said in one sentence with what to do, not as a stack or nothing", { skip: UNDER_POSIX }, async (t) => {
  const ordi = await oneMac(t);
  const app = await ordi.ouvrirLApp({ FAKE_CHARGEMENT_ECHOUE: "1" });
  await jusqua(() => app.evenements.some((e) => e.evenement === "dialogue"), 5_000);
  const dialog = app.evenements.find((e) => e.evenement === "dialogue") ?? assert.fail(`nothing said to the chef — ${app.erreurs()}`);
  const text = `${String(dialog.titre ?? "")} ${String(dialog.contenu ?? "")}`.trim();
  const content = String(dialog.contenu ?? "").trim();
  assert.ok(content.length > 0 && !content.includes("\n"), `one line, got: ${JSON.stringify(content)}`);
  assert.doesNotMatch(text, /\bat .*\(|\.ts:\d|\.js:\d|node:|Error:/, "no stack trace or raw error shown to the chef");
  assert.equal(content.split(/[.!?](?:\s|$)/).filter(Boolean).length, 1, `one sentence, got: ${JSON.stringify(content)}`);
  assert.match(content, /\b(try|restart|reopen|open it again|reinstall|download|contact)\b/i, "it says what to do");
});
