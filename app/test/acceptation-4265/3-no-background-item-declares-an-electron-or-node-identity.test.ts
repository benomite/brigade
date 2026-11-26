// Test d'acceptation gelé (#4265). Critère 3 : aucun agent launchd, enregistrement de login item ou autre déclaration de fond, dans l'app construite ou dans les sources, ne cite une identité Electron ou Node.js Foundation ; tous portent le nom et l'identifiant de Brigade.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler, construire, IDENTIFIANT } from "../../packaging/construire.ts";
import { PAQUETS } from "../aides/posix.ts";

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

const SRC = join(import.meta.dirname, "../../src");

test("no launchd plist of the built app names Electron or Node.js Foundation, and each uses the Brigade bundle ID", { skip: PAQUETS }, (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const agents = fichiers(join(paquet, "Contents")).filter((f) => sansApp(f) && /\/Library\/(LaunchAgents|LaunchDaemons|LoginItems)\//.test(f));
  const defauts: string[] = [];
  for (const chemin of agents) {
    const texte = readFileSync(chemin, "utf8");
    if (/electron|node\.js foundation/i.test(texte)) defauts.push(`${chemin} names Electron or Node.js Foundation`);
    if (!(cle(texte, "Label") ?? "").startsWith(IDENTIFIANT)) defauts.push(`${chemin}: Label outside ${IDENTIFIANT}`);
  }
  // Les clés de déclaration de fond des Info.plist (SMAuthorizedClients, SMPrivilegedExecutables) ne citent ni Electron ni Node.js.
  for (const chemin of fichiers(join(paquet, "Contents")).filter((f) => f.endsWith("/Info.plist") && sansApp(f))) {
    const xml = readFileSync(chemin, "utf8");
    if (/<key>(SMAuthorizedClients|SMPrivilegedExecutables|SMLoginItemBundleIdentifier)<\/key>[\s\S]*?(electron|node\.js foundation)/i.test(xml)) defauts.push(`${chemin}: background declaration names Electron/Node.js Foundation`);
  }
  assert.deepEqual(defauts, []);
});

test("the app source registers its background items (launchd labels, login item) under Brigade names only", { skip: PAQUETS }, () => {
  const defauts: string[] = [];
  for (const chemin of fichiers(SRC).filter((f) => /\.(ts|js|cjs|mjs)$/.test(f))) {
    const lignes = readFileSync(chemin, "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      if (/LaunchAgents|setLoginItemSettings|SMAppService|launchctl/.test(ligne) && /electron|node\.js foundation/i.test(ligne)) defauts.push(`${chemin}:${i + 1}`);
    });
  }
  assert.deepEqual(defauts, []);
});
