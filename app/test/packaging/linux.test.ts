// L'AppImage Linux de l'app (app/packaging/linux.ts) : ce que porte son AppDir, ce que l'app
// installée y trouve, et le fichier unique qu'elle devient. Ni réseau ni écran : Electron est une
// doublure de son dossier, `mksquashfs` et `npm rebuild` des doublures qui relèvent ce qu'on leur
// demande. Ce qui ne se prouve que sur un Linux avec un écran — l'AppImage qui s'ouvre, l'app qui
// atteint son écran principal — est joué par app/packaging/essai-linux.ts, en CI (app-release-linux).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { cheminSansNode } from "../../packaging/essai-windows.ts";
import { APP } from "../../packaging/construire.ts";
import { APPRUN, assembler, construire, EXECUTABLE, estElfX64, type Executer, nomDeLAppImage, PTY_LINUX } from "../../packaging/linux.ts";
import { emplacementsDe, NODE_DU_PAQUET } from "../../src/emplacements.ts";
import { PAQUETS } from "../aides/posix.ts";

const LINUX = join(APP, "packaging", "linux.ts");

const temporaire = (t: TestContext) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-linux-test-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  return dossier;
};
const ecrire = (chemin: string, contenu: string | Buffer = "x") => {
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, contenu);
};

// L'en-tête d'un ELF 64 bits petit-boutiste, pour une machine donnée (0x3e : x86-64, 0xb7 : arm64).
function enTeteElf(machine: number, classe = 2): Buffer {
  const elf = Buffer.alloc(64);
  elf.write("\x7fELF", 0, "latin1");
  elf[4] = classe;
  elf[5] = 1;
  elf.writeUInt16LE(machine, 18);
  return elf;
}

// Un clone en miniature : l'Electron pour Linux extrait, l'app, son node-pty sans build linux-x64, le
// runtime, le `node` et le `pty.node` à porter, et le runtime d'AppImage.
function sources(t: TestContext) {
  const racine = temporaire(t);
  const electron = join(racine, "electron-linux-x64");
  ecrire(join(electron, "electron"), enTeteElf(0x3e));
  ecrire(join(electron, "chrome-sandbox"));
  ecrire(join(electron, "chrome_crashpad_handler"));
  ecrire(join(electron, "libffmpeg.so"));
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
  ecrire(join(pty, "scripts", "prebuild.js"));
  ecrire(join(pty, "build", "Release", "pty.node"), enTeteElf(0xb7));
  ecrire(join(pty, "src", "unix", "pty.cc"));
  for (const machine of ["darwin-arm64", "win32-x64"]) ecrire(join(pty, "prebuilds", machine, "pty.node"));
  const runtime = join(racine, "runtime");
  ecrire(join(runtime, "src", "station", "main.ts"), "// la station");
  ecrire(join(runtime, "package.json"), JSON.stringify({ name: "brigade-runtime", version: "0.0.0", type: "module", engines: { node: ">=26" } }));
  const node = join(racine, "node");
  ecrire(node, enTeteElf(0x3e));
  const ptyCompile = join(racine, "pty.node");
  ecrire(ptyCompile, Buffer.concat([enTeteElf(0x3e), Buffer.from("compilé")]));
  const runtimeAppImage = join(racine, "runtime-x86_64");
  ecrire(runtimeAppImage, Buffer.concat([enTeteElf(0x3e), Buffer.from("runtime d'AppImage")]));
  return { racine, electron, app, runtime, node, ptyCompile, runtimeAppImage };
}

// Une doublure qui ne joue rien : aucune commande n'est attendue.
const rienALancer: Executer = (commande, args) => assert.fail(`nothing should run, not ${commande} ${args.join(" ")}`);

test("estElfX64 : un binaire Linux pour x86-64, et rien d'autre", () => {
  assert.equal(estElfX64(enTeteElf(0x3e)), true);
  assert.equal(estElfX64(enTeteElf(0xb7)), false, "un binaire pour arm64");
  assert.equal(estElfX64(enTeteElf(0x3e, 1)), false, "un ELF 32 bits");
  assert.equal(estElfX64(Buffer.from("MZ")), false, "un exécutable Windows");
  assert.equal(estElfX64(Buffer.from("\x7fELF", "latin1")), false, "un en-tête tronqué");
});

test("le nom de l'AppImage : brigade-<version>-linux-x64.AppImage", () => {
  assert.equal(nomDeLAppImage("1.2.3"), "brigade-1.2.3-linux-x64.AppImage");
});

test("assembler : l'AppDir porte AppRun, Electron renommé, l'app, le runtime, le node et le pty.node de linux-x64", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node, ptyCompile } = sources(t);
  const appdir = assembler({ version: "1.2.3+gabc", electron, node, pty: ptyCompile, app, runtime, executer: rienALancer }, join(racine, "arbre", "Brigade.AppDir"));
  assert.equal(existsSync(join(appdir, EXECUTABLE)), true);
  assert.equal(existsSync(join(appdir, "electron")), false, "l'exécutable porte le nom de l'app");
  assert.equal(statSync(join(appdir, EXECUTABLE)).mode & 0o777, 0o755, "un zip ne garde pas le bit d'exécution");
  assert.equal(statSync(join(appdir, "chrome_crashpad_handler")).mode & 0o777, 0o755);
  assert.equal(existsSync(join(appdir, "chrome-sandbox")), false, "le bac à sable SUID n'a pas de sens dans une AppImage");
  assert.equal(existsSync(join(appdir, "libffmpeg.so")), true);
  assert.equal(existsSync(join(appdir, "locales", "fr.pak")), true);

  // Ce que l'AppImage lance, son entrée de bureau et son icône.
  assert.equal(readFileSync(join(appdir, "AppRun"), "utf8"), APPRUN);
  assert.equal(statSync(join(appdir, "AppRun")).mode & 0o777, 0o755);
  assert.match(APPRUN, /^#!\/bin\/sh\n/);
  assert.match(APPRUN, /exec "\$ICI\/brigade" --no-sandbox "\$@"/);
  const bureau = readFileSync(join(appdir, "brigade.desktop"), "utf8");
  for (const ligne of ["[Desktop Entry]", "Type=Application", "Name=Brigade", "Exec=brigade %U", "Icon=brigade", "X-AppImage-Version=1.2.3+gabc"]) assert.ok(bureau.split("\n").includes(ligne), ligne);
  assert.deepEqual(readFileSync(join(appdir, "brigade.png")), readFileSync(join(APP, "packaging", "icones", "Brigade-1024.png")));
  assert.equal(lstatSync(join(appdir, ".DirIcon")).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(appdir, ".DirIcon")), "brigade.png");

  const ressources = join(appdir, "resources");
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

  // node-pty : son JavaScript, et le pty.node de linux-x64 là où node-pty le charge et où l'app le cherche (src/pty.ts).
  const pty = join(ressources, "app", "node_modules", "node-pty");
  assert.equal(PTY_LINUX, join("prebuilds", "linux-x64", "pty.node"));
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["linux-x64"]);
  assert.deepEqual(readFileSync(join(pty, PTY_LINUX)), readFileSync(ptyCompile));
  for (const reste of ["build", "src", "scripts", "binding.gyp"]) assert.equal(existsSync(join(pty, reste)), false, `${reste} n'est pas porté`);
  assert.equal(existsSync(join(pty, "lib", "index.js")), true);

  assert.equal(readFileSync(join(ressources, "runtime", "src", "station", "main.ts"), "utf8"), "// la station");
  assert.equal(JSON.parse(readFileSync(join(ressources, "runtime", "package.json"), "utf8")).version, "1.2.3+gabc");
  assert.deepEqual(readdirSync(join(ressources, "plugin", "commands")).sort(), ["ask.md", "dev.md"]);
  assert.deepEqual(readFileSync(join(ressources, NODE_DU_PAQUET)), readFileSync(node));
  assert.equal(statSync(join(ressources, NODE_DU_PAQUET)).mode & 0o777, 0o755);
});

test("l'app de l'AppImage se sait installée, et lance le runtime et le node du paquet", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node, ptyCompile } = sources(t);
  const ressources = join(assembler({ version: "1.2.3", electron, node, pty: ptyCompile, app, runtime, executer: rienALancer }, join(racine, "Brigade.AppDir")), "resources");
  const emplacements = emplacementsDe({ ressources, src: join(ressources, "app", "src"), env: {} });
  assert.equal(emplacements.facon, "installee");
  assert.equal(emplacements.clone, undefined);
  assert.equal(emplacements.runtime, join(ressources, "runtime"));
  assert.equal(emplacements.node, join(ressources, NODE_DU_PAQUET));
  assert.equal(existsSync(emplacements.node), true);
});

test("assembler : sans --pty, node-pty est compilé par `npm rebuild` dans l'arbre de l'app", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const appels: { commande: string; args: readonly string[]; cwd: string | undefined }[] = [];
  // Le faux `npm rebuild` écrit ce que node-gyp écrit : build/Release/pty.node, et ses restes.
  const executer: Executer = (commande, args, options) => {
    appels.push({ commande, args, cwd: options?.cwd });
    const pty = join(options?.cwd ?? "", "node_modules", "node-pty");
    assert.equal(existsSync(join(pty, "build", "Release", "pty.node")), false, "un build/ de la machine du clone ne passe pas pour le sien");
    ecrire(join(pty, "build", "Release", "pty.node"), enTeteElf(0x3e));
    ecrire(join(pty, "build", "Release", "obj.target", "pty", "src", "unix", "pty.o"));
    ecrire(join(pty, "build", "Makefile"));
    return { status: 0, stdout: "", stderr: "" };
  };
  const appdir = assembler({ version: "1.2.3", electron, node, app, runtime, executer }, join(racine, "Brigade.AppDir"));
  const dansApp = join(appdir, "resources", "app");
  assert.deepEqual(appels, [{ commande: "npm", args: ["rebuild", "node-pty", "--foreground-scripts", "--no-audit", "--no-fund"], cwd: dansApp }]);
  const pty = join(dansApp, "node_modules", "node-pty");
  assert.deepEqual(readFileSync(join(pty, PTY_LINUX)), enTeteElf(0x3e));
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["linux-x64"]);
  assert.equal(existsSync(join(pty, "build")), false, "ni le build, ni ses restes");
});

test("assembler : une compilation de node-pty qui échoue, ou qui n'écrit rien de x86-64, fait échouer la construction en disant pourquoi", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node } = sources(t);
  const echoue: Executer = () => ({ status: 1, stdout: "", stderr: "gyp ERR! stack Error: not found: make" });
  assert.throws(
    () => assembler({ version: "1.2.3", electron, node, app, runtime, executer: echoue }, join(racine, "a")),
    (erreur: Error & { code?: number }) => erreur.code === 1 && /node-pty could not be compiled for linux-x64 .*not found: make/.test(erreur.message),
  );
  const rien: Executer = () => ({ status: 0, stdout: "", stderr: "" });
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, runtime, executer: rien }, join(racine, "b")), /succeeded but wrote no .*pty\.node/);
  const arm: Executer = (_commande, _args, options) => {
    ecrire(join(options?.cwd ?? "", "node_modules", "node-pty", "build", "Release", "pty.node"), enTeteElf(0xb7));
    return { status: 0, stdout: "", stderr: "" };
  };
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, runtime, executer: arm }, join(racine, "c")), /is not built for linux-x64/);
});

test("assembler : refuse un Electron qui n'est pas celui de Linux", (t) => {
  const { racine, app, runtime, node, ptyCompile } = sources(t);
  assert.throws(() => assembler({ version: "1.2.3", electron: app, node, pty: ptyCompile, app, runtime, executer: rienALancer }, join(racine, "a")), /not an Electron for Linux/);
});

test("construire : un seul fichier, brigade-<version>-linux-x64.AppImage, le runtime d'AppImage suivi du squashfs de l'AppDir", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node, ptyCompile, runtimeAppImage } = sources(t);
  const appels: { commande: string; args: readonly string[] }[] = [];
  // Le faux mksquashfs écrit, à la place du squashfs, la liste de ce qu'il a reçu.
  const executer: Executer = (commande, args) => {
    appels.push({ commande, args });
    const [appdir, squashfs] = args;
    ecrire(squashfs ?? "", `squashfs de ${readdirSync(appdir ?? "").sort().join(",")}`);
    return { status: 0, stdout: "", stderr: "" };
  };
  const sortie = join(racine, "construit");
  const appimage = construire({ version: "1.2.3", electron, node, pty: ptyCompile, app, runtime, runtimeAppImage, sortie, atelier: join(racine, "atelier"), executer });
  assert.equal(appimage, join(sortie, "brigade-1.2.3-linux-x64.AppImage"));
  assert.deepEqual(readdirSync(sortie), ["brigade-1.2.3-linux-x64.AppImage"]);
  assert.equal(appels.length, 1);
  assert.equal(appels[0]?.commande, "mksquashfs");
  assert.deepEqual(appels[0]?.args.slice(2), ["-root-owned", "-noappend", "-comp", "zstd", "-quiet"]);
  const ecrit = readFileSync(appimage);
  const debut = readFileSync(runtimeAppImage);
  assert.deepEqual(ecrit.subarray(0, debut.length), debut, "le runtime d'AppImage en tête");
  assert.match(ecrit.subarray(debut.length).toString("utf8"), /^squashfs de .*AppRun.*brigade,brigade\.desktop,brigade\.png.*resources/);
  assert.equal(statSync(appimage).mode & 0o777, 0o755, "exécutable");
});

test("construire : un mksquashfs absent ou qui échoue fait échouer la construction, en disant pourquoi", { skip: PAQUETS }, (t) => {
  const { racine, electron, app, runtime, node, ptyCompile, runtimeAppImage } = sources(t);
  const options = { version: "1.2.3", electron, node, pty: ptyCompile, app, runtime, runtimeAppImage, sortie: join(racine, "construit") };
  const absent: Executer = () => ({ status: null, stdout: "", stderr: "spawnSync mksquashfs ENOENT" });
  assert.throws(
    () => construire({ ...options, atelier: join(racine, "a"), executer: absent }),
    (erreur: Error & { code?: number }) => erreur.code === 1 && /mksquashfs could not be run — install squashfs-tools/.test(erreur.message),
  );
  const echoue: Executer = () => ({ status: 1, stdout: "", stderr: "FATAL ERROR: compressor zstd not supported" });
  assert.throws(() => construire({ ...options, atelier: join(racine, "b"), executer: echoue }), /mksquashfs failed: FATAL ERROR: compressor zstd/);
  assert.equal(existsSync(join(racine, "construit")), false, "rien n'est écrit sous la sortie");
});

test("construire : refuse un node, un pty.node ou un runtime d'AppImage qui n'est pas un binaire Linux x64", (t) => {
  const { racine, electron, app, runtime, node, ptyCompile, runtimeAppImage } = sources(t);
  const pasLinux = join(racine, "pas-linux");
  ecrire(pasLinux, "MZ");
  const options = { version: "1.2.3", electron, app, runtime, sortie: join(racine, "construit"), atelier: join(racine, "atelier"), executer: rienALancer };
  for (const [quoi, donne] of [
    ["--node", { node: pasLinux, pty: ptyCompile, runtimeAppImage }],
    ["--pty", { node, pty: pasLinux, runtimeAppImage }],
    ["--appimage-runtime", { node, pty: ptyCompile, runtimeAppImage: pasLinux }],
  ] as const)
    assert.throws(
      () => construire({ ...options, ...donne }),
      (erreur: Error & { code?: number }) => erreur.code === 2 && erreur.message.startsWith(`${quoi} (${pasLinux}) is not a Linux x64 binary`),
    );
  assert.equal(existsSync(join(racine, "construit")), false);
});

test("la commande refuse une option ou une version invalide, et un node à porter qui n'en est pas un, sans rien écrire", (t) => {
  const racine = temporaire(t);
  const lancer = (...args: string[]) => spawnSync(process.execPath, [LINUX, "--sortie", join(racine, "construit"), ...args], { encoding: "utf8" });
  const inconnue = lancer("--inconnue");
  assert.equal(inconnue.status, 2);
  assert.match(inconnue.stderr, /usage: linux\.ts/);
  if (process.platform === "linux" && process.arch === "x64") {
    const version = lancer("--version", "un.deux");
    assert.equal(version.status, 2);
    assert.match(version.stderr, /invalid version/);
    const absent = lancer("--version", "1.2.3", "--node", join(racine, "absent"));
    assert.equal(absent.status, 2);
    assert.match(absent.stderr, /--node is a missing file/);
    ecrire(join(racine, "node"), "pas un elf");
    const pasUnElf = lancer("--version", "1.2.3", "--node", join(racine, "node"));
    assert.equal(pasUnElf.status, 2);
    assert.match(pasUnElf.stderr, /--node .* is not a Linux x64 binary/);
  } else {
    const ailleurs = lancer("--version", "1.2.3");
    assert.equal(ailleurs.status, 2);
    assert.match(ailleurs.stderr, /built on a Linux x64 machine/);
  }
  assert.equal(existsSync(join(racine, "construit")), false);
});

test("cheminSansNode : le PATH de l'essai Linux, sans aucun dossier qui porte un node", () => {
  const [systeme, nodejs, outils] = ["/usr/bin", "/opt/node/bin", "/opt/outils"];
  assert.equal(cheminSansNode([systeme, nodejs, "", outils].join(delimiter), (fichier) => fichier === join(nodejs, "node"), "node"), [systeme, outils].join(delimiter));
});
