// #3864 — Une réouverture après une veille du Mac : la connexion précédente de l'app à la station est périmée (ses
// fichiers datent d'avant la veille, une réponse d'appairage traîne). L'app se rattache à la station qui tourne et
// montre sa fenêtre, sans qu'on arrête la station.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
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

// Electron, doublé : le test ne lance aucun Electron. Chaque chose que l'app fait de lui est dite sur la sortie standard.
const FAKE_ELECTRON = "import { EventEmitter } from \"node:events\";\nimport { readFileSync, writeFileSync } from \"node:fs\";\nimport { join } from \"node:path\";\nconst dit = (e) => process.stdout.write(`@@${JSON.stringify({ ...e, t: Date.now() })}\\n`);\nconst souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === \"then\" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(`${nom}.${String(p)}`)), apply: () => souple(`${nom}()`), construct: () => souple(`new ${nom}`) });\nconst donnees = process.env.FAKE_USER_DATA;\nclass App extends EventEmitter {\n  isPackaged = true;\n  getPath() { return donnees; }\n  setPath(_, v) { this.dossier = v; }\n  getVersion() { return process.env.FAKE_APP_VERSION ?? \"1.0.286\"; }\n  getName() { return \"Brigade\"; }\n  requestSingleInstanceLock() {\n    // Le verrou de l'icône de fond : tenu tant que son process vit. Perdu, Electron passe la main à celui qui le tient.\n    const verrou = join(process.env.FAKE_LOCK_DIR, \"SingletonLock\");\n    let tenu = false;\n    try { process.kill(Number(readFileSync(verrou, \"utf8\")), 0); tenu = true; } catch {}\n    dit({ evenement: \"verrou\", obtenu: !tenu });\n    if (tenu) writeFileSync(join(process.env.FAKE_LOCK_DIR, \"second-instance\"), \"x\");\n    else writeFileSync(verrou, String(process.pid));\n    return !tenu;\n  }\n  whenReady() { return Promise.resolve(); }\n  quit() { dit({ evenement: \"quit\" }); setTimeout(() => process.exit(0), 10); }\n  exit(c) { dit({ evenement: \"exit\", code: c }); process.exit(c); }\n  relaunch() {}\n  setAppUserModelId() {}\n  focus() {}\n  dock = souple(\"dock\");\n  commandLine = souple(\"commandLine\");\n}\nexport const app = new App();\nconst fenetres = [];\nexport class BrowserWindow extends EventEmitter {\n  constructor(options = {}) {\n    super();\n    this.visible = options.show !== false;\n    fenetres.push(this);\n    dit({ evenement: \"fenetre-creee\", visible: this.visible });\n    this.webContents = souple(\"webContents\");\n  }\n  static getAllWindows() { return fenetres.slice(); }\n  loadFile() { dit({ evenement: \"fenetre-chargee\" }); return Promise.resolve(); }\n  loadURL() { return Promise.resolve(); }\n  show() { this.visible = true; dit({ evenement: \"fenetre-montree\" }); }\n  hide() { this.visible = false; }\n  isVisible() { return this.visible; }\n  isMinimized() { return false; }\n  isDestroyed() { return false; }\n  restore() {}\n  focus() {}\n  setMenu() {}\n  setBounds() {}\n}\nexport const dialog = souple(\"dialog\");\nexport const ipcMain = souple(\"ipcMain\");\nexport const Menu = souple(\"Menu\");\nexport const nativeImage = souple(\"nativeImage\");\nexport const Notification = souple(\"Notification\");\nexport const powerMonitor = souple(\"powerMonitor\");\nexport const protocol = souple(\"protocol\");\nexport const shell = souple(\"shell\");\nexport const Tray = souple(\"Tray\");\nexport default { app };\n";
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

// Un Mac où la station de fond tourne — son hôte réel, son cook, son worktree — et l'icône de fond `--tray-fond`, qui tient
// le verrou d'instance unique. L'app installée y est ouverte par `ouvrirLApp`.
async function oneMac(t: TestContext, options: { versionDeLHote?: string } = {}) {
  const machine = repertoireTemporaire(t);
  const resources = join(machine, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(resources, "runtime", "src", "station"), { recursive: true });
  writeFileSync(join(resources, "runtime", "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(resources, "runtime", PRINCIPAL), STATION);
  symlinkSync(APP, join(resources, "app"));
  mkdirSync(join(machine, "modules", "node-pty"), { recursive: true });
  writeFileSync(join(machine, "modules", "node-pty", "package.json"), `${JSON.stringify({ name: "node-pty", version: "0.0.0" })}\n`);
  for (const folder of ["maison", "donnees", "verrou"]) mkdirSync(join(machine, folder));
  writeFileSync(join(machine, "crochet.mjs"), HOOK);
  writeFileSync(join(machine, "faux-electron.mjs"), FAKE_ELECTRON);
  const root = join(machine, "station");
  const embedded = join(resources, "runtime", PRINCIPAL);

  // L'icône de fond : un process `--tray-fond` qui vit, et tient le verrou.
  const icon = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", "--tray-fond"], { stdio: "ignore" });
  writeFileSync(join(machine, "verrou", "SingletonLock"), String(icon.pid));
  // La station de fond, lancée comme l'app la lance, puis laissée seule : elle survit à toute app.
  launchTheBackground({ node: process.execPath, embarque: embedded, racine: root, env: { ...process.env, ...(options.versionDeLHote === undefined ? {} : { BRIGADE_APP_VERSION: options.versionDeLHote }) } });
  const openOnes: ChildProcess[] = [];
  t.after(async () => {
    for (const app of openOnes) app.kill("SIGKILL");
    icon.kill("SIGKILL");
    const host = holdingOfTheStation(root);
    if (host !== undefined) process.kill(host, "SIGTERM");
    await jusqua(() => host === undefined || !alive(host), 2_000);
    const cook = Number(readFileSync(join(root, "cook.pid"), { encoding: "utf8", flag: "a+" }));
    if (cook > 0 && alive(cook)) process.kill(cook, "SIGKILL");
  });
  await jusqua(() => holdingOfTheStation(root) !== undefined && existsSync(join(root, "worktree", "travail.txt")) && readStateOfBackground(root) !== null, 5_000);
  const host = holdingOfTheStation(root) ?? assert.fail("the station host did not start");
  const cook = Number(readFileSync(join(root, "cook.pid"), "utf8"));
  assert.ok(alive(icon.pid ?? 0) && alive(host) && alive(cook), "the icon process, the host and its cook run before the app opens");

  // L'app, ouverte : son point d'entrée, sous un Electron doublé. Rend ce qu'elle a fait dans les cinq secondes qui comptent.
  async function openTheApp(version = "1.0.286") {
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
        FAKE_LOCK_DIR: join(machine, "verrou"),
        FAKE_APP_VERSION: version,
        BRIGADE_STATION_DIR: root,
        BRIGADE_APP_CONFIG: join(machine, "app.json"),
        BRIGADE_NODE_BIN: process.execPath,
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
    // Un fait attendu : la fenêtre montrée, ou l'app partie sans elle.
    await jusqua(() => shownOne() || finished, 10_000);
    const start = events[0]?.t ?? 0;
    const window = events.find((e) => e.evenement === "fenetre-creee" || e.evenement === "fenetre-montree");
    return {
      evenements: events,
      montree: shownOne(),
      // De la première chose que l'app fait d'Electron à sa fenêtre montrée.
      delaiMs: window === undefined ? Infinity : window.t - start,
      parti: finished,
      erreurs: () => errors,
      quitter: async () => {
        app.kill("SIGTERM");
        await jusqua(() => finished, 5_000);
      },
    };
  }

  return { racine: root, hote: host, cook, icone: icon.pid ?? 0, ouvrirLApp: openTheApp, verrou: join(machine, "verrou"), machine };
}

// La station et ses cooks, comme avant l'ouverture de l'app : même hôte, même cook, même travail, jamais arrêtés.
function stationIntact(ordi: Awaited<ReturnType<typeof oneMac>>) {
  assert.equal(holdingOfTheStation(ordi.racine), ordi.hote, "the station host is the same process");
  assert.ok(alive(ordi.hote), "the station host still runs");
  assert.equal(existsSync(join(ordi.racine, "station-arretee")), false, "the station was never stopped");
  assert.equal(Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8")), ordi.cook, "no cook was re-created");
  assert.ok(alive(ordi.cook), "the cook still runs");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");
  assert.notEqual(readStateOfBackground(ordi.racine)?.etat, "arretee");
}

test("après une veille, l'app rouverte se rattache à la station qui tourne et montre sa fenêtre, sans arrêt de la station", { skip: UNDER_POSIX }, async (t) => {
  const ordi = await oneMac(t);
  // Ce que la veille laisse : l'état de la station et la dernière réponse d'appairage, vieux de trois jours.
  writeFileSync(join(ordi.racine, "fond-appairage.json"), `${JSON.stringify({ code: "AAAA-BBBB", rendu: { refus: "the previous connection expired" } })}\n`);
  const old = new Date(Date.now() - 3 * 24 * 3_600_000);
  for (const file of ["fond.json", "fond-appairage.json"]) utimesSync(join(ordi.racine, file), old, old);
  const app = await ordi.ouvrirLApp();
  assert.equal(app.montree, true, `no visible main window — ${app.erreurs()}`);
  assert.ok(app.delaiMs < 5_000);
  await jusqua(() => app.erreurs().includes("the app attaches to it"), 5_000);
  assert.match(app.erreurs(), new RegExp(`station already runs in the background \\(pid ${ordi.hote}\\) — the app attaches to it`));
  stationIntact(ordi);
});

// #3864 — Rouvrir l'app après l'avoir quittée : la station de fond et l'icône `--tray-fond` tournent déjà, et la fenêtre
// de l'app se montre, sans que le chef arrête la station. Contre le vrai point d'entrée de l'app (tray-background/entry.ts),
// sous un Electron doublé : ni Mac, ni écran.
// brigade:guard — moved unchanged from its own file by the closing pass #3993: it keeps guarding what main already does.
test("l'app ouverte alors que la station de fond et l'icône tournent crée sa fenêtre principale et la montre, en moins de cinq secondes", { skip: UNDER_POSIX }, async (t) => {
  const ordi = await oneMac(t);
  const app = await ordi.ouvrirLApp();
  assert.equal(app.montree, true, `no visible main window — events: ${JSON.stringify(app.evenements.map((e) => e.evenement))} ${app.erreurs()}`);
  assert.ok(app.delaiMs < 5_000, `the window took ${app.delaiMs} ms`);
});

// #3864 — Une réouverture après une mise à jour de l'app : l'hôte de la station qui tourne a été lancé par une version plus
// ancienne. La nouvelle app s'y rattache et montre sa fenêtre ; la station n'est pas arrêtée.
// brigade:guard — moved unchanged from its own file by the closing pass #3993: it keeps guarding what main already does.
test("l'hôte lancé par une version plus ancienne de l'app : l'app mise à jour s'y rattache, montre sa fenêtre, et la station reste", { skip: UNDER_POSIX }, async (t) => {
  const ordi = await oneMac(t, { versionDeLHote: "1.0.240" });
  const app = await ordi.ouvrirLApp("1.0.286");
  assert.equal(app.montree, true, `no visible main window — ${app.erreurs()}`);
  assert.ok(app.delaiMs < 5_000);
  await jusqua(() => app.erreurs().includes("the app attaches to it"), 5_000);
  assert.match(app.erreurs(), new RegExp(`station already runs in the background \\(pid ${ordi.hote}\\) — the app attaches to it`));
  stationIntact(ordi);
});
