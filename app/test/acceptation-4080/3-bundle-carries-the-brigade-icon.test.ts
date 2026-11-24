// Test d'acceptation gelé (#4080). Critère 3 : le paquet construit porte l'icône Brigade, et l'Info.plist y pointe.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const plist = (nom: string, id: string, icone?: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${nom}</string>
	<key>CFBundleExecutable</key>
	<string>${nom}</string>
${icone === undefined ? "" : `	<key>CFBundleIconFile</key>\n	<string>${icone}</string>\n`}	<key>CFBundleIdentifier</key>
	<string>${id}</string>
	<key>CFBundleName</key>
	<string>${nom}</string>
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
  for (const nom of readdirSync(frameworks)) if (nom.endsWith(".app")) trouves.push(join(frameworks, nom, "Contents", "Info.plist"));
  return trouves;
}
const cle = (xml: string, nom: string) => new RegExp(`<key>${nom}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];

test("the built bundle contains the Brigade icon and Info.plist points to it", (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const xml = readFileSync(join(paquet, "Contents", "Info.plist"), "utf8");
  const fichier = cle(xml, "CFBundleIconFile") ?? "";
  const nom = fichier.endsWith(".icns") ? fichier : `${fichier}.icns`;
  assert.match(nom, /brigade/i, "CFBundleIconFile names the Brigade icon");
  const icone = join(paquet, "Contents", "Resources", nom);
  assert.deepEqual(readFileSync(icone), readFileSync(join(import.meta.dirname, "../../packaging/icones/Brigade.icns")));
});
