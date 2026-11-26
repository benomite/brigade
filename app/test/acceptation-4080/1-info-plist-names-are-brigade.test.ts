// Test d'acceptation gelé (#4080). Critère 1 : dans l'Info.plist du paquet construit, CFBundleName et CFBundleDisplayName valent « Brigade ».
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const plist = (name: string, id: string, icone?: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${name}</string>
	<key>CFBundleExecutable</key>
	<string>${name}</string>
${icone === undefined ? "" : `	<key>CFBundleIconFile</key>\n	<string>${icone}</string>\n`}	<key>CFBundleIdentifier</key>
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
function construit(): { racine: string; paquet: string } {
  const racine = mkdtempSync(join(tmpdir(), "brigade-4080-"));
  const electron = join(racine, "Electron.app");
  const contenu = join(electron, "Contents");
  mkdirSync(join(contenu, "MacOS"), { recursive: true });
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  writeFileSync(join(contenu, "Info.plist"), plist("Electron", "com.github.Electron", "electron.icns"));
  writeFileSync(join(contenu, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(contenu, "Resources", "electron.icns"), "icns-electron");
  for (const suffixe of ["", " (GPU)", " (Renderer)", " (Plugin)"]) {
    const aide = join(contenu, "Frameworks", `Electron Helper${suffixe}.app`, "Contents");
    mkdirSync(join(aide, "MacOS"), { recursive: true });
    writeFileSync(join(aide, "Info.plist"), plist(`Electron Helper${suffixe}`, "com.github.Electron.helper"));
    writeFileSync(join(aide, "MacOS", `Electron Helper${suffixe}`), MACH_O);
  }
  const node = join(racine, "node");
  writeFileSync(node, MACH_O);
  return { racine, paquet: assembler({ version: "1.0.0", electron, node }, join(racine, "volume")) };
}

// Tous les Info.plist du paquet : l'app, puis ses auxiliaires.
function lesPlists(paquet: string): string[] {
  const trouves = [join(paquet, "Contents", "Info.plist")];
  const frameworks = join(paquet, "Contents", "Frameworks");
  for (const name of readdirSync(frameworks)) if (name.endsWith(".app")) trouves.push(join(frameworks, name, "Contents", "Info.plist"));
  return trouves;
}
const cle = (xml: string, name: string) => new RegExp(`<key>${name}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

test("the built Info.plist has CFBundleName and CFBundleDisplayName equal to 'Brigade'", (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const xml = readFileSync(join(paquet, "Contents", "Info.plist"), "utf8");
  assert.equal(cle(xml, "CFBundleName"), "Brigade");
  assert.equal(cle(xml, "CFBundleDisplayName"), "Brigade");
});
