// Le .dmg de l'app (app/packaging/construire.ts) : ce que porte `Brigade.app`, et ce que l'app
// installée y trouve. Ni réseau ni Mac : Electron est une doublure de son paquet, `codesign`,
// `otool` et `hdiutil` des doublures qui relèvent ce qu'on leur demande. Ce qui ne se prouve que
// sur un Mac — l'app qui s'ouvre, la signature acceptée — est dans app/packaging/README.md.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  reecrirePlist,
  versionCourte,
  versionDuCommit,
  type Executer,
} from "../../packaging/construire.ts";
import { emplacementsDe, estInstallee } from "../../src/emplacements.ts";
import { roleDe } from "../../src/poste/role.ts";
import { PAQUETS } from "../aides/posix.ts";

const CONSTRUIRE = join(APP, "packaging", "construire.ts");

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

function dossier(t: TestContext): string {
  const cree = mkdtempSync(join(tmpdir(), "brigade-app-dmg-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

// Une doublure d'Electron.app : son Info.plist, son exécutable, son asar par défaut, et un
// framework rangé par liens, comme dans le zip.
function fauxElectron(racine: string): string {
  const electron = join(racine, "Electron.app");
  const contenu = join(electron, "Contents");
  mkdirSync(join(contenu, "MacOS"), { recursive: true });
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  writeFileSync(join(contenu, "Info.plist"), PLIST);
  writeFileSync(join(contenu, "MacOS", "Electron"), MACH_O_ARM64);
  writeFileSync(join(contenu, "Resources", "default_app.asar"), "asar");
  const framework = join(contenu, "Frameworks", "Electron Framework.framework");
  mkdirSync(join(framework, "Versions", "A"), { recursive: true });
  writeFileSync(join(framework, "Versions", "A", "Electron Framework"), MACH_O_ARM64);
  symlinkSync("A", join(framework, "Versions", "Current"));
  symlinkSync("Versions/Current/Electron Framework", join(framework, "Electron Framework"));
  return electron;
}

function fauxNode(racine: string): string {
  const node = join(racine, "node");
  writeFileSync(node, MACH_O_ARM64);
  return node;
}

// Des doublures de `otool`, `codesign` et `hdiutil` : chaque appel relevé ; `hdiutil` écrit le
// .dmg et relève ce que son volume porte.
function outils(otool = "node:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1345.0.0)\n") {
  const appels: string[][] = [];
  let volume: string[] | undefined;
  const executer: Executer = (commande, args) => {
    appels.push([commande, ...args]);
    if (commande === "otool") return { status: 0, stdout: otool, stderr: "" };
    if (commande === "hdiutil") {
      const source = args[args.indexOf("-srcfolder") + 1] ?? "";
      volume = readdirSync(source).sort();
      writeFileSync(args.at(-1) ?? "", "dmg");
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { executer, appels, volume: () => volume };
}

test("Brigade.app porte l'app, le runtime et le `node` du paquet — et l'app installée y trouve sa station", { skip: PAQUETS }, (t) => {
  const racine = dossier(t);
  const paquet = assembler({ version: "0.20261019.151600+g76f93fe", electron: fauxElectron(racine), node: fauxNode(racine) }, join(racine, "volume"));
  const ressources = join(paquet, "Contents", "Resources");

  // L'app : ses sources et ses dépendances de production, rangées comme dans le dépôt — ni tests, ni Electron.
  assert.ok(existsSync(join(ressources, "app", "src", "main.ts")));
  assert.ok(existsSync(join(ressources, "app", "src", "vue", "index.html")));
  assert.ok(existsSync(join(ressources, "app", "node_modules", "@xterm", "xterm", "lib", "xterm.mjs")));
  assert.ok(!existsSync(join(ressources, "app", "test")));
  assert.ok(!existsSync(join(ressources, "app", "node_modules", "electron")));
  assert.ok(!existsSync(join(ressources, "app", "node_modules", "typescript")));
  const declare = JSON.parse(readFileSync(join(ressources, "app", "package.json"), "utf8"));
  assert.equal(declare.main, "src/main.ts");
  assert.equal(declare.type, "module");
  assert.equal(declare.productName, "Brigade");
  assert.equal(declare.version, "0.20261019.151600+g76f93fe");
  assert.equal(declare.devDependencies, undefined);
  assert.equal(declare.scripts, undefined);

  // node-pty : ce qui est compilé pour darwin-arm64, et rien d'autre — ni pour une autre machine, ni ses sources.
  const pty = join(ressources, "app", "node_modules", "node-pty");
  assert.deepEqual(readdirSync(join(pty, "prebuilds")), ["darwin-arm64"]);
  assert.ok(existsSync(join(pty, "prebuilds", "darwin-arm64", "pty.node")));
  assert.equal(statSync(join(pty, "prebuilds", "darwin-arm64", "spawn-helper")).mode & 0o111, 0o111);
  for (const source of ["build", "deps", "src", "third_party"]) assert.ok(!existsSync(join(pty, source)), source);
  assert.ok(existsSync(join(pty, "lib", "index.js")));

  // Le runtime, à la version construite, sans ses tests ; et le `node` du paquet, exécutable.
  assert.ok(existsSync(join(ressources, "runtime", "src", "station", "main.ts")));
  assert.ok(!existsSync(join(ressources, "runtime", "test")));
  assert.ok(!existsSync(join(ressources, "runtime", "node_modules")));
  assert.equal(JSON.parse(readFileSync(join(ressources, "runtime", "package.json"), "utf8")).version, "0.20261019.151600+g76f93fe");
  assert.equal(statSync(join(ressources, "node", "bin", "node")).mode & 0o755, 0o755);

  // Electron, au nom de l'app : son asar par défaut est parti, ses liens sont restés des liens.
  assert.ok(!existsSync(join(ressources, "default_app.asar")));
  const framework = join(paquet, "Contents", "Frameworks", "Electron Framework.framework");
  assert.ok(lstatSync(join(framework, "Electron Framework")).isSymbolicLink());
  assert.equal(readlinkSync(join(framework, "Versions", "Current")), "A");
  assert.match(readFileSync(join(paquet, "Contents", "Info.plist"), "utf8"), /<key>CFBundleName<\/key>\s*<string>Brigade<\/string>/);

  // Ce que l'app installée résout, depuis là où son process principal tourne : la station de son paquet, et son `node`.
  assert.equal(estInstallee({ ressources, src: join(ressources, "app", "src") }), true);
  const emplacements = emplacementsDe({ ressources, src: join(ressources, "app", "src"), env: {} });
  assert.equal(emplacements.node, join(ressources, "node", "bin", "node"));
  assert.ok(existsSync(emplacements.node));
  assert.deepEqual(roleDe({ plateforme: "darwin", runtime: emplacements.runtime, env: {} }), { role: "station", principal: join(ressources, "runtime", "src", "station", "main.ts") });
});

test("la station du paquet se charge tout entière depuis lui : l'enveloppe de l'app la lance, et elle refuse faute de répertoire", (t) => {
  const racine = dossier(t);
  const paquet = assembler({ version: "1.0.0", electron: fauxElectron(racine), node: fauxNode(racine) }, join(racine, "volume"));
  const ressources = join(paquet, "Contents", "Resources");
  const emplacements = emplacementsDe({ ressources, src: join(ressources, "app", "src"), env: {} });
  const role = roleDe({ plateforme: "darwin", runtime: emplacements.runtime, env: {} });
  assert.equal(role.role, "station");
  // Lancée comme l'app la lance (poste/station.ts) — mais par ce `node`-ci : celui du paquet est une doublure.
  // Son refus vient après l'import de tout ce qu'elle importe : le runtime du paquet est complet.
  const { BRIGADE_STATION_DIR: _, ...env } = process.env;
  const lance = spawnSync(process.execPath, [join(ressources, "app", "src", "poste", "enveloppe.ts"), role.role === "station" ? role.principal : ""], { cwd: emplacements.runtime, env, encoding: "utf8", input: "" });
  assert.equal(lance.status, 2, lance.stderr);
  assert.match(lance.stderr, /refus de démarrer la station — BRIGADE_STATION_DIR n'est pas défini/);
});

test("le .dmg : l'app signée ad hoc, puis un volume qui porte Brigade.app et le lien vers Applications", { skip: PAQUETS }, (t) => {
  const racine = dossier(t);
  const { executer, appels, volume } = outils();
  const sortie = join(racine, "construit");
  const dmg = construire({ version: "0.20261019.151600+g76f93fe", electron: fauxElectron(racine), node: fauxNode(racine), sortie, atelier: join(racine, "atelier"), executer });

  assert.equal(dmg, join(sortie, "Brigade-0.20261019.151600+g76f93fe-arm64.dmg"));
  assert.ok(existsSync(dmg));
  assert.deepEqual(volume(), ["Applications", "Brigade.app"]);
  assert.equal(readlinkSync(join(racine, "atelier", "volume", "Applications")), "/Applications");
  const paquet = join(racine, "atelier", "volume", "Brigade.app");
  const pty = join(paquet, "Contents", "Resources", "app", "node_modules", "node-pty", "prebuilds", "darwin-arm64");
  assert.deepEqual(appels, [
    ["otool", "-L", join(racine, "node")],
    ["codesign", "--force", "--sign", "-", join(pty, "pty.node")],
    ["codesign", "--force", "--sign", "-", join(pty, "spawn-helper")],
    ["codesign", "--force", "--deep", "--sign", "-", paquet],
    ["codesign", "--verify", paquet],
    ["hdiutil", "create", "-volname", "Brigade", "-srcfolder", join(racine, "atelier", "volume"), "-fs", "HFS+", "-format", "UDZO", "-ov", dmg],
  ]);
});

test("signé Developer ID et notarisé : du plus profond au paquet, l'app agrafée avant le .dmg, qui l'est à son tour", { skip: PAQUETS }, (t) => {
  const racine = dossier(t);
  const { executer: base, appels } = outils();
  const executer: Executer = (commande, args) => (commande === "xcrun" && args[0] === "notarytool" ? (appels.push([commande, ...args]), { status: 0, stdout: "  status: Accepted\n", stderr: "" }) : base(commande, args));
  const sortie = join(racine, "construit");
  const dmg = construire({ version: "1.2.3", electron: fauxElectron(racine), node: fauxNode(racine), sortie, atelier: join(racine, "atelier"), executer, identite: "Developer ID Application: Test (ABCDE12345)", profilNotarisation: "brigade-notary" });
  const paquet = join(racine, "atelier", "volume", "Brigade.app");
  const signes = appels.filter((a) => a[0] === "codesign" && a.includes("--entitlements")).map((a) => a.at(-1));
  assert.deepEqual(signes, aSigner(paquet));
  assert.equal(signes.at(-1), paquet);
  assert.ok(signes.some((c) => c?.endsWith("node/bin/node")), "le node porté est signé");
  for (const a of appels.filter((a) => a[0] === "codesign" && a.includes("--entitlements")))
    assert.deepEqual(a.slice(0, -1), ["codesign", "--force", "--sign", "Developer ID Application: Test (ABCDE12345)", "--options", "runtime", "--timestamp", "--entitlements", DROITS]);
  const ordre = appels.map((a) => a.filter((m) => !m.startsWith("/")).join(" "));
  const posdeApp = ordre.indexOf("codesign --verify --deep --strict");
  assert.ok(posdeApp > 0);
  assert.deepEqual(appels.slice(posdeApp + 1).map((a) => a.slice(0, 3).join(" ")), [
    "ditto -c -k",
    "xcrun notarytool submit",
    "xcrun stapler staple",
    "hdiutil create -volname",
    "codesign --force --sign",
    "xcrun notarytool submit",
    "xcrun stapler staple",
  ]);
  assert.deepEqual(appels.at(-1), ["xcrun", "stapler", "staple", dmg]);
});

test("Apple qui refuse la notarisation fait échouer la construction ; notariser sans identité est refusé", (t) => {
  const racine = dossier(t);
  const { executer: base } = outils();
  const refus: Executer = (commande, args) => (commande === "xcrun" && args[0] === "notarytool" ? { status: 0, stdout: "  status: Invalid\n", stderr: "" } : base(commande, args));
  const options = { version: "1.2.3", electron: fauxElectron(racine), node: fauxNode(racine), sortie: join(racine, "construit"), atelier: join(racine, "atelier") };
  assert.throws(() => construire({ ...options, executer: refus, identite: "id", profilNotarisation: "p" }), { code: 1, message: /Apple did not accept/ });
  assert.throws(() => construire({ ...options, atelier: join(racine, "b"), executer: base, profilNotarisation: "p" }), { code: 2, message: /needs a Developer ID identity/ });
});

test("les métadonnées de mise à jour portent la version, la taille et l'empreinte sha512 du .dmg", (t) => {
  const racine = dossier(t);
  const dmg = join(racine, "Brigade-1.2.3-arm64.dmg");
  writeFileSync(dmg, "dmg");
  const yml = metadonneesDeMiseAJour("1.2.3", dmg, "2026-10-19T00:00:00.000Z");
  assert.match(yml, /^version: 1\.2\.3\nfiles:\n  - url: Brigade-1\.2\.3-arm64\.dmg\n    sha512: [A-Za-z0-9+/]{86}==\n    size: 3\npath: Brigade-1\.2\.3-arm64\.dmg\nsha512: /);
  assert.match(yml, /releaseDate: '2026-10-19T00:00:00\.000Z'\n$/);
});

test("un `node` qui n'est pas pour un Mac arm64, ou qui lie les bibliothèques d'Homebrew, n'est pas porté : rien n'est écrit", (t) => {
  const racine = dossier(t);
  const linux = join(racine, "node-linux");
  writeFileSync(linux, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
  const sortie = join(racine, "construit");
  assert.throws(() => construire({ version: "1.0.0", electron: fauxElectron(racine), node: linux, sortie, atelier: join(racine, "a"), executer: outils().executer }), { code: 2, message: /is not a macOS arm64 binary/ });
  const homebrew = outils("node:\n\t/opt/homebrew/opt/libuv/lib/libuv.1.dylib (compatibility version 2.0.0)\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n");
  assert.throws(() => construire({ version: "1.0.0", electron: join(racine, "Electron.app"), node: fauxNode(racine), sortie, atelier: join(racine, "b"), executer: homebrew.executer }), {
    code: 2,
    message: /links libraries a bare Mac does not have \(\/opt\/homebrew\/opt\/libuv\/lib\/libuv\.1\.dylib\)/,
  });
  assert.ok(!existsSync(sortie));
});

test("l'Info.plist d'Electron passe au nom de l'app ; l'exécutable garde le sien, sous lequel Electron cherche ses auxiliaires", () => {
  const plist = reecrirePlist(PLIST, "0.20261019.151600");
  const valeur = (cle: string) => new RegExp(`<key>${cle}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
  assert.equal(valeur("CFBundleName"), "Brigade");
  assert.equal(valeur("CFBundleDisplayName"), "Brigade");
  assert.equal(valeur("CFBundleIdentifier"), "com.github.benomite.brigade");
  assert.equal(valeur("CFBundleShortVersionString"), "0.20261019.151600");
  assert.equal(valeur("CFBundleVersion"), "0.20261019.151600");
  assert.equal(valeur("CFBundleExecutable"), "Electron");
  assert.equal(valeur("NSPrincipalClass"), "AtomApplication");
  assert.doesNotMatch(plist, /ElectronAsarIntegrity|default_app\.asar/);
  // Toujours bien formé : autant de dictionnaires ouverts que fermés, et ce qui suivait la clé retirée est là.
  assert.equal(plist.match(/<dict>/g)?.length, plist.match(/<\/dict>/g)?.length);
  assert.match(plist, /<key>CFBundleVersion<\/key>\s*<string>0\.20261019\.151600<\/string>\s*<key>LSMinimumSystemVersion<\/key>/);
  assert.match(plist, /<\/dict>\n<\/plist>\n$/);
});

test("la version : celle du commit construit, et ce qu'un Mac en garde", () => {
  const executer: Executer = (commande, args) => (commande === "git" && args.includes("--format=%cd+g%h") ? { status: 0, stdout: "20261019.151600+g76f93fe\n", stderr: "" } : { status: 1, stdout: "", stderr: "?" });
  assert.equal(versionDuCommit(executer, "/depot"), "0.20261019.151600+g76f93fe");
  assert.throws(() => versionDuCommit(() => ({ status: 128, stdout: "", stderr: "fatal: not a git repository" }), "/depot"), { code: 2, message: /not a git repository\) — give it with --version/ });
  assert.equal(versionCourte("0.20261019.151600+g76f93fe"), "0.20261019.151600");
  assert.equal(versionCourte("1.2"), "1.2");
  for (const invalide of ["v1.2.0", "1.2.3.4", "", "1.x"]) assert.throws(() => versionCourte(invalide), { code: 2 }, invalide);
});

test("les dépendances de production : celles du verrou de l'app qui ne sont pas de dev", () => {
  const verrou = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf8"));
  const production = dependancesDeProduction(verrou);
  for (const attendue of ["node_modules/@xterm/xterm", "node_modules/@xterm/addon-fit", "node_modules/node-pty"]) assert.ok(production.includes(attendue), attendue);
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
  const empreinte = "a".repeat(64);
  assert.equal(empreinteAnnoncee(`${"b".repeat(64)}  node-v26.0.0-linux-x64.tar.gz\n${empreinte}  node-v26.0.0-darwin-arm64.tar.gz\n`, "node-v26.0.0-darwin-arm64.tar.gz"), empreinte);
  assert.equal(empreinteAnnoncee(`${empreinte}  node-v26.0.0-darwin-arm64.tar.xz\n`, "node-v26.0.0-darwin-arm64.tar.gz"), undefined);
});

test("la commande refuse une option inconnue — et, hors d'un Mac, de construire : rien n'est écrit", { skip: process.platform === "darwin" ? "sur un Mac, elle construirait pour de vrai" : false }, (t) => {
  const sortie = join(dossier(t), "construit");
  const inconnue = spawnSync(process.execPath, [CONSTRUIRE, "--sortie", sortie, "--signer"], { encoding: "utf8" });
  assert.equal(inconnue.status, 2, inconnue.stderr);
  assert.match(inconnue.stderr, /^brigade: app not built — .*--signer.* — usage: construire\.ts/);
  const ailleurs = spawnSync(process.execPath, [CONSTRUIRE, "--sortie", sortie], { encoding: "utf8" });
  assert.equal(ailleurs.status, 2, ailleurs.stderr);
  assert.equal(ailleurs.stderr, `brigade: app not built — the .dmg is built on a Mac (\`codesign\`, \`hdiutil\`), not on ${process.platform}\n`);
  assert.ok(!existsSync(sortie));
});

test("la commande se lance par `npm --prefix app run dist`", () => {
  assert.equal(JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).scripts.dist, "node packaging/construire.ts");
});
