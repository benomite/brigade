// Test d'acceptation gelé (#4265). Critère 2 : le `node` porté ne garde ni le nom de Node.js Foundation ni son identité de signature : il est renommé et signé avec l'identité de Brigade de la config de paquetage.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler, construire, IDENTIFIANT } from "../../packaging/construire.ts";
import { PACKAGES } from "../helpers/posix.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const plist = (name: string, id: string, icon?: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${name}</string>
	<key>CFBundleExecutable</key>
	<string>${name}</string>
${icon === undefined ? "" : `	<key>CFBundleIconFile</key>\n	<string>${icon}</string>\n`}	<key>CFBundleIdentifier</key>
	<string>${id}</string>
	<key>CFBundleName</key>
	<string>${name}</string>
	<key>CFBundleShortVersionString</key>
	<string>44.7.0</string>
	<key>CFBundleVersion</key>
	<string>44.7.0</string>
</dict>
</plist>
`;

// Une doublure d'Electron.app avec ses quatre auxiliaires et un agent launchd d'Electron, comme dans le zip d'Electron.
function standIn(root: string): { electron: string; node: string } {
  const electron = join(root, "Electron.app");
  const content = join(electron, "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  mkdirSync(join(content, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), plist("Electron", "com.github.Electron", "electron.icns"));
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(content, "Resources", "electron.icns"), "icns-electron");
  writeFileSync(
    join(content, "Library", "LaunchAgents", "com.github.Electron.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>Label</key>\n\t<string>com.github.Electron.helper</string>\n\t<key>Program</key>\n\t<string>Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper</string>\n</dict>\n</plist>\n`,
  );
  for (const suffix of ["", " (GPU)", " (Renderer)", " (Plugin)"]) {
    const help = join(content, "Frameworks", `Electron Helper${suffix}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    writeFileSync(join(help, "Info.plist"), plist(`Electron Helper${suffix}`, "com.github.Electron.helper"));
    writeFileSync(join(help, "MacOS", `Electron Helper${suffix}`), MACH_O);
  }
  const node = join(root, "node");
  writeFileSync(node, MACH_O);
  // Une app et un runtime minimaux : le test n'a pas besoin des dépendances installées.
  mkdirSync(join(root, "app", "src"), { recursive: true });
  writeFileSync(join(root, "app", "src", "main.ts"), "");
  writeFileSync(join(root, "app", "package.json"), JSON.stringify({ name: "brigade-app", version: "0.0.0" }));
  writeFileSync(join(root, "app", "package-lock.json"), JSON.stringify({ packages: {} }));
  mkdirSync(join(root, "runtime", "src"), { recursive: true });
  writeFileSync(join(root, "runtime", "src", "main.ts"), "");
  writeFileSync(join(root, "runtime", "package.json"), JSON.stringify({ name: "brigade-runtime", engines: { node: ">=26" } }));
  return { electron, node };
}
const AROUND = (root: string) => ({ app: join(root, "app"), runtime: join(root, "runtime") });
const built = (): { racine: string; paquet: string } => {
  const root = mkdtempSync(join(tmpdir(), "brigade-4265-"));
  const { electron, node } = standIn(root);
  return { racine: root, paquet: assembler({ version: "1.0.0", electron, node, ...AROUND(root) }, join(root, "volume")) };
};
const key = (xml: string, name: string) => new RegExp(`<key>${name}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
const files = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(folder, e.name)) : e.isFile() ? [join(folder, e.name)] : []));
const withoutApp = (path: string) => !/\/Resources\/(app|runtime)\//.test(path);

test("the bundled node executable is renamed and signed with the Brigade identity and a Brigade identifier", { skip: PACKAGES }, (t) => {
  const { racine: root, paquet: pkg } = built();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodes = files(join(pkg, "Contents", "Resources")).filter((f) => withoutApp(f) && readFileSync(f).subarray(0, 4).equals(MACH_O.subarray(0, 4)));
  assert.equal(nodes.length, 1, `one bundled executable under Resources/, got ${nodes.join(", ")}`);
  assert.doesNotMatch(nodes[0]!.split("/").pop()!, /^node$/i, "the bundled node keeps the plain 'node' name");

  const identity = "Developer ID Application: Brigade (ABCDE12345)";
  const calls: string[][] = [];
  const run = (command: string, args: readonly string[]) => {
    if (command === "codesign") calls.push([...args]);
    return { status: 0, stdout: "", stderr: "" };
  };
  const atelier = join(root, "atelier");
  const { electron, node } = { electron: join(root, "Electron.app"), node: join(root, "node") };
  construire({ version: "1.0.0", electron, node, ...AROUND(root), sortie: join(root, "sortie"), atelier, executer: run, identite: identity });
  const name = nodes[0]!.split("/").pop()!;
  const signs = calls.filter((a) => a.some((x) => x.endsWith(`/${name}`)));
  assert.ok(signs.length > 0, "the bundled node is signed on its own");
  for (const call of signs) {
    assert.equal(call[call.indexOf("--sign") + 1], identity, "signed with the Brigade identity");
    const i = call.indexOf("--identifier");
    assert.ok(i >= 0 && call[i + 1]!.startsWith(IDENTIFIANT), "signed under a Brigade identifier, not 'node'");
  }
});
