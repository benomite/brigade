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
import { locationsOf } from "../../src/locations.ts";

const WINDOWS = join(APP, "packaging", "windows.ts");

const temporary = (t: TestContext) => {
  const folder = mkdtempSync(join(tmpdir(), "brigade-windows-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
};
const write = (path: string, content: string | Buffer = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};

// L'en-tête d'un exécutable PE : MZ, l'adresse de l'en-tête PE, puis sa machine.
function inHeadPe(machine: number): Buffer {
  const pe = Buffer.alloc(0x100);
  pe.write("MZ", 0, "latin1");
  pe.writeUInt32LE(0x80, 0x3c);
  pe.write("PE\0\0", 0x80, "latin1");
  pe.writeUInt16LE(machine, 0x84);
  return pe;
}

// Un zip, comme en écrit un outil ordinaire : chaque entrée rangée ou dégonflée, puis son répertoire central.
function zipOf(entries: { nom: string; contenu?: Buffer; methode?: 0 | 8; crc?: number }[]): Buffer {
  const localOnes: Buffer[] = [];
  const centralOnes: Buffer[] = [];
  let position = 0;
  for (const { nom: name, contenu: content = Buffer.alloc(0), methode: method = 8, crc } of entries) {
    const data = method === 8 ? deflateRawSync(content) : content;
    const nameRaw = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc ?? crc32(content), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameRaw.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc ?? crc32(content), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameRaw.length, 28);
    central.writeUInt32LE(position, 42);
    localOnes.push(local, nameRaw, data);
    centralOnes.push(central, nameRaw);
    position += local.length + nameRaw.length + data.length;
  }
  const directory = Buffer.concat(centralOnes);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(position, 16);
  return Buffer.concat([...localOnes, directory, end]);
}

// Electron pour win32-x64 tel que son zip le livre, l'app et le runtime tels que le dépôt les range,
// et un `node.exe` : de quoi assembler, sans réseau.
function sources(t: TestContext) {
  const root = temporary(t);
  const electron = join(root, "electron");
  write(join(electron, "electron.exe"), inHeadPe(0x8664));
  write(join(electron, "ffmpeg.dll"));
  write(join(electron, "resources.pak"));
  write(join(electron, "locales", "fr.pak"));
  write(join(electron, "resources", "default_app.asar"));
  const app = join(root, "app");
  write(join(app, "src", "main.ts"), "// l'app");
  write(join(app, "src", "vue", "index.html"), "<!doctype html>");
  write(join(app, "package.json"), JSON.stringify({ name: "brigade-app", version: "0.0.0", type: "module", main: "src/main.ts", scripts: { start: "electron ." }, dependencies: { "node-pty": "1.1.0" }, devDependencies: { electron: "44.7.0" } }));
  write(join(app, "package-lock.json"), JSON.stringify({ packages: { "": {}, "node_modules/node-pty": {}, "node_modules/@xterm/xterm": {}, "node_modules/electron": { dev: true } } }));
  write(join(app, "node_modules", "@xterm", "xterm", "lib", "xterm.mjs"));
  write(join(app, "node_modules", "electron", "index.js"));
  const pty = join(app, "node_modules", "node-pty");
  write(join(pty, "lib", "index.js"));
  write(join(pty, "binding.gyp"));
  write(join(pty, "build", "Release", "pty.node"));
  write(join(pty, "src", "unix", "pty.cc"));
  for (const binary of ["pty.node", "pty.pdb", "conpty.node", "conpty.pdb", "conpty/OpenConsole.exe", "conpty/conpty.dll", "winpty.dll", "winpty-agent.exe"]) write(join(pty, "prebuilds", "win32-x64", binary));
  write(join(pty, "prebuilds", "darwin-arm64", "pty.node"));
  write(join(pty, "prebuilds", "win32-arm64", "pty.node"));
  const runtime = join(root, "runtime");
  write(join(runtime, "src", "station", "main.ts"), "// la station");
  write(join(runtime, "package.json"), JSON.stringify({ name: "brigade-runtime", version: "0.0.0", type: "module", engines: { node: ">=26" } }));
  const node = join(root, "node.exe");
  write(node, inHeadPe(0x8664));
  return { racine: root, electron, app, runtime, node };
}

// Un paquet NSIS comme celui qu'épingle windows.ts : un `makensis` par machine qui construit, et
// les fichiers de Windows à part.
function packageNsis(root: string): string {
  const pkg = join(root, "nsis-bundle");
  for (const binary of ["windows/makensis.exe", "linux/x64/makensis", "linux/arm64/makensis", "mac/x64/makensis", "mac/arm64/makensis"]) write(join(pkg, binary));
  write(join(pkg, "windows", "Include", "MUI2.nsh"));
  return pkg;
}

test("estPeX64 : un exécutable Windows pour x64, et rien d'autre", () => {
  assert.equal(estPeX64(inHeadPe(0x8664)), true);
  assert.equal(estPeX64(inHeadPe(0x014c)), false, "un exécutable 32 bits");
  assert.equal(estPeX64(inHeadPe(0xaa64)), false, "un exécutable pour arm64");
  assert.equal(estPeX64(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01])), false, "un Mach-O");
  assert.equal(estPeX64(Buffer.from("MZ")), false, "un en-tête tronqué");
});

test("extraireZip : les fichiers rangés et dégonflés, et les dossiers, à leur place", (t) => {
  const folder = temporary(t);
  const big = Buffer.alloc(200_000, "brigade ");
  extraireZip(
    zipOf([
      { nom: "locales/", methode: 0 },
      { nom: "locales/fr.pak", contenu: Buffer.from("fr") },
      { nom: "electron.exe", contenu: big },
      { nom: "LICENSE", contenu: Buffer.from("MIT"), methode: 0 },
      { nom: "resources/default_app.asar", contenu: Buffer.from("asar") },
    ]),
    folder,
  );
  assert.equal(readFileSync(join(folder, "locales", "fr.pak"), "utf8"), "fr");
  assert.deepEqual(readFileSync(join(folder, "electron.exe")), big);
  assert.equal(readFileSync(join(folder, "LICENSE"), "utf8"), "MIT");
  assert.equal(readFileSync(join(folder, "resources", "default_app.asar"), "utf8"), "asar");
});

test("extraireZip : refuse un nom qui sort du dossier, et une entrée qui ne correspond pas à son CRC", (t) => {
  const folder = temporary(t);
  assert.throws(() => extraireZip(zipOf([{ nom: "../dehors.txt", contenu: Buffer.from("x") }]), join(folder, "a")), /outside its folder/);
  assert.equal(existsSync(join(folder, "dehors.txt")), false);
  assert.throws(() => extraireZip(zipOf([{ nom: "abime.dll", contenu: Buffer.from("x"), crc: 1 }]), join(folder, "b")), /does not match its checksum/);
  assert.throws(() => extraireZip(Buffer.from("pas un zip"), join(folder, "c")), /no central directory/);
});

test("assembler : Electron renommé, l'app, ses dépendances de production, le runtime et le node.exe", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const tree = assembler({ version: "1.2.3+gabc", electron, node, app, runtime }, join(root, "arbre", "Brigade"));
  assert.equal(existsSync(join(tree, EXE)), true);
  assert.equal(existsSync(join(tree, "electron.exe")), false, "l'exécutable porte le nom de l'app");
  assert.equal(existsSync(join(tree, "ffmpeg.dll")), true);
  assert.equal(existsSync(join(tree, "locales", "fr.pak")), true);
  const resources = join(tree, "resources");
  assert.equal(existsSync(join(resources, "default_app.asar")), false, "l'app n'est pas l'app par défaut d'Electron");

  const pkg = JSON.parse(readFileSync(join(resources, "app", "package.json"), "utf8"));
  assert.equal(pkg.productName, "Brigade");
  assert.equal(pkg.version, "1.2.3+gabc");
  assert.equal(pkg.main, "src/main.ts");
  assert.equal(pkg.scripts, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(readFileSync(join(resources, "app", "src", "main.ts"), "utf8"), "// l'app");
  assert.equal(existsSync(join(resources, "app", "node_modules", "@xterm", "xterm", "lib", "xterm.mjs")), true);
  assert.equal(existsSync(join(resources, "app", "node_modules", "electron")), false, "une dépendance de dev n'est pas portée");

  const pty = join(resources, "app", "node_modules", "node-pty");
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["win32-x64"]);
  assert.deepEqual(readdirSync(join(pty, "prebuilds", "win32-x64")).sort(), ["conpty", "conpty.node", "pty.node", "winpty-agent.exe", "winpty.dll"]);
  for (const source of ["build", "src", "binding.gyp"]) assert.equal(existsSync(join(pty, source)), false, `${source} n'est pas porté`);
  assert.equal(existsSync(join(pty, "lib", "index.js")), true);

  assert.equal(readFileSync(join(resources, "runtime", "src", "station", "main.ts"), "utf8"), "// la station");
  // Les commandes du plugin de l'app (src/plugin-app.ts) : `dev.md` et `ask.md` de `commands/`, et rien d'autre.
  assert.deepEqual(readdirSync(join(resources, "plugin", "commands")).sort(), ["ask.md", "dev.md"]);
  assert.equal(readFileSync(join(resources, "plugin", "commands", "ask.md"), "utf8"), readFileSync(join(APP, "..", "commands", "ask.md"), "utf8"));
  assert.equal(JSON.parse(readFileSync(join(resources, "runtime", "package.json"), "utf8")).version, "1.2.3+gabc");
  assert.deepEqual(readFileSync(join(resources, NODE_EXE)), readFileSync(node));
});

test("l'app installée lance le node.exe du paquet : le nom qu'elle donne, plus l'extension que Windows lui trouve", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const resources = join(assembler({ version: "1.2.3", electron, node, app, runtime }, join(root, "Brigade")), "resources");
  const locations = locationsOf({ ressources: resources, src: join(resources, "app", "src"), env: {} });
  assert.equal(locations.facon, "installee");
  assert.equal(locations.clone, undefined);
  assert.equal(locations.runtime, join(resources, "runtime"));
  assert.equal(`${locations.node}.exe`, join(resources, NODE_EXE));
  assert.equal(existsSync(`${locations.node}.exe`), true);
});

test("assembler : refuse un Electron qui n'est pas celui de Windows, et un node-pty sans build win32-x64", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  assert.throws(() => assembler({ version: "1.2.3", electron: app, node, app, runtime }, join(root, "a")), /not an Electron for Windows/);
  rmSync(join(app, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.node"));
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, runtime }, join(root, "b")), /node-pty has no build for win32-x64/);
});

test("scriptNsis : installé pour le compte, un raccourci au menu Démarrer, un désinstalleur qui ne retire que ce qu'il a posé", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const tree = assembler({ version: "1.2.3+gabc", electron, node, app, runtime }, join(root, "Brigade"));
  const installer = join(root, "sortie", nomDeLInstalleur("1.2.3+gabc"));
  const script = scriptNsis({ version: "1.2.3+gabc", arbre: tree, installeur: installer });
  const lines = script.split("\n").map((line) => line.trim());
  const [installation, desinstallation] = script.split('Section "Uninstall"');
  assert.ok(installation !== undefined && desinstallation !== undefined);

  assert.ok(lines.includes("RequestExecutionLevel user"), "ni administrateur ni UAC");
  assert.ok(lines.includes('InstallDir "$LOCALAPPDATA\\Programs\\Brigade"'));
  assert.ok(lines.includes(`OutFile "${installer}"`));
  assert.ok(lines.includes(`File /r "${join(tree, "*")}"`));
  assert.ok(lines.includes(`WriteUninstaller "$INSTDIR\\${DESINSTALLEUR}"`));
  assert.ok(lines.includes(`CreateShortcut "$SMPROGRAMS\\Brigade.lnk" "$INSTDIR\\${EXE}" "" "$INSTDIR\\${ICONE}" 0`));
  assert.ok(lines.includes(`WinShell::SetLnkAUMI "$SMPROGRAMS\\Brigade.lnk" "$INSTDIR\\${EXE}"`), "l'AppUserModelID de l'app : process.execPath");
  assert.ok(lines.includes(`WriteRegStr HKCU "${CLE_DE_DESINSTALLATION}" "DisplayVersion" "1.2.3+gabc"`));
  assert.ok(lines.includes(`WriteRegStr HKCU "${CLE_DE_DESINSTALLATION}" "QuietUninstallString" '"$INSTDIR\\${DESINSTALLEUR}" /S'`));

  // Ce qui est retiré : chaque entrée posée, par son nom — avant de poser une nouvelle version comme à la désinstallation.
  for (const part of [installation, desinstallation]) {
    for (const folder of ["locales", "resources"]) assert.ok(part.includes(`RMDir /r "$INSTDIR\\${folder}"`), folder);
    for (const file of [EXE, "ffmpeg.dll", "resources.pak"]) assert.ok(part.includes(`Delete "$INSTDIR\\${file}"`), file);
  }
  assert.ok(desinstallation.includes('Delete "$SMPROGRAMS\\Brigade.lnk"'));
  assert.ok(desinstallation.includes(`Delete "$INSTDIR\\${DESINSTALLEUR}"`));
  assert.ok(desinstallation.includes(`DeleteRegKey HKCU "${CLE_DE_DESINSTALLATION}"`));
  assert.ok(desinstallation.includes('RMDir "$INSTDIR"'), "le dossier, s'il est vide");
  assert.ok(!script.includes('RMDir /r "$INSTDIR"\n'), "jamais le dossier entier : installée ailleurs par /D=, l'app n'y retire rien d'autre");
});

test("scriptNsis : un chemin de la machine qui construit ne se lit pas comme une variable de NSIS", (t) => {
  const root = temporary(t);
  const tree = join(root, "a$PROFILE");
  write(join(tree, EXE));
  const script = scriptNsis({ version: "1.2.3", arbre: tree, installeur: join(root, 'sortie "1"', "x.exe") });
  assert.ok(script.includes(`File /r "${join(root, "a$$PROFILE", "*")}"`));
  assert.ok(script.includes(`OutFile "${join(root, 'sortie $\\"1$\\"', "x.exe")}"`));
});

test("makensisDe : le makensis du paquet pour la machine qui construit, et ses fichiers de Windows", (t) => {
  const pkg = packageNsis(temporary(t));
  assert.deepEqual(makensisDe(pkg, "win32", "x64"), { commande: join(pkg, "windows", "makensis.exe"), nsisdir: join(pkg, "windows") });
  assert.equal(makensisDe(pkg, "linux", "x64").commande, join(pkg, "linux", "x64", "makensis"));
  assert.equal(makensisDe(pkg, "linux", "arm64").commande, join(pkg, "linux", "arm64", "makensis"));
  assert.equal(makensisDe(pkg, "darwin", "arm64").commande, join(pkg, "mac", "arm64", "makensis"));
  assert.throws(() => makensisDe(pkg, "freebsd", "x64"), /no makensis for freebsd-x64/);
  assert.throws(() => makensisDe(join(pkg, "windows"), "linux", "x64"), /is not the NSIS bundle/);
});

test("construire : un seul installeur, au nom de sa version, sous la sortie", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const nsis = packageNsis(root);
  const calls: { commande: string; args: readonly string[]; nsisdir: string | undefined }[] = [];
  // Le faux makensis écrit le fichier que nomme l'OutFile du script.
  const run: Executer = (command, args, env) => {
    calls.push({ commande: command, args, nsisdir: env?.NSISDIR });
    const script = readFileSync(args.at(-1) ?? "", "utf8");
    const output = /^OutFile "(.*)"$/m.exec(script)?.[1] ?? "";
    write(output, inHeadPe(0x014c));
    return { status: 0, stdout: "", stderr: "" };
  };
  const output = join(root, "construit");
  const installer = construire({ version: "1.2.3+gabc", electron, node, app, runtime, nsis, sortie: output, atelier: join(root, "atelier"), executer: run });
  assert.equal(installer, join(output, "Brigade-1.2.3+gabc-x64-setup.exe"));
  assert.deepEqual(readdirSync(output), ["Brigade-1.2.3+gabc-x64-setup.exe"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.commande, makensisDe(nsis).commande);
  assert.equal(calls[0]?.nsisdir, join(nsis, "windows"));
});

test("construire : un makensis qui échoue fait échouer la construction, en disant pourquoi", (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const run: Executer = () => ({ status: 1, stdout: "", stderr: "Error in script on line 12" });
  assert.throws(
    () => construire({ version: "1.2.3", electron, node, app, runtime, nsis: packageNsis(root), sortie: join(root, "construit"), atelier: join(root, "atelier"), executer: run }),
    (error: Error & { code?: number }) => error.code === 1 && /makensis failed .*Error in script on line 12/.test(error.message),
  );
});

test("construire : refuse un node qui n'est pas un exécutable Windows x64", (t) => {
  const { racine: root, electron, app, runtime } = sources(t);
  const node = join(root, "node");
  write(node, "#!/bin/sh\n");
  assert.throws(
    () => construire({ version: "1.2.3", electron, node, app, runtime, nsis: packageNsis(root), sortie: join(root, "construit"), atelier: join(root, "atelier"), executer: executerVraiment }),
    (error: Error & { code?: number }) => error.code === 2 && /not a Windows x64 executable/.test(error.message),
  );
  assert.equal(existsSync(join(root, "construit")), false);
});

test("la commande refuse une option ou une version invalide, et un node à porter qui n'en est pas un, sans rien écrire", (t) => {
  const root = temporary(t);
  const launch = (...args: string[]) => spawnSync(process.execPath, [WINDOWS, "--sortie", join(root, "construit"), ...args], { encoding: "utf8" });
  const unknown = launch("--inconnue");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /usage: windows\.ts/);
  const version = launch("--version", "un.deux");
  assert.equal(version.status, 2);
  assert.match(version.stderr, /invalid version/);
  const absent = launch("--version", "1.2.3", "--node", join(root, "absent.exe"));
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /--node is a missing file/);
  write(join(root, "node"), "pas un exe");
  const notOneExe = launch("--version", "1.2.3", "--node", join(root, "node"));
  assert.equal(notOneExe.status, 2);
  assert.match(notOneExe.stderr, /not a Windows x64 executable/);
  assert.equal(existsSync(join(root, "construit")), false);
});

test("cheminSansNode : le PATH de l'essai, sans aucun dossier qui porte un node.exe", () => {
  const [system, nodejs, tools] = [join("Windows", "System32"), join("Program Files", "nodejs"), "outils"];
  assert.equal(cheminSansNode([system, nodejs, "", tools].join(delimiter), (file) => file === join(nodejs, "node.exe")), [system, tools].join(delimiter));
});

test("le vrai makensis compile le script de l'installeur", { skip: process.env.BRIGADE_NSIS ? false : "BRIGADE_NSIS (an extracted NSIS bundle) is not set" }, (t) => {
  const { racine: root, electron, app, runtime, node } = sources(t);
  const output = join(root, "construit");
  const installer = construire({ version: "1.2.3", electron, node, app, runtime, nsis: process.env.BRIGADE_NSIS ?? "", sortie: output, atelier: join(root, "atelier"), executer: executerVraiment });
  const start = readFileSync(installer).subarray(0, 2).toString("latin1");
  assert.equal(start, "MZ", "un exécutable Windows");
});
