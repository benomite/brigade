// Test d'acceptation gelé (#4265). Critère 2 : le `node` porté ne garde ni le nom de Node.js Foundation ni son identité de signature : il est renommé et signé avec l'identité de Brigade de la config de paquetage.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler, construire, IDENTIFIANT } from "../../packaging/construire.ts";
import { PAQUETS } from "../aides/posix.ts";

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
const cle = (xml: string, name: string) => new RegExp(`<key>${name}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
const fichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : e.isFile() ? [join(dossier, e.name)] : []));
const sansApp = (chemin: string) => !/\/Resources\/(app|runtime)\//.test(chemin);

test("the bundled node executable is renamed and signed with the Brigade identity and a Brigade identifier", { skip: PAQUETS }, (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const nodes = fichiers(join(paquet, "Contents", "Resources")).filter((f) => sansApp(f) && readFileSync(f).subarray(0, 4).equals(MACH_O.subarray(0, 4)));
  assert.equal(nodes.length, 1, `one bundled executable under Resources/, got ${nodes.join(", ")}`);
  assert.doesNotMatch(nodes[0]!.split("/").pop()!, /^node$/i, "the bundled node keeps the plain 'node' name");

  const identity = "Developer ID Application: Brigade (ABCDE12345)";
  const calls: string[][] = [];
  const executer = (command: string, args: readonly string[]) => {
    if (command === "codesign") calls.push([...args]);
    return { status: 0, stdout: "", stderr: "" };
  };
  const atelier = join(racine, "atelier");
  const { electron, node } = { electron: join(racine, "Electron.app"), node: join(racine, "node") };
  construire({ version: "1.0.0", electron, node, ...AUTOUR(racine), sortie: join(racine, "sortie"), atelier, executer, identite: identity });
  const name = nodes[0]!.split("/").pop()!;
  const signes = calls.filter((a) => a.some((x) => x.endsWith(`/${name}`)));
  assert.ok(signes.length > 0, "the bundled node is signed on its own");
  for (const call of signes) {
    assert.equal(call[call.indexOf("--sign") + 1], identity, "signed with the Brigade identity");
    const i = call.indexOf("--identifier");
    assert.ok(i >= 0 && call[i + 1]!.startsWith(IDENTIFIANT), "signed under a Brigade identifier, not 'node'");
  }
});
