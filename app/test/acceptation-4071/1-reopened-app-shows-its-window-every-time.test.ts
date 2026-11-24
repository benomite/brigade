// Test d'acceptation gelé (#4071). Critère 1 : l'app quittée puis rouverte montre sa fenêtre, à chaque fois, l'icône de fond du même paquet tournant.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/poste/role.ts";
import { tenantDeLaStation } from "../../src/poste/station.ts";
import { lancerLeFond, lireEtatDuFond } from "../../src/station-fond/fond.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";

const APP = join(import.meta.dirname, "..", "..");
const SOUS_POSIX: string | false = process.platform === "win32" ? "the fake host is stopped by a signal, which Windows does not send like a POSIX system" : false;

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
const FAUX_ELECTRON = `import { EventEmitter } from "node:events";
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
export const shell = souple("shell");
export const Tray = souple("Tray");
export default { app };
`;
const CROCHET = `import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, n) { if (s === "electron") return { url: ' + JSON.stringify(pathToFileURL(process.env.FAKE_ELECTRON).href) + ', shortCircuit: true }; return n(s, c); }'));
Object.defineProperty(process, "resourcesPath", { value: process.env.FAKE_RESOURCES });
`;

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

type Evenement = { evenement: string; t: number; [cle: string]: unknown };

// Un Mac où l'icône de fond (`--tray-fond`, du même paquet que l'app) tourne, et — avec `station` — la station de fond, son
// hôte réel et son cook. `ouvrirLApp` y ouvre l'app installée, point d'entrée réel sous l'Electron doublé.
async function unMac(t: TestContext, options: { station?: boolean } = {}) {
  const machine = repertoireTemporaire(t);
  const ressources = join(machine, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(ressources, "runtime", "src", "station"), { recursive: true });
  writeFileSync(join(ressources, "runtime", "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(ressources, "runtime", PRINCIPAL), STATION);
  symlinkSync(APP, join(ressources, "app"));
  mkdirSync(join(machine, "modules", "node-pty"), { recursive: true });
  writeFileSync(join(machine, "modules", "node-pty", "package.json"), `${JSON.stringify({ name: "node-pty", version: "0.0.0" })}\n`);
  for (const dossier of ["maison", "donnees"]) mkdirSync(join(machine, dossier));
  writeFileSync(join(machine, "crochet.mjs"), CROCHET);
  writeFileSync(join(machine, "faux-electron.mjs"), FAUX_ELECTRON);
  const racine = join(machine, "station");
  const embarque = join(ressources, "runtime", PRINCIPAL);

  const icone = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", "--tray-fond"], { stdio: "ignore" });
  const ouverts: ChildProcess[] = [];
  const station = { hote: 0, cook: 0 };
  t.after(async () => {
    for (const app of ouverts) app.kill("SIGKILL");
    icone.kill("SIGKILL");
    if (station.hote > 0 && vivant(station.hote)) process.kill(station.hote, "SIGTERM");
    await jusqua(() => station.hote === 0 || !vivant(station.hote), 2_000);
    if (station.cook > 0 && vivant(station.cook)) process.kill(station.cook, "SIGKILL");
  });
  if (options.station) {
    lancerLeFond({ node: process.execPath, embarque, racine, env: { ...process.env } });
    await jusqua(() => tenantDeLaStation(racine) !== undefined && existsSync(join(racine, "worktree", "travail.txt")) && lireEtatDuFond(racine) !== null, 5_000);
    station.hote = tenantDeLaStation(racine) ?? assert.fail("the station host did not start");
    station.cook = Number(readFileSync(join(racine, "cook.pid"), "utf8"));
    assert.ok(vivant(station.hote) && vivant(station.cook), "the station host and its cook run before the app opens");
  }

  // L'app ouverte : ce qu'elle fait dans les secondes qui comptent. `pidLaisse` : le pid que le fichier `app.pid` de l'app
  // quittée porte encore — celui d'un process vivant, qui n'est plus l'app (le pid a été rendu à un autre).
  async function ouvrirLApp(env: Record<string, string> = {}, pidLaisse?: number) {
    if (pidLaisse !== undefined) writeFileSync(join(machine, "donnees", "app.pid"), String(pidLaisse));
    const evenements: Evenement[] = [];
    let sortie = "";
    let erreurs = "";
    const app = spawn(process.execPath, ["--import", join(machine, "crochet.mjs"), join(APP, "src", "tray-fond", "entree.ts")], {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...CACHE_DE_COMPILATION,
        NODE_PATH: join(machine, "modules"),
        HOME: join(machine, "maison"),
        FAKE_ELECTRON: join(machine, "faux-electron.mjs"),
        FAKE_RESOURCES: ressources,
        FAKE_USER_DATA: join(machine, "donnees"),
        BRIGADE_STATION_DIR: racine,
        BRIGADE_APP_CONFIG: join(machine, "app.json"),
        BRIGADE_NODE_BIN: process.execPath,
        ...env,
      },
    });
    ouverts.push(app);
    let fini = false;
    app.once("close", () => (fini = true));
    app.stdout.on("data", (morceau: Buffer) => {
      sortie += morceau.toString();
      const lignes = sortie.split("\n");
      sortie = lignes.pop() ?? "";
      for (const ligne of lignes) if (ligne.startsWith("@@")) evenements.push(JSON.parse(ligne.slice(2)) as Evenement);
    });
    app.stderr.on("data", (morceau: Buffer) => (erreurs += morceau.toString()));
    const montree = () => {
      const creee = evenements.find((e) => e.evenement === "fenetre-creee");
      return creee !== undefined && (creee.visible === true || evenements.some((e) => e.evenement === "fenetre-montree"));
    };
    await jusqua(() => montree() || fini, 10_000);
    return {
      evenements,
      montree: montree(),
      erreurs: () => erreurs,
      // L'app quittée : elle part sans rien nettoyer de plus que ce qu'elle nettoie d'elle-même.
      quitter: async () => {
        app.kill("SIGKILL");
        await jusqua(() => fini, 5_000);
      },
    };
  }

  return { racine, hote: station.hote, cook: station.cook, icone: icone.pid ?? 0, ouvrirLApp };
}

function stationIntacte(ordi: Awaited<ReturnType<typeof unMac>>) {
  assert.equal(tenantDeLaStation(ordi.racine), ordi.hote, "the station host is the same process");
  assert.ok(vivant(ordi.hote), "the station host still runs");
  assert.equal(existsSync(join(ordi.racine, "station-arretee")), false, "the station was never stopped");
  assert.equal(Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8")), ordi.cook, "no cook was re-created");
  assert.ok(vivant(ordi.cook), "the cook still runs");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");
  assert.notEqual(lireEtatDuFond(ordi.racine)?.etat, "arretee");
}

test("the app quit and opened again shows its window every time, while the icon process of the same bundle keeps running", { skip: SOUS_POSIX }, async (t) => {
  const ordi = await unMac(t);
  for (let fois = 1; fois <= 3; fois++) {
    // Le Mac refuse le verrou d'instance (l'icône, du même paquet, tourne) et `app.pid` porte un pid vivant : ce n'est plus l'app.
    const app = await ordi.ouvrirLApp({ FAKE_VERROU_REFUSE: "1" }, ordi.icone);
    assert.equal(app.montree, true, `reopen n°${fois}: no window — events: ${JSON.stringify(app.evenements.map((e) => e.evenement))} ${app.erreurs()}`);
    assert.equal(app.evenements.some((e) => e.evenement === "exit"), false, `reopen n°${fois}: the app left without a window`);
    assert.ok(vivant(ordi.icone), "the icon process still runs");
    await app.quitter();
  }
});
