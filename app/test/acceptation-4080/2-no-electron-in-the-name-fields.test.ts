// Test d'acceptation gelé (#4080). Critère 2 : « Electron » n'apparaît dans aucun champ de nom visible du paquet (Info.plist et auxiliaires).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";

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

// Une doublure d'Electron.app avec ses quatre auxiliaires, comme dans le zip d'Electron.
function built(): { racine: string; paquet: string } {
  const root = mkdtempSync(join(tmpdir(), "brigade-4080-"));
  const electron = join(root, "Electron.app");
  const content = join(electron, "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), plist("Electron", "com.github.Electron", "electron.icns"));
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(content, "Resources", "electron.icns"), "icns-electron");
  for (const suffix of ["", " (GPU)", " (Renderer)", " (Plugin)"]) {
    const help = join(content, "Frameworks", `Electron Helper${suffix}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    writeFileSync(join(help, "Info.plist"), plist(`Electron Helper${suffix}`, "com.github.Electron.helper"));
    writeFileSync(join(help, "MacOS", `Electron Helper${suffix}`), MACH_O);
  }
  const node = join(root, "node");
  writeFileSync(node, MACH_O);
  return { racine: root, paquet: assembler({ version: "1.0.0", electron, node }, join(root, "volume")) };
}

// Tous les Info.plist du paquet : l'app, puis ses auxiliaires.
function thePlists(pkg: string): string[] {
  const found = [join(pkg, "Contents", "Info.plist")];
  const frameworks = join(pkg, "Contents", "Frameworks");
  for (const name of readdirSync(frameworks)) if (name.endsWith(".app")) found.push(join(frameworks, name, "Contents", "Info.plist"));
  return found;
}
const key = (xml: string, name: string) => new RegExp(`<key>${name}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

test("'Electron' is in no user-visible name field of the built bundle, helper apps included", (t) => {
  const { racine: root, paquet: pkg } = built();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plists = thePlists(pkg);
  assert.ok(plists.length >= 5);
  for (const path of plists) {
    const xml = readFileSync(path, "utf8");
    for (const name of ["CFBundleName", "CFBundleDisplayName"]) assert.doesNotMatch(key(xml, name) ?? "", /electron/i, `${name} in ${path}`);
  }
});
