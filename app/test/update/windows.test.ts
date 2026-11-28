// L'installeur de l'app installée sous Windows (update/windows.ts, #1156) : il attend que l'app
// soit fermée, écarte son dossier, lance le setup en silence dans ce même dossier, vérifie la version
// posée, et rouvre la nouvelle — ou remet l'ancienne à sa place, dit pourquoi et la rouvre. Joué pour
// de vrai par PowerShell, contre une doublure du setup et de ce qui rouvre l'app : ni Windows exigé,
// ni vrai setup. Sous Windows, son PowerShell ; ailleurs, `pwsh` s'il est là (`BRIGADE_POWERSHELL`
// en désigne un) — sinon ces tests-là sont sautés, en le disant.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire, vivant } from "../../../runtime/test/outils.ts";
import { DESINSTALLEUR as UNINSTALLER_OF_PACKAGE, EXE as EXE_OF_PACKAGE } from "../../packaging/windows.ts";
import { FAILURE, holdUpdate, type StateOfUpdate } from "../../src/update/state.ts";
import { fluxOf, WINDOWS } from "../../src/update/flux.ts";
import { installerOfWorkstation } from "../../src/update/installation.ts";
import { oneFakeFlux } from "./fake-flux.ts";
import { UNINSTALLER, EXE, installabilityWindows, launchInstallationWindows, powershellOf } from "../../src/update/windows.ts";

const UNDER_WINDOWS = process.platform === "win32";

// Le PowerShell qui joue l'installeur ici : celui de Windows, ou un `pwsh` du PATH.
function onePowershell(): string | undefined {
  if (UNDER_WINDOWS) return powershellOf(process.env);
  if (process.env.BRIGADE_POWERSHELL) return process.env.BRIGADE_POWERSHELL;
  return (process.env.PATH ?? "").split(delimiter).map((folder) => join(folder, "pwsh")).find((path) => existsSync(path));
}
const POWERSHELL = onePowershell();
const WITHOUT_POWERSHELL: string | false = POWERSHELL === undefined ? "no PowerShell here (neither Windows nor `pwsh`; BRIGADE_POWERSHELL names one): the Windows installer script is played by app-windows" : false;

test("les noms que l'installeur cherche sont ceux que le paquet Windows pose", () => {
  assert.equal(EXE, EXE_OF_PACKAGE);
  assert.equal(UNINSTALLER, UNINSTALLER_OF_PACKAGE);
});

test("une app de Windows qui ne pourrait pas se remplacer là où elle est le dit", () => {
  const installedOne = "C:\\Users\\chef\\AppData\\Local\\Programs\\Brigade";
  const setOne = (path: string) => path === `${installedOne}\\Uninstall Brigade.exe`;
  const opened = () => {};
  assert.equal(installabilityWindows(`${installedOne}\\Brigade.exe`, setOne, opened), undefined);
  assert.match(installabilityWindows("C:\\repo\\app\\node_modules\\electron\\dist\\electron.exe", setOne, opened) ?? "", /^this app does not run from its installed Brigade\.exe/);
  assert.match(installabilityWindows("D:\\copie\\Brigade.exe", setOne, opened) ?? "", /^this app was not installed by its installer \(no Uninstall Brigade\.exe in D:\\copie\)/);
  const closes = (path: string) => {
    if (path === "C:\\Users\\chef\\AppData\\Local\\Programs") throw new Error("EACCES");
  };
  assert.equal(installabilityWindows(`${installedOne}\\Brigade.exe`, setOne, closes), "this account cannot write to C:\\Users\\chef\\AppData\\Local\\Programs");
});

test("sous Windows, l'installeur du poste est celui du setup ; ailleurs, celui du .dmg", () => {
  const pc = installerOfWorkstation({ plateforme: "win32", ressources: "C:\\Programs\\Brigade\\resources", executable: "C:\\Programs\\Brigade\\electron.exe", pid: 1, dossier: "C:\\maj" });
  assert.match(pc.installable() ?? "", /does not run from its installed Brigade\.exe/);
  const repository = installerOfWorkstation({ plateforme: "darwin", ressources: "/repo/app/node_modules/electron/dist", executable: "/x", pid: 1, dossier: "/maj" });
  assert.match(repository.installable() ?? "", /does not run from an app bundle/);
});


// Une doublure : un `.cmd` sous Windows, un `#!/bin/sh` ailleurs.
function standIn(folder: string, name: string, posix: string, windows: string): string {
  if (UNDER_WINDOWS) {
    const path = join(folder, `${name}.cmd`);
    writeFileSync(path, `@echo off\r\n${windows.split("\n").join("\r\n")}\r\n`);
    return path;
  }
  const path = join(folder, name);
  writeFileSync(path, `#!/bin/sh\n${posix}\n`);
  chmodSync(path, 0o755);
  return path;
}

// Un PC : l'app 1.0.0 installée dans `Programs/Brigade` — un fichier `vieux.txt` que la 1.1.0 ne
// porte plus —, le setup téléchargé de la 1.1.0 (une doublure, qui note ses arguments, pose la
// version `posee` dans le dossier de `/D=` et sort sur `sortie`), et ce qui rouvre l'app.
function onePC(t: TestContext, settings: { sortie?: number; posee?: string } = {}) {
  const root = repertoireTemporaire(t);
  const programs = join(root, "Programs");
  const app = join(programs, "Brigade");
  const set = (folder: string, version: string) => {
    mkdirSync(join(folder, "resources", "app"), { recursive: true });
    writeFileSync(join(folder, EXE), "un exe");
    writeFileSync(join(folder, UNINSTALLER), "un désinstalleur");
    writeFileSync(join(folder, "resources", "app", "package.json"), JSON.stringify({ name: "Brigade", version }));
  };
  set(app, "1.0.0");
  writeFileSync(join(app, "vieux.txt"), "de la 1.0.0");
  const folder = join(root, "mise-a-jour");
  mkdirSync(folder);
  const tools = join(root, "outils");
  mkdirSync(tools);
  const calls = join(root, "appels");
  writeFileSync(calls, "");
  const setOne = settings.posee ?? "1.1.0";
  const output = settings.sortie ?? 0;
  const setup = standIn(
    folder,
    "Brigade-1.1.0-x64-setup",
    `echo "setup $*" >> '${calls}'
tout="$*"
dest="\${tout#*/D=}"
mkdir -p "$dest/resources/app"
printf x > "$dest/${EXE}"
printf x > "$dest/${UNINSTALLER}"
printf '{"version":"%s"}' '${setOne}' > "$dest/resources/app/package.json"
exit ${output}`,
    `>>"${calls}" echo setup %*
set "tout=%*"
set "dest=%tout:*/D=%"
set "dest=%dest:~1%"
mkdir "%dest%\\resources\\app"
>"%dest%\\${EXE}" echo x
>"%dest%\\${UNINSTALLER}" echo x
>"%dest%\\resources\\app\\package.json" echo {"version":"${setOne}"}
exit /b ${output}`,
  );
  const open = standIn(tools, "ouvrir", `echo "ouvrir $1" >> '${calls}'`, `>>"${calls}" echo ouvrir %~1`);
  const env = { ...process.env, BRIGADE_OUVRIR: open, ...(POWERSHELL === undefined ? {} : { BRIGADE_POWERSHELL: POWERSHELL }) };
  return {
    app,
    programmes: programs,
    dossier: folder,
    setup,
    env,
    options: (pid: number, trials?: number) => ({ pid, installeur: setup, version: "1.1.0", app, dossier: folder, env, ...(trials === undefined ? {} : { essais: trials }) }),
    version: () => (JSON.parse(readFileSync(join(app, "resources", "app", "package.json"), "utf8")) as { version: string }).version,
    fichiers: () => readdirSync(app).sort(),
    appels: () => readFileSync(calls, "utf8").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    echec: () => (existsSync(join(folder, FAILURE)) ? readFileSync(join(folder, FAILURE), "utf8").trim() : undefined),
    // Ce qui reste à côté de l'app : rien que l'app.
    aCote: () => readdirSync(programs),
  };
}

// Un pid qui ne tourne plus : celui d'un process fini.
const onePidDead = () => spawnSync(process.execPath, ["-e", ""]).pid ?? assert.fail("no pid");

// L'app rouverte par l'installeur — ou, s'il ne le fait pas, ce qu'il a fait : ses appels et sa raison.
async function reopened(pc: ReturnType<typeof onePC>) {
  try {
    await jusqua(() => pc.appels().at(-1) === `ouvrir ${join(pc.app, EXE)}`);
  } catch {
    assert.fail(`the installer did not reopen the app — calls: ${JSON.stringify(pc.appels())}, ${FAILURE}: ${pc.echec() ?? "none"}, version: ${pc.version()}`);
  }
}



for (const [theCase, settings, reason] of [
  ["un setup qui échoue", { sortie: 2 }, "the installer of version 1.1.0 failed (exit code 2)"],
  ["un setup qui pose une autre version", { posee: "1.0.5" }, (app: string) => `the installer did not lay version 1.1.0 in ${app}`],
] as const) {
}


test("l'installeur, détaché, attend que l'app soit fermée avant de rien toucher", { skip: WITHOUT_POWERSHELL }, async (t) => {
  const pc = onePC(t);
  // L'app qui tourne : un process qui attend qu'on le ferme.
  const app = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const closedOne = new Promise((resolve) => app.once("exit", resolve));
  const setupExe = launchInstallationWindows(pc.options(app.pid ?? assert.fail("no pid")));
  // Tant qu'elle tourne, rien n'est lancé ni remplacé. PowerShell démarre lentement : le temps
  // qu'il le fasse, il trouve l'app ouverte ou se bloque derrière elle — il ne la devance pas.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(pc.appels(), []);
  assert.equal(pc.version(), "1.0.0");
  app.stdin?.end();
  await closedOne;
  await reopened(pc);
  assert.equal(pc.version(), "1.1.0");
  // Fini : son dossier de travail, sous le dossier temporaire du test, n'est plus tenu (Windows ne
  // retire pas le dossier courant d'un process).
  await jusqua(() => !vivant(setupExe));
});

test("un dossier d'app vide n'est pas remplacé", () => {
  assert.throws(() => launchInstallationWindows({ pid: onePidDead(), installeur: "C:\\maj\\setup.exe", version: "1.1.0", app: "", dossier: "C:\\maj" }), /not an installed app folder/);
});

test("de bout en bout : l'app 1.0.0 installée voit la 1.1.0 publiée pour Windows, la télécharge, se ferme, et se rouvre en 1.1.0", { skip: WITHOUT_POWERSHELL }, async (t) => {
  const pc = onePC(t);
  // Le flux publie, sous le nom du setup, ce que fait la doublure du setup.
  const fake = await oneFakeFlux(t, { "1.0.0": { exe: Buffer.from("la 1.0.0") }, "1.1.0": { exe: readFileSync(pc.setup) } });
  const versionInstalled = () => pc.version();
  // L'app 1.0.0 qui tourne : un process qui attend qu'on le ferme — « quitter » le ferme.
  const app = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const closedOne = new Promise((resolve) => app.once("exit", resolve));
  const states: StateOfUpdate[] = [];
  let setupExe: number | undefined;
  const before = holdUpdate({
    version: versionInstalled(),
    flux: fluxOf(fake.adresse, WINDOWS),
    dossier: pc.dossier,
    installable: () => undefined,
    installer: (ready) => {
      // Une doublure n'est pas un vrai .exe : sous Windows, elle se lance en `.cmd` ; ailleurs, elle
      // doit être exécutable. Ce que l'installeur reçoit reste ce qui a été téléchargé et vérifié.
      const launchable = UNDER_WINDOWS ? ready.installeur.replace(/\.exe$/, ".cmd") : ready.installeur;
      if (launchable !== ready.installeur) copyFileSync(ready.installeur, launchable);
      chmodSync(launchable, 0o755);
      setupExe = launchInstallationWindows({ pid: app.pid ?? assert.fail("no pid"), installeur: launchable, version: ready.version, app: pc.app, dossier: pc.dossier, env: pc.env });
    },
    quitter: () => void app.stdin?.end(),
    surEtat: (state) => void states.push(state),
  });
  t.after(() => before.fermer());
  assert.equal(before.auLancement(), false);
  assert.equal(await before.installerMaintenant(), undefined);
  assert.deepEqual([...new Set(states.map(({ etat: state }) => state))], ["verification", "disponible", "telechargement", "prete", "installation"]);
  await closedOne;
  await reopened(pc);
  await jusqua(() => !vivant(setupExe ?? assert.fail("the installer was not launched")));
  assert.equal(pc.echec(), undefined);
  // Rouverte : sa version est la 1.1.0, rien ne reste à installer, et elle est à jour.
  const after = holdUpdate({ version: versionInstalled(), flux: fluxOf(fake.adresse, WINDOWS), dossier: pc.dossier, installable: () => undefined, installer: () => assert.fail("nothing to install"), quitter: () => assert.fail("no quit"), surEtat: () => {} });
  t.after(() => after.fermer());
  assert.equal(after.auLancement(), false);
  assert.equal((await after.verifier()).etat, "a-jour");
  assert.equal(after.vu().version, "1.1.0");
  assert.deepEqual(readdirSync(pc.dossier), []);
});
