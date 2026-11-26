// Test d'acceptation gelé (#4265). Critère 1 : un contrôle, sans Mac, lit l'app construite et échoue si un auxiliaire ou exécutable sous Contents/ a un CFBundleName, CFBundleDisplayName, CFBundleExecutable ou CFBundleIdentifier contenant « Electron » ou hors du préfixe d'identifiant de Brigade.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler, construire, IDENTIFIANT } from "../../packaging/construire.ts";

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

// Une doublure d'Electron.app avec ses quatre auxiliaires et un agent launchd d'Electron, comme dans le zip d'Electron.
function doublure(racine: string): { electron: string; node: string } {
  const electron = join(racine, "Electron.app");
  const contenu = join(electron, "Contents");
  mkdirSync(join(contenu, "MacOS"), { recursive: true });
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  mkdirSync(join(contenu, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(join(contenu, "Info.plist"), plist("Electron", "com.github.Electron", "electron.icns"));
  writeFileSync(join(contenu, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(contenu, "Resources", "electron.icns"), "icns-electron");
  writeFileSync(
    join(contenu, "Library", "LaunchAgents", "com.github.Electron.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>Label</key>\n\t<string>com.github.Electron.helper</string>\n\t<key>Program</key>\n\t<string>Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper</string>\n</dict>\n</plist>\n`,
  );
  for (const suffixe of ["", " (GPU)", " (Renderer)", " (Plugin)"]) {
    const aide = join(contenu, "Frameworks", `Electron Helper${suffixe}.app`, "Contents");
    mkdirSync(join(aide, "MacOS"), { recursive: true });
    writeFileSync(join(aide, "Info.plist"), plist(`Electron Helper${suffixe}`, "com.github.Electron.helper"));
    writeFileSync(join(aide, "MacOS", `Electron Helper${suffixe}`), MACH_O);
  }
  const node = join(racine, "node");
  writeFileSync(node, MACH_O);
  // Une app et un runtime minimaux : le test n'a pas besoin des dépendances installées.
  mkdirSync(join(racine, "app", "src"), { recursive: true });
  writeFileSync(join(racine, "app", "src", "main.ts"), "");
  writeFileSync(join(racine, "app", "package.json"), JSON.stringify({ name: "brigade-app", version: "0.0.0" }));
  writeFileSync(join(racine, "app", "package-lock.json"), JSON.stringify({ packages: {} }));
  mkdirSync(join(racine, "runtime", "src"), { recursive: true });
  writeFileSync(join(racine, "runtime", "src", "main.ts"), "");
  writeFileSync(join(racine, "runtime", "package.json"), JSON.stringify({ name: "brigade-runtime", engines: { node: ">=26" } }));
  return { electron, node };
}
const AUTOUR = (racine: string) => ({ app: join(racine, "app"), runtime: join(racine, "runtime") });
const construit = (): { racine: string; paquet: string } => {
  const racine = mkdtempSync(join(tmpdir(), "brigade-4265-"));
  const { electron, node } = doublure(racine);
  return { racine, paquet: assembler({ version: "1.0.0", electron, node, ...AUTOUR(racine) }, join(racine, "volume")) };
};
const cle = (xml: string, nom: string) => new RegExp(`<key>${nom}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
const fichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : e.isFile() ? [join(dossier, e.name)] : []));
const sansApp = (chemin: string) => !/\/Resources\/(app|runtime)\//.test(chemin);

test("every Info.plist under Contents/ has Name, DisplayName, Executable and Identifier free of 'Electron' and under the Brigade bundle ID prefix, and its executable exists", (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const plists = fichiers(join(paquet, "Contents")).filter((f) => f.endsWith("/Info.plist") && sansApp(f));
  assert.ok(plists.length >= 5, `the app and its helpers have an Info.plist, got ${plists.length}`);
  const defauts: string[] = [];
  for (const chemin of plists) {
    const xml = readFileSync(chemin, "utf8");
    for (const champ of ["CFBundleName", "CFBundleDisplayName", "CFBundleExecutable", "CFBundleIdentifier"]) {
      if (/electron/i.test(cle(xml, champ) ?? "")) defauts.push(`${chemin}: ${champ} says Electron`);
    }
    if (!(cle(xml, "CFBundleIdentifier") ?? "").startsWith(IDENTIFIANT)) defauts.push(`${chemin}: identifier outside ${IDENTIFIANT}`);
    const executable = cle(xml, "CFBundleExecutable") ?? "";
    if (!fichiers(join(chemin, "..", "MacOS")).some((f) => f.endsWith(`/${executable}`))) defauts.push(`${chemin}: executable ${executable} is not in MacOS/`);
  }
  assert.deepEqual(defauts, []);
});
