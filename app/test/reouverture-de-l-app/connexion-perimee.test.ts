// #3864 — Une réouverture après une veille du Mac : la connexion précédente de l'app à la station est périmée (ses
// fichiers datent d'avant la veille, une réponse d'appairage traîne). L'app se rattache à la station qui tourne et
// montre sa fenêtre, sans qu'on arrête la station.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
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

// Electron, doublé : le test ne lance aucun Electron. Chaque chose que l'app fait de lui est dite sur la sortie standard.
const FAUX_ELECTRON = "import { EventEmitter } from \"node:events\";\nimport { readFileSync, writeFileSync } from \"node:fs\";\nimport { join } from \"node:path\";\nconst dit = (e) => process.stdout.write(`@@${JSON.stringify({ ...e, t: Date.now() })}\\n`);\nconst souple = (nom) => new Proxy(function () {}, { get: (_, p) => (p === \"then\" ? undefined : p === Symbol.toPrimitive ? () => nom : souple(`${nom}.${String(p)}`)), apply: () => souple(`${nom}()`), construct: () => souple(`new ${nom}`) });\nconst donnees = process.env.FAKE_USER_DATA;\nclass App extends EventEmitter {\n  isPackaged = true;\n  getPath() { return donnees; }\n  setPath(_, v) { this.dossier = v; }\n  getVersion() { return process.env.FAKE_APP_VERSION ?? \"1.0.286\"; }\n  getName() { return \"Brigade\"; }\n  requestSingleInstanceLock() {\n    // Le verrou de l'icône de fond : tenu tant que son process vit. Perdu, Electron passe la main à celui qui le tient.\n    const verrou = join(process.env.FAKE_LOCK_DIR, \"SingletonLock\");\n    let tenu = false;\n    try { process.kill(Number(readFileSync(verrou, \"utf8\")), 0); tenu = true; } catch {}\n    dit({ evenement: \"verrou\", obtenu: !tenu });\n    if (tenu) writeFileSync(join(process.env.FAKE_LOCK_DIR, \"second-instance\"), \"x\");\n    else writeFileSync(verrou, String(process.pid));\n    return !tenu;\n  }\n  whenReady() { return Promise.resolve(); }\n  quit() { dit({ evenement: \"quit\" }); setTimeout(() => process.exit(0), 10); }\n  exit(c) { dit({ evenement: \"exit\", code: c }); process.exit(c); }\n  relaunch() {}\n  setAppUserModelId() {}\n  focus() {}\n  dock = souple(\"dock\");\n  commandLine = souple(\"commandLine\");\n}\nexport const app = new App();\nconst fenetres = [];\nexport class BrowserWindow extends EventEmitter {\n  constructor(options = {}) {\n    super();\n    this.visible = options.show !== false;\n    fenetres.push(this);\n    dit({ evenement: \"fenetre-creee\", visible: this.visible });\n    this.webContents = souple(\"webContents\");\n  }\n  static getAllWindows() { return fenetres.slice(); }\n  loadFile() { dit({ evenement: \"fenetre-chargee\" }); return Promise.resolve(); }\n  loadURL() { return Promise.resolve(); }\n  show() { this.visible = true; dit({ evenement: \"fenetre-montree\" }); }\n  hide() { this.visible = false; }\n  isVisible() { return this.visible; }\n  isMinimized() { return false; }\n  isDestroyed() { return false; }\n  restore() {}\n  focus() {}\n  setMenu() {}\n  setBounds() {}\n}\nexport const dialog = souple(\"dialog\");\nexport const ipcMain = souple(\"ipcMain\");\nexport const Menu = souple(\"Menu\");\nexport const nativeImage = souple(\"nativeImage\");\nexport const Notification = souple(\"Notification\");\nexport const powerMonitor = souple(\"powerMonitor\");\nexport const shell = souple(\"shell\");\nexport const Tray = souple(\"Tray\");\nexport default { app };\n";
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

// Un Mac où la station de fond tourne — son hôte réel, son cook, son worktree — et l'icône de fond `--tray-fond`, qui tient
// le verrou d'instance unique. L'app installée y est ouverte par `ouvrirLApp`.
async function unMac(t: TestContext, options: { versionDeLHote?: string } = {}) {
  const machine = repertoireTemporaire(t);
  const ressources = join(machine, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(ressources, "runtime", "src", "station"), { recursive: true });
  writeFileSync(join(ressources, "runtime", "package.json"), `${JSON.stringify({ name: "brigade-runtime", version: "1.0.0" })}\n`);
  writeFileSync(join(ressources, "runtime", PRINCIPAL), STATION);
  symlinkSync(APP, join(ressources, "app"));
  mkdirSync(join(machine, "modules", "node-pty"), { recursive: true });
  writeFileSync(join(machine, "modules", "node-pty", "package.json"), `${JSON.stringify({ name: "node-pty", version: "0.0.0" })}\n`);
  for (const dossier of ["maison", "donnees", "verrou"]) mkdirSync(join(machine, dossier));
  writeFileSync(join(machine, "crochet.mjs"), CROCHET);
  writeFileSync(join(machine, "faux-electron.mjs"), FAUX_ELECTRON);
  const racine = join(machine, "station");
  const embarque = join(ressources, "runtime", PRINCIPAL);

  // L'icône de fond : un process `--tray-fond` qui vit, et tient le verrou.
  const icone = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", "--tray-fond"], { stdio: "ignore" });
  writeFileSync(join(machine, "verrou", "SingletonLock"), String(icone.pid));
  // La station de fond, lancée comme l'app la lance, puis laissée seule : elle survit à toute app.
  lancerLeFond({ node: process.execPath, embarque, racine, env: { ...process.env, ...(options.versionDeLHote === undefined ? {} : { BRIGADE_APP_VERSION: options.versionDeLHote }) } });
  const ouverts: ChildProcess[] = [];
  t.after(async () => {
    for (const app of ouverts) app.kill("SIGKILL");
    icone.kill("SIGKILL");
    const hote = tenantDeLaStation(racine);
    if (hote !== undefined) process.kill(hote, "SIGTERM");
    await jusqua(() => hote === undefined || !vivant(hote), 2_000);
    const cook = Number(readFileSync(join(racine, "cook.pid"), { encoding: "utf8", flag: "a+" }));
    if (cook > 0 && vivant(cook)) process.kill(cook, "SIGKILL");
  });
  await jusqua(() => tenantDeLaStation(racine) !== undefined && existsSync(join(racine, "worktree", "travail.txt")) && lireEtatDuFond(racine) !== null, 5_000);
  const hote = tenantDeLaStation(racine) ?? assert.fail("the station host did not start");
  const cook = Number(readFileSync(join(racine, "cook.pid"), "utf8"));
  assert.ok(vivant(icone.pid ?? 0) && vivant(hote) && vivant(cook), "the icon process, the host and its cook run before the app opens");

  // L'app, ouverte : son point d'entrée, sous un Electron doublé. Rend ce qu'elle a fait dans les cinq secondes qui comptent.
  async function ouvrirLApp(version = "1.0.286") {
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
        FAKE_LOCK_DIR: join(machine, "verrou"),
        FAKE_APP_VERSION: version,
        BRIGADE_STATION_DIR: racine,
        BRIGADE_APP_CONFIG: join(machine, "app.json"),
        BRIGADE_NODE_BIN: process.execPath,
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
    // Un fait attendu : la fenêtre montrée, ou l'app partie sans elle.
    await jusqua(() => montree() || fini, 10_000);
    const debut = evenements[0]?.t ?? 0;
    const fenetre = evenements.find((e) => e.evenement === "fenetre-creee" || e.evenement === "fenetre-montree");
    return {
      evenements,
      montree: montree(),
      // De la première chose que l'app fait d'Electron à sa fenêtre montrée.
      delaiMs: fenetre === undefined ? Infinity : fenetre.t - debut,
      parti: fini,
      erreurs: () => erreurs,
      quitter: async () => {
        app.kill("SIGTERM");
        await jusqua(() => fini, 5_000);
      },
    };
  }

  return { racine, hote, cook, icone: icone.pid ?? 0, ouvrirLApp, verrou: join(machine, "verrou"), machine };
}

// La station et ses cooks, comme avant l'ouverture de l'app : même hôte, même cook, même travail, jamais arrêtés.
function stationIntacte(ordi: Awaited<ReturnType<typeof unMac>>) {
  assert.equal(tenantDeLaStation(ordi.racine), ordi.hote, "the station host is the same process");
  assert.ok(vivant(ordi.hote), "the station host still runs");
  assert.equal(existsSync(join(ordi.racine, "station-arretee")), false, "the station was never stopped");
  assert.equal(Number(readFileSync(join(ordi.racine, "cook.pid"), "utf8")), ordi.cook, "no cook was re-created");
  assert.ok(vivant(ordi.cook), "the cook still runs");
  assert.equal(readFileSync(join(ordi.racine, "worktree", "travail.txt"), "utf8"), "travail non commité");
  assert.notEqual(lireEtatDuFond(ordi.racine)?.etat, "arretee");
}

test("après une veille, l'app rouverte se rattache à la station qui tourne et montre sa fenêtre, sans arrêt de la station", { skip: SOUS_POSIX }, async (t) => {
  const ordi = await unMac(t);
  // Ce que la veille laisse : l'état de la station et la dernière réponse d'appairage, vieux de trois jours.
  writeFileSync(join(ordi.racine, "fond-appairage.json"), `${JSON.stringify({ code: "AAAA-BBBB", rendu: { refus: "the previous connection expired" } })}\n`);
  const vieux = new Date(Date.now() - 3 * 24 * 3_600_000);
  for (const fichier of ["fond.json", "fond-appairage.json"]) utimesSync(join(ordi.racine, fichier), vieux, vieux);
  const app = await ordi.ouvrirLApp();
  assert.equal(app.montree, true, `no visible main window — ${app.erreurs()}`);
  assert.ok(app.delaiMs < 5_000);
  await jusqua(() => app.erreurs().includes("the app attaches to it"), 5_000);
  assert.match(app.erreurs(), new RegExp(`station already runs in the background \\(pid ${ordi.hote}\\) — the app attaches to it`));
  stationIntacte(ordi);
});
