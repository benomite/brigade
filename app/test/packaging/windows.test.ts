// L'installeur Windows de l'app (app/packaging/windows.ts) : ce que porte le dossier installé, ce
// que l'app installée y trouve, et le script NSIS qui le pose et le retire. Ni réseau ni Windows :
// Electron est une doublure de son zip, `makensis` une doublure qui relève ce qu'on lui demande. Ce
// qui ne se prouve que sur un Windows — l'installeur qui s'ouvre, l'app qui atteint son écran
// principal, le désinstalleur — est joué par app/packaging/essai-windows.ts, en CI (app-windows).
//
// Avec BRIGADE_NSIS, le dossier d'un paquet NSIS extrait (app/packaging/WINDOWS.md), le vrai
// `makensis` compile aussi le script ; sans lui, ce test est sauté, en le disant.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { cheminSansNode } from "../../packaging/essai-windows.ts";
import { APP } from "../../packaging/construire.ts";
import {
  assembler,
  CLE_DE_DESINSTALLATION,
  construire,
  DESINSTALLEUR,
  estPeX64,
  executerVraiment,
  EXE,
  ICONE,
  extraireZip,
  makensisDe,
  NODE_EXE,
  nomDeLInstalleur,
  scriptNsis,
  type Executer,
} from "../../packaging/windows.ts";
import { emplacementsDe } from "../../src/emplacements.ts";

const WINDOWS = join(APP, "packaging", "windows.ts");

const temporaire = (t: TestContext) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-windows-test-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  return dossier;
};
const ecrire = (chemin: string, contenu: string | Buffer = "x") => {
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, contenu);
};

// L'en-tête d'un exécutable PE : MZ, l'adresse de l'en-tête PE, puis sa machine.
function enTetePe(machine: number): Buffer {
  const pe = Buffer.alloc(0x100);
  pe.write("MZ", 0, "latin1");
  pe.writeUInt32LE(0x80, 0x3c);
  pe.write("PE\0\0", 0x80, "latin1");
  pe.writeUInt16LE(machine, 0x84);
  return pe;
}

// Un zip, comme en écrit un outil ordinaire : chaque entrée rangée ou dégonflée, puis son répertoire central.
function zipDe(entrees: { nom: string; contenu?: Buffer; methode?: 0 | 8; crc?: number }[]): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let position = 0;
  for (const { nom, contenu = Buffer.alloc(0), methode = 8, crc } of entrees) {
    const donnees = methode === 8 ? deflateRawSync(contenu) : contenu;
    const nomBrut = Buffer.from(nom, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(methode, 8);
    local.writeUInt32LE(crc ?? crc32(contenu), 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(contenu.length, 22);
    local.writeUInt16LE(nomBrut.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(methode, 10);
    central.writeUInt32LE(crc ?? crc32(contenu), 16);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(contenu.length, 24);
    central.writeUInt16LE(nomBrut.length, 28);
    central.writeUInt32LE(position, 42);
    locaux.push(local, nomBrut, donnees);
    centraux.push(central, nomBrut);
    position += local.length + nomBrut.length + donnees.length;
  }
  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(position, 16);
  return Buffer.concat([...locaux, repertoire, fin]);
}

// Electron pour win32-x64 tel que son zip le livre, l'app et le runtime tels que le dépôt les range,
// et un `node.exe` : de quoi assembler, sans réseau.
function sources(t: TestContext) {
  const racine = temporaire(t);
  const electron = join(racine, "electron");
  ecrire(join(electron, "electron.exe"), enTetePe(0x8664));
  ecrire(join(electron, "ffmpeg.dll"));
  ecrire(join(electron, "resources.pak"));
  ecrire(join(electron, "locales", "fr.pak"));
  ecrire(join(electron, "resources", "default_app.asar"));
  const app = join(racine, "app");
  ecrire(join(app, "src", "main.ts"), "// l'app");
  ecrire(join(app, "src", "vue", "index.html"), "<!doctype html>");
  ecrire(join(app, "package.json"), JSON.stringify({ name: "brigade-app", version: "0.0.0", type: "module", main: "src/main.ts", scripts: { start: "electron ." }, dependencies: { "node-pty": "1.1.0" }, devDependencies: { electron: "44.7.0" } }));
  ecrire(join(app, "package-lock.json"), JSON.stringify({ packages: { "": {}, "node_modules/node-pty": {}, "node_modules/@xterm/xterm": {}, "node_modules/electron": { dev: true } } }));
  ecrire(join(app, "node_modules", "@xterm", "xterm", "lib", "xterm.mjs"));
  ecrire(join(app, "node_modules", "electron", "index.js"));
  const pty = join(app, "node_modules", "node-pty");
  ecrire(join(pty, "lib", "index.js"));
  ecrire(join(pty, "binding.gyp"));
  ecrire(join(pty, "build", "Release", "pty.node"));
  ecrire(join(pty, "src", "unix", "pty.cc"));
  for (const binaire of ["pty.node", "pty.pdb", "conpty.node", "conpty.pdb", "conpty/OpenConsole.exe", "conpty/conpty.dll", "winpty.dll", "winpty-agent.exe"]) ecrire(join(pty, "prebuilds", "win32-x64", binaire));
  ecrire(join(pty, "prebuilds", "darwin-arm64", "pty.node"));
  ecrire(join(pty, "prebuilds", "win32-arm64", "pty.node"));
  const runtime = join(racine, "runtime");
  ecrire(join(runtime, "src", "station", "main.ts"), "// la station");
  ecrire(join(runtime, "package.json"), JSON.stringify({ name: "brigade-runtime", version: "0.0.0", type: "module", engines: { node: ">=26" } }));
  const node = join(racine, "node.exe");
  ecrire(node, enTetePe(0x8664));
  return { racine, electron, app, runtime, node };
}

// Un paquet NSIS comme celui qu'épingle windows.ts : un `makensis` par machine qui construit, et
// les fichiers de Windows à part.
function paquetNsis(racine: string): string {
  const paquet = join(racine, "nsis-bundle");
  for (const binaire of ["windows/makensis.exe", "linux/x64/makensis", "linux/arm64/makensis", "mac/x64/makensis", "mac/arm64/makensis"]) ecrire(join(paquet, binaire));
  ecrire(join(paquet, "windows", "Include", "MUI2.nsh"));
  return paquet;
}

test("estPeX64 : un exécutable Windows pour x64, et rien d'autre", () => {
  assert.equal(estPeX64(enTetePe(0x8664)), true);
  assert.equal(estPeX64(enTetePe(0x014c)), false, "un exécutable 32 bits");
  assert.equal(estPeX64(enTetePe(0xaa64)), false, "un exécutable pour arm64");
  assert.equal(estPeX64(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01])), false, "un Mach-O");
  assert.equal(estPeX64(Buffer.from("MZ")), false, "un en-tête tronqué");
});

test("extraireZip : les fichiers rangés et dégonflés, et les dossiers, à leur place", (t) => {
  const dossier = temporaire(t);
  const gros = Buffer.alloc(200_000, "brigade ");
  extraireZip(
    zipDe([
      { nom: "locales/", methode: 0 },
      { nom: "locales/fr.pak", contenu: Buffer.from("fr") },
      { nom: "electron.exe", contenu: gros },
      { nom: "LICENSE", contenu: Buffer.from("MIT"), methode: 0 },
      { nom: "resources/default_app.asar", contenu: Buffer.from("asar") },
    ]),
    dossier,
  );
  assert.equal(readFileSync(join(dossier, "locales", "fr.pak"), "utf8"), "fr");
  assert.deepEqual(readFileSync(join(dossier, "electron.exe")), gros);
  assert.equal(readFileSync(join(dossier, "LICENSE"), "utf8"), "MIT");
  assert.equal(readFileSync(join(dossier, "resources", "default_app.asar"), "utf8"), "asar");
});

test("extraireZip : refuse un nom qui sort du dossier, et une entrée qui ne correspond pas à son CRC", (t) => {
  const dossier = temporaire(t);
  assert.throws(() => extraireZip(zipDe([{ nom: "../dehors.txt", contenu: Buffer.from("x") }]), join(dossier, "a")), /outside its folder/);
  assert.equal(existsSync(join(dossier, "dehors.txt")), false);
  assert.throws(() => extraireZip(zipDe([{ nom: "abime.dll", contenu: Buffer.from("x"), crc: 1 }]), join(dossier, "b")), /does not match its checksum/);
  assert.throws(() => extraireZip(Buffer.from("pas un zip"), join(dossier, "c")), /no central directory/);
});

test("assembler : Electron renommé, l'app, ses dépendances de production, le runtime et le node.exe", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const arbre = assembler({ version: "1.2.3+gabc", electron, node, app, runtime }, join(racine, "arbre", "Brigade"));
  assert.equal(existsSync(join(arbre, EXE)), true);
  assert.equal(existsSync(join(arbre, "electron.exe")), false, "l'exécutable porte le nom de l'app");
  assert.equal(existsSync(join(arbre, "ffmpeg.dll")), true);
  assert.equal(existsSync(join(arbre, "locales", "fr.pak")), true);
  const ressources = join(arbre, "resources");
  assert.equal(existsSync(join(ressources, "default_app.asar")), false, "l'app n'est pas l'app par défaut d'Electron");

  const paquet = JSON.parse(readFileSync(join(ressources, "app", "package.json"), "utf8"));
  assert.equal(paquet.productName, "Brigade");
  assert.equal(paquet.version, "1.2.3+gabc");
  assert.equal(paquet.main, "src/main.ts");
  assert.equal(paquet.scripts, undefined);
  assert.equal(paquet.devDependencies, undefined);
  assert.equal(readFileSync(join(ressources, "app", "src", "main.ts"), "utf8"), "// l'app");
  assert.equal(existsSync(join(ressources, "app", "node_modules", "@xterm", "xterm", "lib", "xterm.mjs")), true);
  assert.equal(existsSync(join(ressources, "app", "node_modules", "electron")), false, "une dépendance de dev n'est pas portée");

  const pty = join(ressources, "app", "node_modules", "node-pty");
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["win32-x64"]);
  assert.deepEqual(readdirSync(join(pty, "prebuilds", "win32-x64")).sort(), ["conpty", "conpty.node", "pty.node", "winpty-agent.exe", "winpty.dll"]);
  for (const source of ["build", "src", "binding.gyp"]) assert.equal(existsSync(join(pty, source)), false, `${source} n'est pas porté`);
  assert.equal(existsSync(join(pty, "lib", "index.js")), true);

  assert.equal(readFileSync(join(ressources, "runtime", "src", "station", "main.ts"), "utf8"), "// la station");
  assert.equal(JSON.parse(readFileSync(join(ressources, "runtime", "package.json"), "utf8")).version, "1.2.3+gabc");
  assert.deepEqual(readFileSync(join(ressources, NODE_EXE)), readFileSync(node));
});

test("l'app installée lance le node.exe du paquet : le nom qu'elle donne, plus l'extension que Windows lui trouve", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const ressources = join(assembler({ version: "1.2.3", electron, node, app, runtime }, join(racine, "Brigade")), "resources");
  const emplacements = emplacementsDe({ ressources, src: join(ressources, "app", "src"), env: {} });
  assert.equal(emplacements.facon, "installee");
  assert.equal(emplacements.clone, undefined);
  assert.equal(emplacements.runtime, join(ressources, "runtime"));
  assert.equal(`${emplacements.node}.exe`, join(ressources, NODE_EXE));
  assert.equal(existsSync(`${emplacements.node}.exe`), true);
});

test("assembler : refuse un Electron qui n'est pas celui de Windows, et un node-pty sans build win32-x64", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  assert.throws(() => assembler({ version: "1.2.3", electron: app, node, app, runtime }, join(racine, "a")), /not an Electron for Windows/);
  rmSync(join(app, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.node"));
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, runtime }, join(racine, "b")), /node-pty has no build for win32-x64/);
});

test("scriptNsis : installé pour le compte, un raccourci au menu Démarrer, un désinstalleur qui ne retire que ce qu'il a posé", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const arbre = assembler({ version: "1.2.3+gabc", electron, node, app, runtime }, join(racine, "Brigade"));
  const installeur = join(racine, "sortie", nomDeLInstalleur("1.2.3+gabc"));
  const script = scriptNsis({ version: "1.2.3+gabc", arbre, installeur });
  const lignes = script.split("\n").map((ligne) => ligne.trim());
  const [installation, desinstallation] = script.split('Section "Uninstall"');
  assert.ok(installation !== undefined && desinstallation !== undefined);

  assert.ok(lignes.includes("RequestExecutionLevel user"), "ni administrateur ni UAC");
  assert.ok(lignes.includes('InstallDir "$LOCALAPPDATA\\Programs\\Brigade"'));
  assert.ok(lignes.includes(`OutFile "${installeur}"`));
  assert.ok(lignes.includes(`File /r "${join(arbre, "*")}"`));
  assert.ok(lignes.includes(`WriteUninstaller "$INSTDIR\\${DESINSTALLEUR}"`));
  assert.ok(lignes.includes(`CreateShortcut "$SMPROGRAMS\\Brigade.lnk" "$INSTDIR\\${EXE}" "" "$INSTDIR\\${ICONE}" 0`));
  assert.ok(lignes.includes(`WinShell::SetLnkAUMI "$SMPROGRAMS\\Brigade.lnk" "$INSTDIR\\${EXE}"`), "l'AppUserModelID de l'app : process.execPath");
  assert.ok(lignes.includes(`WriteRegStr HKCU "${CLE_DE_DESINSTALLATION}" "DisplayVersion" "1.2.3+gabc"`));
  assert.ok(lignes.includes(`WriteRegStr HKCU "${CLE_DE_DESINSTALLATION}" "QuietUninstallString" '"$INSTDIR\\${DESINSTALLEUR}" /S'`));

  // Ce qui est retiré : chaque entrée posée, par son nom — avant de poser une nouvelle version comme à la désinstallation.
  for (const partie of [installation, desinstallation]) {
    for (const dossier of ["locales", "resources"]) assert.ok(partie.includes(`RMDir /r "$INSTDIR\\${dossier}"`), dossier);
    for (const fichier of [EXE, "ffmpeg.dll", "resources.pak"]) assert.ok(partie.includes(`Delete "$INSTDIR\\${fichier}"`), fichier);
  }
  assert.ok(desinstallation.includes('Delete "$SMPROGRAMS\\Brigade.lnk"'));
  assert.ok(desinstallation.includes(`Delete "$INSTDIR\\${DESINSTALLEUR}"`));
  assert.ok(desinstallation.includes(`DeleteRegKey HKCU "${CLE_DE_DESINSTALLATION}"`));
  assert.ok(desinstallation.includes('RMDir "$INSTDIR"'), "le dossier, s'il est vide");
  assert.ok(!script.includes('RMDir /r "$INSTDIR"\n'), "jamais le dossier entier : installée ailleurs par /D=, l'app n'y retire rien d'autre");
});

test("scriptNsis : un chemin de la machine qui construit ne se lit pas comme une variable de NSIS", (t) => {
  const racine = temporaire(t);
  const arbre = join(racine, "a$PROFILE");
  ecrire(join(arbre, EXE));
  const script = scriptNsis({ version: "1.2.3", arbre, installeur: join(racine, 'sortie "1"', "x.exe") });
  assert.ok(script.includes(`File /r "${join(racine, "a$$PROFILE", "*")}"`));
  assert.ok(script.includes(`OutFile "${join(racine, 'sortie $\\"1$\\"', "x.exe")}"`));
});

test("makensisDe : le makensis du paquet pour la machine qui construit, et ses fichiers de Windows", (t) => {
  const paquet = paquetNsis(temporaire(t));
  assert.deepEqual(makensisDe(paquet, "win32", "x64"), { commande: join(paquet, "windows", "makensis.exe"), nsisdir: join(paquet, "windows") });
  assert.equal(makensisDe(paquet, "linux", "x64").commande, join(paquet, "linux", "x64", "makensis"));
  assert.equal(makensisDe(paquet, "linux", "arm64").commande, join(paquet, "linux", "arm64", "makensis"));
  assert.equal(makensisDe(paquet, "darwin", "arm64").commande, join(paquet, "mac", "arm64", "makensis"));
  assert.throws(() => makensisDe(paquet, "freebsd", "x64"), /no makensis for freebsd-x64/);
  assert.throws(() => makensisDe(join(paquet, "windows"), "linux", "x64"), /is not the NSIS bundle/);
});

test("construire : un seul installeur, au nom de sa version, sous la sortie", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const nsis = paquetNsis(racine);
  const appels: { commande: string; args: readonly string[]; nsisdir: string | undefined }[] = [];
  // Le faux makensis écrit le fichier que nomme l'OutFile du script.
  const executer: Executer = (commande, args, env) => {
    appels.push({ commande, args, nsisdir: env?.NSISDIR });
    const script = readFileSync(args.at(-1) ?? "", "utf8");
    const sortie = /^OutFile "(.*)"$/m.exec(script)?.[1] ?? "";
    ecrire(sortie, enTetePe(0x014c));
    return { status: 0, stdout: "", stderr: "" };
  };
  const sortie = join(racine, "construit");
  const installeur = construire({ version: "1.2.3+gabc", electron, node, app, runtime, nsis, sortie, atelier: join(racine, "atelier"), executer });
  assert.equal(installeur, join(sortie, "Brigade-1.2.3+gabc-x64-setup.exe"));
  assert.deepEqual(readdirSync(sortie), ["Brigade-1.2.3+gabc-x64-setup.exe"]);
  assert.equal(appels.length, 1);
  assert.equal(appels[0]?.commande, makensisDe(nsis).commande);
  assert.equal(appels[0]?.nsisdir, join(nsis, "windows"));
});

test("construire : un makensis qui échoue fait échouer la construction, en disant pourquoi", (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const executer: Executer = () => ({ status: 1, stdout: "", stderr: "Error in script on line 12" });
  assert.throws(
    () => construire({ version: "1.2.3", electron, node, app, runtime, nsis: paquetNsis(racine), sortie: join(racine, "construit"), atelier: join(racine, "atelier"), executer }),
    (erreur: Error & { code?: number }) => erreur.code === 1 && /makensis failed .*Error in script on line 12/.test(erreur.message),
  );
});

test("construire : refuse un node qui n'est pas un exécutable Windows x64", (t) => {
  const { racine, electron, app, runtime } = sources(t);
  const node = join(racine, "node");
  ecrire(node, "#!/bin/sh\n");
  assert.throws(
    () => construire({ version: "1.2.3", electron, node, app, runtime, nsis: paquetNsis(racine), sortie: join(racine, "construit"), atelier: join(racine, "atelier"), executer: executerVraiment }),
    (erreur: Error & { code?: number }) => erreur.code === 2 && /not a Windows x64 executable/.test(erreur.message),
  );
  assert.equal(existsSync(join(racine, "construit")), false);
});

test("la commande refuse une option ou une version invalide, et un node à porter qui n'en est pas un, sans rien écrire", (t) => {
  const racine = temporaire(t);
  const lancer = (...args: string[]) => spawnSync(process.execPath, [WINDOWS, "--sortie", join(racine, "construit"), ...args], { encoding: "utf8" });
  const inconnue = lancer("--inconnue");
  assert.equal(inconnue.status, 2);
  assert.match(inconnue.stderr, /usage: windows\.ts/);
  const version = lancer("--version", "un.deux");
  assert.equal(version.status, 2);
  assert.match(version.stderr, /invalid version/);
  const absent = lancer("--version", "1.2.3", "--node", join(racine, "absent.exe"));
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /--node is a missing file/);
  ecrire(join(racine, "node"), "pas un exe");
  const pasUnExe = lancer("--version", "1.2.3", "--node", join(racine, "node"));
  assert.equal(pasUnExe.status, 2);
  assert.match(pasUnExe.stderr, /not a Windows x64 executable/);
  assert.equal(existsSync(join(racine, "construit")), false);
});

test("cheminSansNode : le PATH de l'essai, sans aucun dossier qui porte un node.exe", () => {
  const [systeme, nodejs, outils] = [join("Windows", "System32"), join("Program Files", "nodejs"), "outils"];
  assert.equal(cheminSansNode([systeme, nodejs, "", outils].join(delimiter), (fichier) => fichier === join(nodejs, "node.exe")), [systeme, outils].join(delimiter));
});

test("le vrai makensis compile le script de l'installeur", { skip: process.env.BRIGADE_NSIS ? false : "BRIGADE_NSIS (an extracted NSIS bundle) is not set" }, (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const sortie = join(racine, "construit");
  const installeur = construire({ version: "1.2.3", electron, node, app, runtime, nsis: process.env.BRIGADE_NSIS ?? "", sortie, atelier: join(racine, "atelier"), executer: executerVraiment });
  const debut = readFileSync(installeur).subarray(0, 2).toString("latin1");
  assert.equal(debut, "MZ", "un exécutable Windows");
});
