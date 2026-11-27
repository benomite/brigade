// Le .dmg de l'app (app/packaging/construire.ts) : ce que porte `Brigade.app`, et ce que l'app
// installée y trouve. Ni réseau ni Mac : Electron est une doublure de son paquet, `codesign`,
// `otool` et `hdiutil` des doublures qui relèvent ce qu'on leur demande. Ce qui ne se prouve que
// sur un Mac — l'app qui s'ouvre, la signature acceptée — est dans app/packaging/README.md.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  APP,
  aSigner,
  assembler,
  bibliothequesHorsSysteme,
  construire,
  dependancesDeProduction,
  DROITS,
  empreinteAnnoncee,
  estMachOArm64,
  metadonneesDeMiseAJour,
  IDENTIFIANT,
  nomDAuxiliaire,
  reecrirePlist,
  reecrirePlistAuxiliaire,
  versionCourte,
  versionDuCommit,
  type Executer,
} from "../../packaging/construire.ts";
import { locationsOf, isInstalled } from "../../src/locations.ts";
import { CATALOG_OF_LABELS, INSTRUCTIONS, OWN, SCRIPT, setTheSetup } from "../../src/setup/setup.ts";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";
import { roleOf } from "../../src/workstation/role.ts";
import { PACKAGES } from "../helpers/posix.ts";

const BUILD = join(APP, "packaging", "construire.ts");

// Le début de l'Info.plist d'Electron 44 pour darwin-arm64, tel que son zip le livre.
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Electron</string>
	<key>CFBundleExecutable</key>
	<string>Electron</string>
	<key>CFBundleIconFile</key>
	<string>electron.icns</string>
	<key>CFBundleIdentifier</key>
	<string>com.github.Electron</string>
	<key>CFBundleName</key>
	<string>Electron</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>44.7.0</string>
	<key>CFBundleVersion</key>
	<string>44.7.0</string>
	<key>ElectronAsarIntegrity</key>
	<dict>
		<key>Resources/default_app.asar</key>
		<dict>
			<key>algorithm</key>
			<string>SHA256</string>
			<key>hash</key>
			<string>0123</string>
		</dict>
	</dict>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSPrincipalClass</key>
	<string>AtomApplication</string>
</dict>
</plist>
`;

// L'en-tête d'un binaire Mach-O 64 bits pour arm64, puis n'importe quoi.
const MACH_O_ARM64 = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);

function folder(t: TestContext): string {
  const created = mkdtempSync(join(tmpdir(), "brigade-app-dmg-"));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

// Une doublure d'Electron.app : son Info.plist, son exécutable, son asar par défaut, et un
// framework rangé par liens, comme dans le zip.
function fakeElectron(root: string): string {
  const electron = join(root, "Electron.app");
  const content = join(electron, "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), PLIST);
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O_ARM64);
  writeFileSync(join(content, "Resources", "default_app.asar"), "asar");
  const framework = join(content, "Frameworks", "Electron Framework.framework");
  mkdirSync(join(framework, "Versions", "A"), { recursive: true });
  writeFileSync(join(framework, "Versions", "A", "Electron Framework"), MACH_O_ARM64);
  symlinkSync("A", join(framework, "Versions", "Current"));
  symlinkSync("Versions/Current/Electron Framework", join(framework, "Electron Framework"));
  return electron;
}

// Les auxiliaires d'Electron 44 sous Contents/Frameworks, aux plists tels que les vrais bundles les livrent :
// CFBundleName seul (name-only, sans CFBundleDisplayName), CFBundleDisplayName seul (display-name-only, sans CFBundleName),
// les deux avec une valeur différente (mismatch), et aucune des deux clés (neither, no name key).
const AUXILIARY_ELECTRON: Record<string, string[]> = {
  "Electron Helper": [`<key>CFBundleName</key>\n\t<string>Electron Helper</string>`],
  "Electron Helper (GPU)": [`<key>CFBundleDisplayName</key>\n\t<string>Electron Helper (GPU)</string>`],
  "Electron Helper (Renderer)": [`<key>CFBundleName</key>\n\t<string>Electron Helper</string>`, `<key>CFBundleDisplayName</key>\n\t<string>Electron Helper (Renderer)</string>`],
  "Electron Helper (Plugin)": [],
  "Electron Helper (Alerts)": [`<key>CFBundleName</key>\n\t<string>Electron Helper (Alerts)</string>`],
};

function setAuxiliary(electron: string): void {
  for (const [name, names] of Object.entries(AUXILIARY_ELECTRON)) {
    const help = join(electron, "Contents", "Frameworks", `${name}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${[`<key>CFBundleExecutable</key>\n\t<string>${name}</string>`, ...names, `<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron.helper</string>`].map((l) => `\t${l}\n`).join("")}</dict>\n</plist>\n`;
    writeFileSync(join(help, "Info.plist"), plist);
    writeFileSync(join(help, "MacOS", name), MACH_O_ARM64);
  }
}

function fakeNode(root: string): string {
  const node = join(root, "node");
  writeFileSync(node, MACH_O_ARM64);
  return node;
}

// Des doublures de `otool`, `codesign` et `hdiutil` : chaque appel relevé ; `hdiutil` écrit le
// .dmg et relève ce que son volume porte.
function tools(otool = "node:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1345.0.0)\n") {
  const calls: string[][] = [];
  let volume: string[] | undefined;
  const run: Executer = (command, args) => {
    calls.push([command, ...args]);
    if (command === "otool") return { status: 0, stdout: otool, stderr: "" };
    if (command === "hdiutil") {
      const source = args[args.indexOf("-srcfolder") + 1] ?? "";
      volume = readdirSync(source).sort();
      writeFileSync(args.at(-1) ?? "", "dmg");
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { executer: run, appels: calls, volume: () => volume };
}

test("Brigade.app porte l'app, le runtime et le `node` du paquet — et l'app installée y trouve sa station", { skip: PACKAGES }, (t) => {
  const root = folder(t);
  const pkg = assembler({ version: "0.20261019.151600+g76f93fe", electron: fakeElectron(root), node: fakeNode(root) }, join(root, "volume"));
  const resources = join(pkg, "Contents", "Resources");

  // L'app : ses sources et ses dépendances de production, rangées comme dans le dépôt — ni tests, ni Electron.
  assert.ok(existsSync(join(resources, "app", "src", "main.ts")));
  assert.ok(existsSync(join(resources, "app", "src", "vue", "index.html")));
  assert.ok(existsSync(join(resources, "app", "node_modules", "@xterm", "xterm", "lib", "xterm.mjs")));
  assert.ok(!existsSync(join(resources, "app", "test")));
  assert.ok(!existsSync(join(resources, "app", "node_modules", "electron")));
  assert.ok(!existsSync(join(resources, "app", "node_modules", "typescript")));
  const declare = JSON.parse(readFileSync(join(resources, "app", "package.json"), "utf8"));
  // L'entrée du binaire aiguille vers l'app ou, avec `--tray-fond`, vers l'icône de la station de fond (#3631).
  assert.equal(declare.main, "src/tray-background/entry.ts");
  assert.ok(existsSync(join(resources, "app", declare.main)));
  assert.equal(declare.type, "module");
  assert.equal(declare.productName, "Brigade");
  assert.equal(declare.version, "0.20261019.151600+g76f93fe");
  assert.equal(declare.devDependencies, undefined);
  assert.equal(declare.scripts, undefined);

  // node-pty : ce qui est compilé pour darwin-arm64, et rien d'autre — ni pour une autre machine, ni ses sources.
  const pty = join(resources, "app", "node_modules", "node-pty");
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["darwin-arm64"]);
  assert.ok(existsSync(join(pty, "prebuilds", "darwin-arm64", "pty.node")));
  assert.equal(statSync(join(pty, "prebuilds", "darwin-arm64", "spawn-helper")).mode & 0o111, 0o111);
  for (const source of ["build", "deps", "src", "third_party"]) assert.ok(!existsSync(join(pty, source)), source);
  assert.ok(existsSync(join(pty, "lib", "index.js")));

  // Le runtime, à la version construite, sans ses tests ; et le `node` du paquet, exécutable.
  assert.ok(existsSync(join(resources, "runtime", "src", "kitchen", "main.ts")));
  assert.ok(!existsSync(join(resources, "runtime", "test")));
  assert.ok(!existsSync(join(resources, "runtime", "node_modules")));
  assert.equal(JSON.parse(readFileSync(join(resources, "runtime", "package.json"), "utf8")).version, "0.20261019.151600+g76f93fe");
  assert.equal(statSync(join(resources, "node", "bin", "brigade-node")).mode & 0o755, 0o755);

  // Electron, au nom de l'app : son asar par défaut est parti, ses liens sont restés des liens.
  assert.ok(!existsSync(join(resources, "default_app.asar")));
  const framework = join(pkg, "Contents", "Frameworks", "Electron Framework.framework");
  assert.ok(lstatSync(join(framework, "Electron Framework")).isSymbolicLink());
  assert.equal(readlinkSync(join(framework, "Versions", "Current")), "A");
  assert.match(readFileSync(join(pkg, "Contents", "Info.plist"), "utf8"), /<key>CFBundleName<\/key>\s*<string>Brigade<\/string>/);

  // Ce que l'app installée résout, depuis là où son process principal tourne : la station de son paquet, et son `node`.
  assert.equal(isInstalled({ ressources: resources, src: join(resources, "app", "src") }), true);
  const locations = locationsOf({ ressources: resources, src: join(resources, "app", "src"), env: {} });
  assert.equal(locations.node, join(resources, "node", "bin", "brigade-node"));
  assert.ok(existsSync(locations.node));
  assert.deepEqual(roleOf({ plateforme: "darwin", runtime: locations.runtime, env: {} }), { role: "station", principal: join(resources, "runtime", "src", "kitchen", "main.ts") });
  // Le paquet ne porte plus de plugin à installer dans les projets.
  assert.equal(existsSync(join(resources, "plugin")), false);
  // La préparation d'un dépôt (src/setup/, #4632) : ses instructions, son script et son catalogue, tels quels ; rendues
  // depuis le paquet, ses instructions nomment son script.
  const packaged = join(resources, "app", "src", "setup");
  for (const name of [INSTRUCTIONS, SCRIPT, CATALOG_OF_LABELS]) assert.equal(readFileSync(join(packaged, name), "utf8"), readFileSync(join(OWN, name), "utf8"), name);
  const instructions = readFileSync(setTheSetup(join(root, "setup"), packaged), "utf8");
  const slashes = (path: string) => path.replaceAll("\\", "/");
  assert.ok(instructions.includes(`bash "${slashes(join(root, "setup", SCRIPT))}" --test`));
});

test("la station du paquet se charge tout entière depuis lui : l'enveloppe de l'app la lance, et elle refuse faute de répertoire", async (t) => {
  const root = folder(t);
  const pkg = assembler({ version: "1.0.0", electron: fakeElectron(root), node: fakeNode(root) }, join(root, "volume"));
  const resources = join(pkg, "Contents", "Resources");
  const locations = locationsOf({ ressources: resources, src: join(resources, "app", "src"), env: {} });
  const role = roleOf({ plateforme: "darwin", runtime: locations.runtime, env: {} });
  assert.equal(role.role, "station");
  // Lancée comme l'app la lance (workstation/station.ts) — mais par ce `node`-ci : celui du paquet est une doublure.
  // Son refus vient après l'import de tout ce qu'elle importe : le runtime du paquet est complet.
  const { BRIGADE_STATION_DIR: _, ...env } = process.env;
  // L'entrée reste ouverte : fermée, l'enveloppe arrête la cuisine avant qu'elle ait refusé.
  const child = spawn(process.execPath, [join(resources, "app", "src", "workstation", "envelope.ts"), role.role === "station" ? role.principal : ""], { cwd: locations.runtime, env, stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const status = await new Promise<number | null>((done) => child.once("exit", done));
  const launches = { status, stderr };
  assert.equal(launches.status, 2, launches.stderr);
  assert.match(launches.stderr, /kitchen: BRIGADE_STATION_DIR is not set/);
});

test("le .dmg : l'app signée ad hoc, puis un volume qui porte Brigade.app et le lien vers Applications", { skip: PACKAGES }, (t) => {
  const root = folder(t);
  const { executer: run, appels: calls, volume } = tools();
  const output = join(root, "construit");
  const dmg = construire({ version: "0.20261019.151600+g76f93fe", electron: fakeElectron(root), node: fakeNode(root), sortie: output, atelier: join(root, "atelier"), executer: run });

  assert.equal(dmg, join(output, "Brigade-0.20261019.151600+g76f93fe-arm64.dmg"));
  assert.ok(existsSync(dmg));
  assert.deepEqual(volume(), ["Applications", "Brigade.app"]);
  assert.equal(readlinkSync(join(root, "atelier", "volume", "Applications")), "/Applications");
  const pkg = join(root, "atelier", "volume", "Brigade.app");
  const pty = join(pkg, "Contents", "Resources", "app", "node_modules", "node-pty", "prebuilds", "darwin-arm64");
  assert.deepEqual(calls, [
    ["otool", "-L", join(root, "node")],
    ["codesign", "--force", "--sign", "-", join(pty, "pty.node")],
    ["codesign", "--force", "--sign", "-", join(pty, "spawn-helper")],
    ["codesign", "--force", "--sign", "-", "--identifier", `${IDENTIFIANT}.node`, join(pkg, "Contents", "Resources", "node", "bin", "brigade-node")],
    ["codesign", "--force", "--deep", "--sign", "-", pkg],
    ["codesign", "--verify", pkg],
    ["hdiutil", "create", "-volname", "Brigade", "-srcfolder", join(root, "atelier", "volume"), "-fs", "HFS+", "-format", "UDZO", "-ov", dmg],
  ]);
});

test("signé Developer ID et notarisé : du plus profond au paquet, l'app agrafée avant le .dmg, qui l'est à son tour", { skip: PACKAGES }, (t) => {
  const root = folder(t);
  const { executer: base, appels: calls } = tools();
  const run: Executer = (command, args) => (command === "xcrun" && args[0] === "notarytool" ? (calls.push([command, ...args]), { status: 0, stdout: "  status: Accepted\n", stderr: "" }) : base(command, args));
  const output = join(root, "construit");
  const dmg = construire({ version: "1.2.3", electron: fakeElectron(root), node: fakeNode(root), sortie: output, atelier: join(root, "atelier"), executer: run, identite: "Developer ID Application: Test (ABCDE12345)", profilNotarisation: "brigade-notary" });
  const pkg = join(root, "atelier", "volume", "Brigade.app");
  const signs = calls.filter((a) => a[0] === "codesign" && a.includes("--entitlements")).map((a) => a.at(-1));
  assert.deepEqual(signs, aSigner(pkg));
  assert.equal(signs.at(-1), pkg);
  assert.ok(signs.some((c) => c?.endsWith("node/bin/brigade-node")), "le node porté est signé");
  for (const a of calls.filter((a) => a[0] === "codesign" && a.includes("--entitlements")))
    assert.deepEqual(a.slice(0, -1).filter((m) => m !== "--identifier" && m !== `${IDENTIFIANT}.node`), ["codesign", "--force", "--sign", "Developer ID Application: Test (ABCDE12345)", "--options", "runtime", "--timestamp", "--entitlements", DROITS]);
  const ofNode = calls.find((a) => a.at(-1)?.endsWith("node/bin/brigade-node") && a.includes("--entitlements"));
  assert.equal(ofNode?.[ofNode.indexOf("--identifier") + 1], `${IDENTIFIANT}.node`, "le node porté est signé sous un identifiant de Brigade");
  const order = calls.map((a) => a.filter((m) => !m.startsWith("/")).join(" "));
  const posdeApp = order.indexOf("codesign --verify --deep --strict");
  assert.ok(posdeApp > 0);
  assert.deepEqual(calls.slice(posdeApp + 1).map((a) => a.slice(0, 3).join(" ")), [
    "ditto -c -k",
    "xcrun notarytool submit",
    "xcrun stapler staple",
    "hdiutil create -volname",
    "codesign --force --sign",
    "xcrun notarytool submit",
    "xcrun stapler staple",
  ]);
  assert.deepEqual(calls.at(-1), ["xcrun", "stapler", "staple", dmg]);
});

test("Apple qui refuse la notarisation fait échouer la construction ; notariser sans identité est refusé", (t) => {
  const root = folder(t);
  const { executer: base } = tools();
  const refusal: Executer = (command, args) => (command === "xcrun" && args[0] === "notarytool" ? { status: 0, stdout: "  status: Invalid\n", stderr: "" } : base(command, args));
  const options = { version: "1.2.3", electron: fakeElectron(root), node: fakeNode(root), sortie: join(root, "construit"), atelier: join(root, "atelier") };
  assert.throws(() => construire({ ...options, executer: refusal, identite: "id", profilNotarisation: "p" }), { code: 1, message: /Apple did not accept/ });
  assert.throws(() => construire({ ...options, atelier: join(root, "b"), executer: base, profilNotarisation: "p" }), { code: 2, message: /needs a Developer ID identity/ });
});

test("les métadonnées de mise à jour portent la version, la taille et l'empreinte sha512 du .dmg", (t) => {
  const root = folder(t);
  const dmg = join(root, "Brigade-1.2.3-arm64.dmg");
  writeFileSync(dmg, "dmg");
  const yml = metadonneesDeMiseAJour("1.2.3", dmg, "2026-10-19T00:00:00.000Z");
  assert.match(yml, /^version: 1\.2\.3\nfiles:\n  - url: Brigade-1\.2\.3-arm64\.dmg\n    sha512: [A-Za-z0-9+/]{86}==\n    size: 3\npath: Brigade-1\.2\.3-arm64\.dmg\nsha512: /);
  assert.match(yml, /releaseDate: '2026-10-19T00:00:00\.000Z'\n$/);
});

test("un `node` qui n'est pas pour un Mac arm64, ou qui lie les bibliothèques d'Homebrew, n'est pas porté : rien n'est écrit", (t) => {
  const root = folder(t);
  const linux = join(root, "node-linux");
  writeFileSync(linux, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
  const output = join(root, "construit");
  assert.throws(() => construire({ version: "1.0.0", electron: fakeElectron(root), node: linux, sortie: output, atelier: join(root, "a"), executer: tools().executer }), { code: 2, message: /is not a macOS arm64 binary/ });
  const homebrew = tools("node:\n\t/opt/homebrew/opt/libuv/lib/libuv.1.dylib (compatibility version 2.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n");
  assert.throws(() => construire({ version: "1.0.0", electron: join(root, "Electron.app"), node: fakeNode(root), sortie: output, atelier: join(root, "b"), executer: homebrew.executer }), {
    code: 2,
    message: /links libraries a bare Mac does not have \(\/opt\/homebrew\/opt\/libuv\/lib\/libuv\.1\.dylib\)/,
  });
  assert.ok(!existsSync(output));
});

test("l'Info.plist d'Electron passe au nom de l'app ; l'exécutable aussi : macOS nomme l'activité d'arrière-plan d'après lui", () => {
  const plist = reecrirePlist(PLIST, "0.20261019.151600");
  const value = (key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
  assert.equal(value("CFBundleName"), "Brigade");
  assert.equal(value("CFBundleDisplayName"), "Brigade");
  assert.equal(value("CFBundleIdentifier"), "com.github.benomite.brigade");
  assert.equal(value("CFBundleShortVersionString"), "0.20261019.151600");
  assert.equal(value("CFBundleVersion"), "0.20261019.151600");
  assert.equal(value("CFBundleExecutable"), "Brigade");
  assert.equal(value("NSPrincipalClass"), "AtomApplication");
  assert.doesNotMatch(plist, /ElectronAsarIntegrity|default_app\.asar/);
  // Toujours bien formé : autant de dictionnaires ouverts que fermés, et ce qui suivait la clé retirée est là.
  assert.equal(plist.match(/<dict>/g)?.length, plist.match(/<\/dict>/g)?.length);
  assert.match(plist, /<key>CFBundleVersion<\/key>\s*<string>0\.20261019\.151600<\/string>\s*<key>LSMinimumSystemVersion<\/key>/);
  assert.match(plist, /<\/dict>\n<\/plist>\n$/);
});

const plistHelp = (...lines: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${lines.map((l) => `\t${l}\n`).join("")}</dict>\n</plist>\n`;
const string = (key: string, value: string) => `<key>${key}</key>\n\t<string>${value}</string>`;

// Un paquet dont le seul auxiliaire porte ce plist (réécrit), vu par verifier-plist.
function defaultsWithHelp(t: TestContext, xml: string, folderHelp: string): { defauts: string[]; reecrit: string } {
  const root = folder(t);
  const content = join(root, "Brigade.app", "Contents");
  mkdirSync(join(content, "Frameworks", folderHelp, "Contents"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), plistHelp(string("CFBundleName", "Brigade"), string("CFBundleDisplayName", "Brigade"), string("CFBundleExecutable", "Brigade"), string("CFBundleIdentifier", IDENTIFIANT)));
  mkdirSync(join(content, "MacOS"), { recursive: true });
  writeFileSync(join(content, "MacOS", "Brigade"), "");
  const rewrites = reecrirePlistAuxiliaire(xml, folderHelp);
  mkdirSync(join(content, "Frameworks", folderHelp, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(content, "Frameworks", folderHelp, "Contents", "MacOS", nomDAuxiliaire(folderHelp)), "");
  writeFileSync(join(content, "Frameworks", folderHelp, "Contents", "Info.plist"), rewrites);
  return { defauts: defautsDeNom(join(root, "Brigade.app")), reecrit: rewrites };
}
const valueOf = (xml: string, key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

test("un auxiliaire sans CFBundleDisplayName : il est posé, du nom renommé", (t) => {
  const xml = plistHelp(string("CFBundleName", "Electron Helper (GPU)"), string("CFBundleIdentifier", "com.github.Electron.helper.GPU"));
  const { defauts: defaults, reecrit: rewrites } = defaultsWithHelp(t, xml, "Electron Helper (GPU).app");
  assert.deepEqual(defaults, []);
  assert.equal(valueOf(rewrites, "CFBundleName"), "Brigade Helper (GPU)");
  assert.equal(valueOf(rewrites, "CFBundleDisplayName"), "Brigade Helper (GPU)");
  assert.equal(valueOf(rewrites, "CFBundleIdentifier"), "com.github.benomite.brigade.helper.GPU");
});

test("un auxiliaire dont CFBundleDisplayName diffère de CFBundleName : il prend le nom renommé", (t) => {
  const xml = plistHelp(string("CFBundleName", "Electron Helper (Renderer)"), string("CFBundleDisplayName", "Electron"), string("CFBundleIdentifier", "com.github.Electron.helper.Renderer"));
  const { defauts: defaults, reecrit: rewrites } = defaultsWithHelp(t, xml, "Electron Helper (Renderer).app");
  assert.deepEqual(defaults, []);
  assert.equal(valueOf(rewrites, "CFBundleDisplayName"), "Brigade Helper (Renderer)");
});

test("un auxiliaire dont aucun nom n'est de la forme attendue : le nom vient de son dossier", (t) => {
  const xml = plistHelp(string("CFBundleName", "Helper"), string("CFBundleDisplayName", "Electron"), string("CFBundleIdentifier", "com.github.Electron.helper.Plugin"));
  const { defauts: defaults, reecrit: rewrites } = defaultsWithHelp(t, xml, "Electron Helper (Plugin).app");
  assert.deepEqual(defaults, []);
  assert.equal(valueOf(rewrites, "CFBundleName"), "Brigade Helper (Plugin)");
  assert.equal(valueOf(rewrites, "CFBundleDisplayName"), "Brigade Helper (Plugin)");
  const withoutNames = defaultsWithHelp(t, plistHelp(string("CFBundleExecutable", "Electron Helper"), string("CFBundleIdentifier", "com.github.Electron.helper")), "Electron Helper.app");
  assert.deepEqual(withoutNames.defauts, []);
  assert.equal(valueOf(withoutNames.reecrit, "CFBundleName"), "Brigade Helper");
});

test("assembler sur les cinq auxiliaires d'Electron : dossiers et exécutables renommés, et verifier-plist ne trouve rien", (t) => {
  const root = folder(t);
  const electron = fakeElectron(root);
  setAuxiliary(electron);
  const pkg = assembler({ version: "1.0.0", electron, node: fakeNode(root) }, join(root, "volume"));
  const frameworks = join(pkg, "Contents", "Frameworks");
  const renamed = (n: string) => n.replace(/^Electron/, "Brigade");
  const expected = Object.keys(AUXILIARY_ELECTRON).map((n) => `${renamed(n)}.app`);
  assert.deepEqual(readdirSync(frameworks).filter((n) => n.endsWith(".app")).sort(), expected.sort());
  for (const name of Object.keys(AUXILIARY_ELECTRON).map(renamed)) {
    assert.deepEqual(readdirSync(join(frameworks, `${name}.app`, "Contents", "MacOS")), [name]);
    const plist = readFileSync(join(frameworks, `${name}.app`, "Contents", "Info.plist"), "utf8");
    assert.equal(valueOf(plist, "CFBundleExecutable"), name);
    assert.match(valueOf(plist, "CFBundleName") ?? "", /^Brigade Helper/);
    assert.match(valueOf(plist, "CFBundleDisplayName") ?? "", /^Brigade Helper/);
  }
  assert.deepEqual(defautsDeNom(pkg), []);
});

test("ce qui n'est pas un plist est refusé avec un message clair", () => {
  assert.throws(() => reecrirePlistAuxiliaire("not a plist", "Electron Helper.app"), { code: 1, message: /is not a plist/ });
});

test("la version : celle du commit construit, et ce qu'un Mac en garde", () => {
  const run: Executer = (command, args) => (command === "git" && args.includes("--format=%cd+g%h") ? { status: 0, stdout: "20261019.151600+g76f93fe\n", stderr: "" } : { status: 1, stdout: "", stderr: "?" });
  assert.equal(versionDuCommit(run, "/depot"), "0.20261019.151600+g76f93fe");
  assert.throws(() => versionDuCommit(() => ({ status: 128, stdout: "", stderr: "fatal: not a git repository" }), "/depot"), { code: 2, message: /not a git repository\) — give it with --version/ });
  assert.equal(versionCourte("0.20261019.151600+g76f93fe"), "0.20261019.151600");
  assert.equal(versionCourte("1.2"), "1.2");
  for (const invalid of ["v1.2.0", "1.2.3.4", "", "1.x"]) assert.throws(() => versionCourte(invalid), { code: 2 }, invalid);
});

test("les dépendances de production : celles du verrou de l'app qui ne sont pas de dev", () => {
  const lock = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf8"));
  const production = dependancesDeProduction(lock);
  for (const expected of ["node_modules/@xterm/xterm", "node_modules/@xterm/addon-fit", "node_modules/node-pty"]) assert.ok(production.includes(expected), expected);
  for (const dev of ["node_modules/electron", "node_modules/typescript", "node_modules/@types/node"]) assert.ok(!production.includes(dev), dev);
  assert.deepEqual(dependancesDeProduction({ packages: { "": {}, "node_modules/a": {}, "node_modules/b": { dev: true }, "node_modules/c": { devOptional: true } } }), ["node_modules/a"]);
});

test("ce qui se lit d'un binaire et d'une liste d'empreintes", () => {
  assert.equal(estMachOArm64(MACH_O_ARM64), true);
  // x86_64, puis trop court.
  assert.equal(estMachOArm64(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01])), false);
  assert.equal(estMachOArm64(Buffer.from([0xcf, 0xfa])), false);
  assert.deepEqual(bibliothequesHorsSysteme("/x/node:\n\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0)\n\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (x)\n"), []);
  assert.deepEqual(bibliothequesHorsSysteme("/x/node:\n\t/usr/local/opt/icu4c/lib/libicui18n.74.dylib (compatibility version 74.0.0)\n"), ["/usr/local/opt/icu4c/lib/libicui18n.74.dylib"]);
  const fingerprint = "a".repeat(64);
  assert.equal(empreinteAnnoncee(`${"b".repeat(64)}  node-v26.0.0-linux-x64.tar.gz\n${fingerprint}  node-v26.0.0-darwin-arm64.tar.gz\n`, "node-v26.0.0-darwin-arm64.tar.gz"), fingerprint);
  assert.equal(empreinteAnnoncee(`${fingerprint}  node-v26.0.0-darwin-arm64.tar.xz\n`, "node-v26.0.0-darwin-arm64.tar.gz"), undefined);
});

test("la commande refuse une option inconnue — et, hors d'un Mac, de construire : rien n'est écrit", { skip: process.platform === "darwin" ? "sur un Mac, elle construirait pour de vrai" : false }, (t) => {
  const output = join(folder(t), "construit");
  const unknown = spawnSync(process.execPath, [BUILD, "--sortie", output, "--signer"], { encoding: "utf8" });
  assert.equal(unknown.status, 2, unknown.stderr);
  assert.match(unknown.stderr, /^brigade: app not built — .*--signer.* — usage: construire\.ts/);
  const elsewhere = spawnSync(process.execPath, [BUILD, "--sortie", output], { encoding: "utf8" });
  assert.equal(elsewhere.status, 2, elsewhere.stderr);
  assert.equal(elsewhere.stderr, `brigade: app not built — the .dmg is built on a Mac (\`codesign\`, \`hdiutil\`), not on ${process.platform}\n`);
  assert.ok(!existsSync(output));
});

test("la commande se lance par `npm --prefix app run dist`", () => {
  assert.equal(JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).scripts.dist, "node packaging/construire.ts");
});
