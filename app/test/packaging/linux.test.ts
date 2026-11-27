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
import { locationsOf, NODE_OF_PACKAGE } from "../../src/locations.ts";

const LINUX = join(APP, "packaging", "linux.ts");

const temporary = (t: TestContext) => {
  const folder = mkdtempSync(join(tmpdir(), "brigade-linux-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
};
const write = (path: string, content: string | Buffer = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};

// L'en-tête d'un ELF 64 bits petit-boutiste, pour une machine donnée (0x3e : x86-64, 0xb7 : arm64).
function inHeadElf(machine: number, classe = 2): Buffer {
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
  const root = temporary(t);
  const electron = join(root, "electron-linux-x64");
  write(join(electron, "electron"), inHeadElf(0x3e));
  write(join(electron, "chrome-sandbox"));
  write(join(electron, "chrome_crashpad_handler"));
  write(join(electron, "libffmpeg.so"));
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
  write(join(pty, "scripts", "prebuild.js"));
  write(join(pty, "build", "Release", "pty.node"), inHeadElf(0xb7));
  write(join(pty, "src", "unix", "pty.cc"));
  for (const machine of ["darwin-arm64", "win32-x64"]) write(join(pty, "prebuilds", machine, "pty.node"));
  const node = join(root, "node");
  write(node, inHeadElf(0x3e));
  const ptyCompile = join(root, "pty.node");
  write(ptyCompile, Buffer.concat([inHeadElf(0x3e), Buffer.from("compilé")]));
  const runtimeAppImage = join(root, "runtime-x86_64");
  write(runtimeAppImage, Buffer.concat([inHeadElf(0x3e), Buffer.from("runtime d'AppImage")]));
  return { racine: root, electron, app, node, ptyCompile, runtimeAppImage };
}

// Le mode qu'un `chmod 0o755` laisse à un exécutable de l'AppDir. Windows ne garde pas de bit
// d'exécution : le mode n'y dit que si le fichier est en lecture seule, et un fichier rendu
// exécutable y reste lisible et inscriptible. L'AppImage, elle, ne se construit que sous Linux.
const MODE_EXECUTABLE = process.platform === "win32" ? 0o666 : 0o755;

// Une doublure qui ne joue rien : aucune commande n'est attendue.
const nothingALaunch: Executer = (command, args) => assert.fail(`nothing should run, not ${command} ${args.join(" ")}`);

test("estElfX64 : un binaire Linux pour x86-64, et rien d'autre", () => {
  assert.equal(estElfX64(inHeadElf(0x3e)), true);
  assert.equal(estElfX64(inHeadElf(0xb7)), false, "un binaire pour arm64");
  assert.equal(estElfX64(inHeadElf(0x3e, 1)), false, "un ELF 32 bits");
  assert.equal(estElfX64(Buffer.from("MZ")), false, "un exécutable Windows");
  assert.equal(estElfX64(Buffer.from("\x7fELF", "latin1")), false, "un en-tête tronqué");
});

test("le nom de l'AppImage : brigade-<version>-linux-x64.AppImage", () => {
  assert.equal(nomDeLAppImage("1.2.3"), "brigade-1.2.3-linux-x64.AppImage");
});

test("assembler : l'AppDir porte AppRun, Electron renommé, l'app, le node et le pty.node de linux-x64", (t) => {
  const { racine: root, electron, app, node, ptyCompile } = sources(t);
  const appdir = assembler({ version: "1.2.3+gabc", electron, node, pty: ptyCompile, app, executer: nothingALaunch }, join(root, "arbre", "Brigade.AppDir"));
  assert.equal(existsSync(join(appdir, EXECUTABLE)), true);
  assert.equal(existsSync(join(appdir, "electron")), false, "l'exécutable porte le nom de l'app");
  assert.equal(statSync(join(appdir, EXECUTABLE)).mode & 0o777, MODE_EXECUTABLE, "un zip ne garde pas le bit d'exécution");
  assert.equal(statSync(join(appdir, "chrome_crashpad_handler")).mode & 0o777, MODE_EXECUTABLE);
  assert.equal(existsSync(join(appdir, "chrome-sandbox")), false, "le bac à sable SUID n'a pas de sens dans une AppImage");
  assert.equal(existsSync(join(appdir, "libffmpeg.so")), true);
  assert.equal(existsSync(join(appdir, "locales", "fr.pak")), true);

  // Ce que l'AppImage lance, son entrée de bureau et son icône.
  assert.equal(readFileSync(join(appdir, "AppRun"), "utf8"), APPRUN);
  assert.equal(statSync(join(appdir, "AppRun")).mode & 0o777, MODE_EXECUTABLE);
  assert.match(APPRUN, /^#!\/bin\/sh\n/);
  assert.match(APPRUN, /exec "\$ICI\/brigade" --no-sandbox "\$@"/);
  const desktop = readFileSync(join(appdir, "brigade.desktop"), "utf8");
  for (const line of ["[Desktop Entry]", "Type=Application", "Name=Brigade", "Exec=brigade %U", "Icon=brigade", "X-AppImage-Version=1.2.3+gabc"]) assert.ok(desktop.split("\n").includes(line), line);
  assert.deepEqual(readFileSync(join(appdir, "brigade.png")), readFileSync(join(APP, "packaging", "icones", "Brigade-1024.png")));
  assert.equal(lstatSync(join(appdir, ".DirIcon")).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(appdir, ".DirIcon")), "brigade.png");

  const resources = join(appdir, "resources");
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

  // node-pty : son JavaScript, et le pty.node de linux-x64 là où node-pty le charge et où l'app le cherche (src/pty.ts).
  const pty = join(resources, "app", "node_modules", "node-pty");
  assert.equal(PTY_LINUX, join("prebuilds", "linux-x64", "pty.node"));
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["linux-x64"]);
  assert.deepEqual(readFileSync(join(pty, PTY_LINUX)), readFileSync(ptyCompile));
  for (const remains of ["build", "src", "scripts", "binding.gyp"]) assert.equal(existsSync(join(pty, remains)), false, `${remains} n'est pas porté`);
  assert.equal(existsSync(join(pty, "lib", "index.js")), true);

  // Aucune cuisine dans le paquet : l'app lit les stations par leurs gists.
  assert.equal(existsSync(join(resources, "runtime")), false);
  // Le paquet ne porte plus de plugin à installer dans les projets.
  assert.equal(existsSync(join(resources, "plugin")), false);
  assert.deepEqual(readFileSync(join(resources, NODE_OF_PACKAGE)), readFileSync(node));
  assert.equal(statSync(join(resources, NODE_OF_PACKAGE)).mode & 0o777, MODE_EXECUTABLE);
});

test("l'app de l'AppImage se sait installée, et lance le runtime et le node du paquet", (t) => {
  const { racine: root, electron, app, node, ptyCompile } = sources(t);
  const resources = join(assembler({ version: "1.2.3", electron, node, pty: ptyCompile, app, executer: nothingALaunch }, join(root, "Brigade.AppDir")), "resources");
  const locations = locationsOf({ ressources: resources, src: join(resources, "app", "src"), env: {} });
  assert.equal(locations.facon, "installee");
  assert.equal(locations.clone, undefined);
  assert.equal("runtime" in locations, false);
  assert.equal(locations.node, join(resources, NODE_OF_PACKAGE));
  assert.equal(existsSync(locations.node), true);
});

test("assembler : sans --pty, node-pty est compilé par `npm rebuild` dans l'arbre de l'app", (t) => {
  const { racine: root, electron, app, node } = sources(t);
  const calls: { commande: string; args: readonly string[]; cwd: string | undefined }[] = [];
  // Le faux `npm rebuild` écrit ce que node-gyp écrit : build/Release/pty.node, et ses restes.
  const run: Executer = (command, args, options) => {
    calls.push({ commande: command, args, cwd: options?.cwd });
    const pty = join(options?.cwd ?? "", "node_modules", "node-pty");
    assert.equal(existsSync(join(pty, "build", "Release", "pty.node")), false, "un build/ de la machine du clone ne passe pas pour le sien");
    write(join(pty, "build", "Release", "pty.node"), inHeadElf(0x3e));
    write(join(pty, "build", "Release", "obj.target", "pty", "src", "unix", "pty.o"));
    write(join(pty, "build", "Makefile"));
    return { status: 0, stdout: "", stderr: "" };
  };
  const appdir = assembler({ version: "1.2.3", electron, node, app, executer: run }, join(root, "Brigade.AppDir"));
  const inApp = join(appdir, "resources", "app");
  assert.deepEqual(calls, [{ commande: "npm", args: ["rebuild", "node-pty", "--foreground-scripts", "--no-audit", "--no-fund"], cwd: inApp }]);
  const pty = join(inApp, "node_modules", "node-pty");
  assert.deepEqual(readFileSync(join(pty, PTY_LINUX)), inHeadElf(0x3e));
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["linux-x64"]);
  assert.equal(existsSync(join(pty, "build")), false, "ni le build, ni ses restes");
});

test("assembler : une compilation de node-pty qui échoue, ou qui n'écrit rien de x86-64, fait échouer la construction en disant pourquoi", (t) => {
  const { racine: root, electron, app, node } = sources(t);
  const fails: Executer = () => ({ status: 1, stdout: "", stderr: "gyp ERR! stack Error: not found: make" });
  assert.throws(
    () => assembler({ version: "1.2.3", electron, node, app, executer: fails }, join(root, "a")),
    (error: Error & { code?: number }) => error.code === 1 && /node-pty could not be compiled for linux-x64 .*not found: make/.test(error.message),
  );
  const nothing: Executer = () => ({ status: 0, stdout: "", stderr: "" });
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, executer: nothing }, join(root, "b")), /succeeded but wrote no .*pty\.node/);
  const arm: Executer = (_command, _args, options) => {
    write(join(options?.cwd ?? "", "node_modules", "node-pty", "build", "Release", "pty.node"), inHeadElf(0xb7));
    return { status: 0, stdout: "", stderr: "" };
  };
  assert.throws(() => assembler({ version: "1.2.3", electron, node, app, executer: arm }, join(root, "c")), /is not built for linux-x64/);
});

test("assembler : refuse un Electron qui n'est pas celui de Linux", (t) => {
  const { racine: root, app, node, ptyCompile } = sources(t);
  assert.throws(() => assembler({ version: "1.2.3", electron: app, node, pty: ptyCompile, app, executer: nothingALaunch }, join(root, "a")), /not an Electron for Linux/);
});

test("construire : un seul fichier, brigade-<version>-linux-x64.AppImage, le runtime d'AppImage suivi du squashfs de l'AppDir", (t) => {
  const { racine: root, electron, app, node, ptyCompile, runtimeAppImage } = sources(t);
  const calls: { commande: string; args: readonly string[] }[] = [];
  // Le faux mksquashfs écrit, à la place du squashfs, la liste de ce qu'il a reçu.
  const run: Executer = (command, args) => {
    calls.push({ commande: command, args });
    const [appdir, squashfs] = args;
    write(squashfs ?? "", `squashfs de ${readdirSync(appdir ?? "").sort().join(",")}`);
    return { status: 0, stdout: "", stderr: "" };
  };
  const output = join(root, "construit");
  const appimage = construire({ version: "1.2.3", electron, node, pty: ptyCompile, app, runtimeAppImage, sortie: output, atelier: join(root, "atelier"), executer: run });
  assert.equal(appimage, join(output, "brigade-1.2.3-linux-x64.AppImage"));
  assert.deepEqual(readdirSync(output), ["brigade-1.2.3-linux-x64.AppImage"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.commande, "mksquashfs");
  assert.deepEqual(calls[0]?.args.slice(2), ["-root-owned", "-noappend", "-comp", "zstd", "-quiet"]);
  const written = readFileSync(appimage);
  const start = readFileSync(runtimeAppImage);
  assert.deepEqual(written.subarray(0, start.length), start, "le runtime d'AppImage en tête");
  assert.match(written.subarray(start.length).toString("utf8"), /^squashfs de .*AppRun.*brigade,brigade\.desktop,brigade\.png.*resources/);
  assert.equal(statSync(appimage).mode & 0o777, MODE_EXECUTABLE, "exécutable");
});

test("construire : un mksquashfs absent ou qui échoue fait échouer la construction, en disant pourquoi", (t) => {
  const { racine: root, electron, app, node, ptyCompile, runtimeAppImage } = sources(t);
  const options = { version: "1.2.3", electron, node, pty: ptyCompile, app, runtimeAppImage, sortie: join(root, "construit") };
  const absent: Executer = () => ({ status: null, stdout: "", stderr: "spawnSync mksquashfs ENOENT" });
  assert.throws(
    () => construire({ ...options, atelier: join(root, "a"), executer: absent }),
    (error: Error & { code?: number }) => error.code === 1 && /mksquashfs could not be run — install squashfs-tools/.test(error.message),
  );
  const fails: Executer = () => ({ status: 1, stdout: "", stderr: "FATAL ERROR: compressor zstd not supported" });
  assert.throws(() => construire({ ...options, atelier: join(root, "b"), executer: fails }), /mksquashfs failed: FATAL ERROR: compressor zstd/);
  assert.equal(existsSync(join(root, "construit")), false, "rien n'est écrit sous la sortie");
});

test("construire : refuse un node, un pty.node ou un runtime d'AppImage qui n'est pas un binaire Linux x64", (t) => {
  const { racine: root, electron, app, node, ptyCompile, runtimeAppImage } = sources(t);
  const notLinux = join(root, "pas-linux");
  write(notLinux, "MZ");
  const options = { version: "1.2.3", electron, app, sortie: join(root, "construit"), atelier: join(root, "atelier"), executer: nothingALaunch };
  for (const [what, gives] of [
    ["--node", { node: notLinux, pty: ptyCompile, runtimeAppImage }],
    ["--pty", { node, pty: notLinux, runtimeAppImage }],
    ["--appimage-runtime", { node, pty: ptyCompile, runtimeAppImage: notLinux }],
  ] as const)
    assert.throws(
      () => construire({ ...options, ...gives }),
      (error: Error & { code?: number }) => error.code === 2 && error.message.startsWith(`${what} (${notLinux}) is not a Linux x64 binary`),
    );
  assert.equal(existsSync(join(root, "construit")), false);
});

test("la commande refuse une option ou une version invalide, et un node à porter qui n'en est pas un, sans rien écrire", (t) => {
  const root = temporary(t);
  const launch = (...args: string[]) => spawnSync(process.execPath, [LINUX, "--sortie", join(root, "construit"), ...args], { encoding: "utf8" });
  const unknown = launch("--inconnue");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /usage: linux\.ts/);
  if (process.platform === "linux" && process.arch === "x64") {
    const version = launch("--version", "un.deux");
    assert.equal(version.status, 2);
    assert.match(version.stderr, /invalid version/);
    const absent = launch("--version", "1.2.3", "--node", join(root, "absent"));
    assert.equal(absent.status, 2);
    assert.match(absent.stderr, /--node is a missing file/);
    write(join(root, "node"), "pas un elf");
    const notOneElf = launch("--version", "1.2.3", "--node", join(root, "node"));
    assert.equal(notOneElf.status, 2);
    assert.match(notOneElf.stderr, /--node .* is not a Linux x64 binary/);
  } else {
    const elsewhere = launch("--version", "1.2.3");
    assert.equal(elsewhere.status, 2);
    assert.match(elsewhere.stderr, /built on a Linux x64 machine/);
  }
  assert.equal(existsSync(join(root, "construit")), false);
});

test("cheminSansNode : le PATH de l'essai Linux, sans aucun dossier qui porte un node", () => {
  const [system, nodejs, tools] = ["/usr/bin", "/opt/node/bin", "/opt/outils"];
  assert.equal(cheminSansNode([system, nodejs, "", tools].join(delimiter), (file) => file === join(nodejs, "node"), "node"), [system, tools].join(delimiter));
});
