// Test d'acceptation gelé (#4265). Critère 1 : un contrôle, sans Mac, lit l'app construite et échoue si un auxiliaire ou exécutable sous Contents/ a un CFBundleName, CFBundleDisplayName, CFBundleExecutable ou CFBundleIdentifier contenant « Electron » ou hors du préfixe d'identifiant de Brigade.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler, IDENTIFIANT } from "../../packaging/construire.ts";
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

test("every Info.plist under Contents/ has Name, DisplayName, Executable and Identifier free of 'Electron' and under the Brigade bundle ID prefix, and its executable exists", { skip: PACKAGES }, (t) => {
  const { racine: root, paquet: pkg } = built();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plists = files(join(pkg, "Contents")).filter((f) => f.endsWith("/Info.plist") && withoutApp(f));
  assert.ok(plists.length >= 5, `the app and its helpers have an Info.plist, got ${plists.length}`);
  const defaults: string[] = [];
  for (const path of plists) {
    const xml = readFileSync(path, "utf8");
    for (const field of ["CFBundleName", "CFBundleDisplayName", "CFBundleExecutable", "CFBundleIdentifier"]) {
      if (/electron/i.test(key(xml, field) ?? "")) defaults.push(`${path}: ${field} says Electron`);
    }
    if (!(key(xml, "CFBundleIdentifier") ?? "").startsWith(IDENTIFIANT)) defaults.push(`${path}: identifier outside ${IDENTIFIANT}`);
    const executable = key(xml, "CFBundleExecutable") ?? "";
    if (!files(join(path, "..", "MacOS")).some((f) => f.endsWith(`/${executable}`))) defaults.push(`${path}: executable ${executable} is not in MacOS/`);
  }
  assert.deepEqual(defaults, []);
});
