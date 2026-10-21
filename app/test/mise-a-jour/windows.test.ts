// L'installeur de l'app installée sous Windows (mise-a-jour/windows.ts, #1156) : il attend que l'app
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
import { DESINSTALLEUR as DESINSTALLEUR_DU_PAQUET, EXE as EXE_DU_PAQUET } from "../../packaging/windows.ts";
import { ECHEC, tenirMiseAJour, type EtatDeMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { fluxDe, WINDOWS } from "../../src/mise-a-jour/flux.ts";
import { installeurDuPoste } from "../../src/mise-a-jour/installation.ts";
import { unFauxFlux } from "./faux-flux.ts";
import { commandeDInstallationWindows, DESINSTALLEUR, EXE, installabiliteWindows, lancerInstallationWindows, powershellDe, scriptWindows } from "../../src/mise-a-jour/windows.ts";

const SOUS_WINDOWS = process.platform === "win32";

// Le PowerShell qui joue l'installeur ici : celui de Windows, ou un `pwsh` du PATH.
function unPowershell(): string | undefined {
  if (SOUS_WINDOWS) return powershellDe(process.env);
  if (process.env.BRIGADE_POWERSHELL) return process.env.BRIGADE_POWERSHELL;
  return (process.env.PATH ?? "").split(delimiter).map((dossier) => join(dossier, "pwsh")).find((chemin) => existsSync(chemin));
}
const POWERSHELL = unPowershell();
const SANS_POWERSHELL: string | false = POWERSHELL === undefined ? "no PowerShell here (neither Windows nor `pwsh`; BRIGADE_POWERSHELL names one): the Windows installer script is played by app-windows" : false;

test("les noms que l'installeur cherche sont ceux que le paquet Windows pose", () => {
  assert.equal(EXE, EXE_DU_PAQUET);
  assert.equal(DESINSTALLEUR, DESINSTALLEUR_DU_PAQUET);
});

test("une app de Windows qui ne pourrait pas se remplacer là où elle est le dit", () => {
  const installee = "C:\\Users\\chef\\AppData\\Local\\Programs\\Brigade";
  const posee = (chemin: string) => chemin === `${installee}\\Uninstall Brigade.exe`;
  const ouvert = () => {};
  assert.equal(installabiliteWindows(`${installee}\\Brigade.exe`, posee, ouvert), undefined);
  assert.match(installabiliteWindows("C:\\repo\\app\\node_modules\\electron\\dist\\electron.exe", posee, ouvert) ?? "", /^this app does not run from its installed Brigade\.exe/);
  assert.match(installabiliteWindows("D:\\copie\\Brigade.exe", posee, ouvert) ?? "", /^this app was not installed by its installer \(no Uninstall Brigade\.exe in D:\\copie\)/);
  const ferme = (chemin: string) => {
    if (chemin === "C:\\Users\\chef\\AppData\\Local\\Programs") throw new Error("EACCES");
  };
  assert.equal(installabiliteWindows(`${installee}\\Brigade.exe`, posee, ferme), "this account cannot write to C:\\Users\\chef\\AppData\\Local\\Programs");
});

test("sous Windows, l'installeur du poste est celui du setup ; ailleurs, celui du .dmg", () => {
  const pc = installeurDuPoste({ plateforme: "win32", ressources: "C:\\Programs\\Brigade\\resources", executable: "C:\\Programs\\Brigade\\electron.exe", pid: 1, dossier: "C:\\maj" });
  assert.match(pc.installable() ?? "", /does not run from its installed Brigade\.exe/);
  const depot = installeurDuPoste({ plateforme: "darwin", ressources: "/repo/app/node_modules/electron/dist", executable: "/x", pid: 1, dossier: "/maj" });
  assert.match(depot.installable() ?? "", /does not run from an app bundle/);
});

test("le script porte ses valeurs en littéraux PowerShell, et passe encodé à PowerShell", () => {
  const options = { pid: 4242, installeur: "C:\\Users\\O'Brien\\maj\\Brigade-1.1.0-x64-setup.exe", version: "1.1.0", app: "C:\\Users\\O’Brien\\Programs\\Brigade", dossier: "C:\\Users\\O'Brien\\maj" };
  const script = scriptWindows(options);
  assert.match(script, /^\$idApp = 4242$/m);
  assert.match(script, /^\$installeur = 'C:\\Users\\O''Brien\\maj\\Brigade-1\.1\.0-x64-setup\.exe'$/m);
  assert.match(script, /^\$app = 'C:\\Users\\O’’Brien\\Programs\\Brigade'$/m);
  assert.match(script, /\$demarrage\.Arguments = "\/S \/D=\$app"/);
  const { commande, args } = commandeDInstallationWindows({ ...options, env: { SystemRoot: "C:\\Windows" } });
  assert.equal(commande, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(args.slice(0, -1), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]);
  assert.equal(Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le"), script);
  assert.equal(commandeDInstallationWindows({ ...options, env: { BRIGADE_POWERSHELL: "/opt/pwsh" } }).commande, "/opt/pwsh");
});

// Une doublure : un `.cmd` sous Windows, un `#!/bin/sh` ailleurs.
function doublure(dossier: string, nom: string, posix: string, windows: string): string {
  if (SOUS_WINDOWS) {
    const chemin = join(dossier, `${nom}.cmd`);
    writeFileSync(chemin, `@echo off\r\n${windows.split("\n").join("\r\n")}\r\n`);
    return chemin;
  }
  const chemin = join(dossier, nom);
  writeFileSync(chemin, `#!/bin/sh\n${posix}\n`);
  chmodSync(chemin, 0o755);
  return chemin;
}

// Un PC : l'app 1.0.0 installée dans `Programs/Brigade` — un fichier `vieux.txt` que la 1.1.0 ne
// porte plus —, le setup téléchargé de la 1.1.0 (une doublure, qui note ses arguments, pose la
// version `posee` dans le dossier de `/D=` et sort sur `sortie`), et ce qui rouvre l'app.
function unPC(t: TestContext, reglages: { sortie?: number; posee?: string } = {}) {
  const racine = repertoireTemporaire(t);
  const programmes = join(racine, "Programs");
  const app = join(programmes, "Brigade");
  const poser = (dossier: string, version: string) => {
    mkdirSync(join(dossier, "resources", "app"), { recursive: true });
    writeFileSync(join(dossier, EXE), "un exe");
    writeFileSync(join(dossier, DESINSTALLEUR), "un désinstalleur");
    writeFileSync(join(dossier, "resources", "app", "package.json"), JSON.stringify({ name: "Brigade", version }));
  };
  poser(app, "1.0.0");
  writeFileSync(join(app, "vieux.txt"), "de la 1.0.0");
  const dossier = join(racine, "mise-a-jour");
  mkdirSync(dossier);
  const outils = join(racine, "outils");
  mkdirSync(outils);
  const appels = join(racine, "appels");
  writeFileSync(appels, "");
  const posee = reglages.posee ?? "1.1.0";
  const sortie = reglages.sortie ?? 0;
  const setup = doublure(
    dossier,
    "Brigade-1.1.0-x64-setup",
    `echo "setup $*" >> '${appels}'
tout="$*"
dest="\${tout#*/D=}"
mkdir -p "$dest/resources/app"
printf x > "$dest/${EXE}"
printf x > "$dest/${DESINSTALLEUR}"
printf '{"version":"%s"}' '${posee}' > "$dest/resources/app/package.json"
exit ${sortie}`,
    `>>"${appels}" echo setup %*
set "tout=%*"
set "dest=%tout:*/D=%"
set "dest=%dest:~1%"
mkdir "%dest%\\resources\\app"
>"%dest%\\${EXE}" echo x
>"%dest%\\${DESINSTALLEUR}" echo x
>"%dest%\\resources\\app\\package.json" echo {"version":"${posee}"}
exit /b ${sortie}`,
  );
  const ouvrir = doublure(outils, "ouvrir", `echo "ouvrir $1" >> '${appels}'`, `>>"${appels}" echo ouvrir %~1`);
  const env = { ...process.env, BRIGADE_OUVRIR: ouvrir, ...(POWERSHELL === undefined ? {} : { BRIGADE_POWERSHELL: POWERSHELL }) };
  return {
    app,
    programmes,
    dossier,
    setup,
    env,
    options: (pid: number, essais?: number) => ({ pid, installeur: setup, version: "1.1.0", app, dossier, env, ...(essais === undefined ? {} : { essais }) }),
    version: () => (JSON.parse(readFileSync(join(app, "resources", "app", "package.json"), "utf8")) as { version: string }).version,
    fichiers: () => readdirSync(app).sort(),
    appels: () => readFileSync(appels, "utf8").trim().split(/\r?\n/).map((ligne) => ligne.trim()).filter(Boolean),
    echec: () => (existsSync(join(dossier, ECHEC)) ? readFileSync(join(dossier, ECHEC), "utf8").trim() : undefined),
    // Ce qui reste à côté de l'app : rien que l'app.
    aCote: () => readdirSync(programmes),
  };
}

// Un pid qui ne tourne plus : celui d'un process fini.
const unPidMort = () => spawnSync(process.execPath, ["-e", ""]).pid ?? assert.fail("no pid");

// L'app rouverte par l'installeur — ou, s'il ne le fait pas, ce qu'il a fait : ses appels et sa raison.
async function rouverte(pc: ReturnType<typeof unPC>) {
  try {
    await jusqua(() => pc.appels().at(-1) === `ouvrir ${join(pc.app, EXE)}`);
  } catch {
    assert.fail(`the installer did not reopen the app — calls: ${JSON.stringify(pc.appels())}, ${ECHEC}: ${pc.echec() ?? "none"}, version: ${pc.version()}`);
  }
}

function installer(pc: ReturnType<typeof unPC>, essais?: number) {
  const { commande, args, env } = commandeDInstallationWindows(pc.options(unPidMort(), essais));
  return spawnSync(commande, args, { env, encoding: "utf8", cwd: pc.dossier });
}

test("l'installeur lance le setup en silence dans le dossier de l'app, ne laisse rien de l'ancienne et rouvre la nouvelle", { skip: SANS_POWERSHELL }, (t) => {
  const pc = unPC(t);
  const fini = installer(pc);
  assert.equal(fini.status, 0, fini.stderr || fini.stdout);
  assert.equal(pc.version(), "1.1.0");
  assert.deepEqual(pc.fichiers(), [DESINSTALLEUR, EXE, "resources"].sort(), "aucun fichier de la 1.0.0 ne survit");
  assert.deepEqual(pc.aCote(), ["Brigade"]);
  assert.equal(existsSync(pc.setup), false);
  assert.equal(pc.echec(), undefined);
  assert.deepEqual(pc.appels(), [`setup /S /D=${pc.app}`, `ouvrir ${join(pc.app, EXE)}`]);
});

for (const [cas, reglages, raison] of [
  ["un setup qui échoue", { sortie: 2 }, "the installer of version 1.1.0 failed (exit code 2)"],
  ["un setup qui pose une autre version", { posee: "1.0.5" }, (app: string) => `the installer did not lay version 1.1.0 in ${app}`],
] as const) {
  test(`${cas} : l'ancienne app est remise en place telle quelle, la raison est écrite et elle est rouverte`, { skip: SANS_POWERSHELL }, (t) => {
    const pc = unPC(t, reglages);
    assert.equal(installer(pc).status, 1);
    assert.equal(pc.version(), "1.0.0");
    assert.deepEqual(pc.fichiers(), [DESINSTALLEUR, EXE, "resources", "vieux.txt"].sort());
    assert.deepEqual(pc.aCote(), ["Brigade"]);
    assert.equal(pc.echec(), typeof raison === "string" ? raison : raison(pc.app));
    assert.equal(existsSync(pc.setup), false);
    assert.equal(pc.appels().at(-1), `ouvrir ${join(pc.app, EXE)}`);
  });
}

test(
  "un dossier d'app qui ne se laisse pas écarter : rien n'est installé, la raison est écrite et l'app est rouverte",
  { skip: SANS_POWERSHELL || (SOUS_WINDOWS ? "a read-only parent folder does not stop a rename under Windows" : process.getuid?.() === 0 ? "root renames in a read-only folder" : false) },
  (t) => {
    const pc = unPC(t);
    // Les droits sont rendus dans le test même : les crochets `after` passent dans l'ordre où ils
    // ont été posés, et celui du dossier temporaire le retirerait avant.
    chmodSync(pc.programmes, 0o555);
    let fini;
    try {
      fini = installer(pc, 2);
    } finally {
      chmodSync(pc.programmes, 0o755);
    }
    assert.equal(fini.status, 1);
    assert.equal(pc.version(), "1.0.0");
    assert.equal(pc.echec(), `the app's folder is still in use, the update was not installed (${pc.app})`);
    assert.deepEqual(pc.appels(), [`ouvrir ${join(pc.app, EXE)}`], "le setup n'a pas été lancé");
  },
);

test("l'installeur, détaché, attend que l'app soit fermée avant de rien toucher", { skip: SANS_POWERSHELL }, async (t) => {
  const pc = unPC(t);
  // L'app qui tourne : un process qui attend qu'on le ferme.
  const app = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const fermee = new Promise((resoudre) => app.once("exit", resoudre));
  const installeur = lancerInstallationWindows(pc.options(app.pid ?? assert.fail("no pid")));
  // Tant qu'elle tourne, rien n'est lancé ni remplacé. PowerShell démarre lentement : le temps
  // qu'il le fasse, il trouve l'app ouverte ou se bloque derrière elle — il ne la devance pas.
  await new Promise((resoudre) => setTimeout(resoudre, 300));
  assert.deepEqual(pc.appels(), []);
  assert.equal(pc.version(), "1.0.0");
  app.stdin?.end();
  await fermee;
  await rouverte(pc);
  assert.equal(pc.version(), "1.1.0");
  // Fini : son dossier de travail, sous le dossier temporaire du test, n'est plus tenu (Windows ne
  // retire pas le dossier courant d'un process).
  await jusqua(() => !vivant(installeur));
});

test("un dossier d'app vide n'est pas remplacé", () => {
  assert.throws(() => lancerInstallationWindows({ pid: unPidMort(), installeur: "C:\\maj\\setup.exe", version: "1.1.0", app: "", dossier: "C:\\maj" }), /not an installed app folder/);
});

test("de bout en bout : l'app 1.0.0 installée voit la 1.1.0 publiée pour Windows, la télécharge, se ferme, et se rouvre en 1.1.0", { skip: SANS_POWERSHELL }, async (t) => {
  const pc = unPC(t);
  // Le flux publie, sous le nom du setup, ce que fait la doublure du setup.
  const faux = await unFauxFlux(t, { "1.0.0": { exe: Buffer.from("la 1.0.0") }, "1.1.0": { exe: readFileSync(pc.setup) } });
  const versionInstallee = () => pc.version();
  // L'app 1.0.0 qui tourne : un process qui attend qu'on le ferme — « quitter » le ferme.
  const app = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const fermee = new Promise((resoudre) => app.once("exit", resoudre));
  const etats: EtatDeMiseAJour[] = [];
  let installeur: number | undefined;
  const avant = tenirMiseAJour({
    version: versionInstallee(),
    flux: fluxDe(faux.adresse, WINDOWS),
    dossier: pc.dossier,
    installable: () => undefined,
    installer: (prete) => {
      // Une doublure n'est pas un vrai .exe : sous Windows, elle se lance en `.cmd` ; ailleurs, elle
      // doit être exécutable. Ce que l'installeur reçoit reste ce qui a été téléchargé et vérifié.
      const lancable = SOUS_WINDOWS ? prete.installeur.replace(/\.exe$/, ".cmd") : prete.installeur;
      if (lancable !== prete.installeur) copyFileSync(prete.installeur, lancable);
      chmodSync(lancable, 0o755);
      installeur = lancerInstallationWindows({ pid: app.pid ?? assert.fail("no pid"), installeur: lancable, version: prete.version, app: pc.app, dossier: pc.dossier, env: pc.env });
    },
    quitter: () => void app.stdin?.end(),
    surEtat: (etat) => void etats.push(etat),
  });
  t.after(() => avant.fermer());
  assert.equal(avant.auLancement(), false);
  assert.equal(await avant.installerMaintenant(), undefined);
  assert.deepEqual([...new Set(etats.map(({ etat }) => etat))], ["verification", "disponible", "telechargement", "prete", "installation"]);
  await fermee;
  await rouverte(pc);
  await jusqua(() => !vivant(installeur ?? assert.fail("the installer was not launched")));
  assert.equal(pc.echec(), undefined);
  // Rouverte : sa version est la 1.1.0, rien ne reste à installer, et elle est à jour.
  const apres = tenirMiseAJour({ version: versionInstallee(), flux: fluxDe(faux.adresse, WINDOWS), dossier: pc.dossier, installable: () => undefined, installer: () => assert.fail("nothing to install"), quitter: () => assert.fail("no quit"), surEtat: () => {} });
  t.after(() => apres.fermer());
  assert.equal(apres.auLancement(), false);
  assert.equal((await apres.verifier()).etat, "a-jour");
  assert.equal(apres.vu().version, "1.1.0");
  assert.deepEqual(readdirSync(pc.dossier), []);
});
