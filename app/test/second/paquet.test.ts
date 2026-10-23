// Le rôle du second part avec l'app installée : le .dmg du Mac et l'installeur de Windows portent `src/` entier,
// donc `src/second/role.md`, là où le lancement du second le cherche (second/lancement.ts). L'app n'est pas une
// archive asar : `claude` lit ce fichier comme n'importe quel autre.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { APP, assembler as assemblerPourMac } from "../../packaging/construire.ts";
import { assembler as assemblerPourWindows } from "../../packaging/windows.ts";
import { ROLE_DU_SECOND } from "../../src/second/lancement.ts";
import { PAQUETS } from "../aides/posix.ts";

// Où le rôle se range dans l'app : sous `src/`, comme dans le dépôt.
const DANS_L_APP = relative(APP, ROLE_DU_SECOND);

function dossier(t: TestContext): string {
  const cree = mkdtempSync(join(tmpdir(), "brigade-paquet-second-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Electron</string>
	<key>CFBundleIdentifier</key>
	<string>com.github.Electron</string>
	<key>CFBundleName</key>
	<string>Electron</string>
	<key>CFBundleShortVersionString</key>
	<string>44.7.0</string>
	<key>CFBundleVersion</key>
	<string>44.7.0</string>
</dict>
</plist>
`;

test("le rôle est sous app/src/second/, que les deux paquets portent", () => {
  assert.equal(DANS_L_APP, join("src", "second", "role.md"));
});

test("Brigade.app porte le rôle du second, tel qu'il est dans le dépôt", { skip: PAQUETS }, (t) => {
  const racine = dossier(t);
  const contenu = join(racine, "Electron.app", "Contents");
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  writeFileSync(join(contenu, "Info.plist"), PLIST);
  writeFileSync(join(racine, "node"), "node");

  const paquet = assemblerPourMac({ version: "1.0.0", electron: join(racine, "Electron.app"), node: join(racine, "node") }, join(racine, "volume"));

  assert.equal(readFileSync(join(paquet, "Contents", "Resources", "app", DANS_L_APP), "utf8"), readFileSync(ROLE_DU_SECOND, "utf8"));
});

test("l'app installée par l'installeur de Windows porte le rôle du second, tel qu'il est dans le dépôt", (t) => {
  const racine = dossier(t);
  mkdirSync(join(racine, "electron", "resources"), { recursive: true });
  writeFileSync(join(racine, "electron", "electron.exe"), "exe");
  writeFileSync(join(racine, "node.exe"), "exe");

  const installee = assemblerPourWindows({ version: "1.0.0", electron: join(racine, "electron"), node: join(racine, "node.exe") }, join(racine, "Brigade"));

  assert.equal(readFileSync(join(installee, "resources", "app", DANS_L_APP), "utf8"), readFileSync(ROLE_DU_SECOND, "utf8"));
});
