// Le rôle du second part avec l'app installée : le .dmg du Mac, l'installeur de Windows et l'AppImage Linux portent `src/` entier,
// donc `src/second/role.md`, là où le lancement du second le cherche (second/lancement.ts). L'app n'est pas une
// archive asar : `claude` lit ce fichier comme n'importe quel autre.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { APP, assembler as assembleForMac } from "../../packaging/construire.ts";
import { assembler as assembleForLinux } from "../../packaging/linux.ts";
import { assembler as assembleForWindows } from "../../packaging/windows.ts";
import { ROLE_OF_SECOND } from "../../src/second/launch.ts";
import { PACKAGES } from "../helpers/posix.ts";

// Où le rôle se range dans l'app : sous `src/`, comme dans le dépôt.
const IN_THE_APP = relative(APP, ROLE_OF_SECOND);

function folder(t: TestContext): string {
  const created = mkdtempSync(join(tmpdir(), "brigade-paquet-second-"));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
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
  assert.equal(IN_THE_APP, join("src", "second", "role.md"));
});

test("Brigade.app porte le rôle du second, tel qu'il est dans le dépôt", { skip: PACKAGES }, (t) => {
  const root = folder(t);
  const content = join(root, "Electron.app", "Contents");
  mkdirSync(join(content, "Resources"), { recursive: true });
  mkdirSync(join(content, "MacOS"), { recursive: true });
  writeFileSync(join(content, "MacOS", "Electron"), "");
  writeFileSync(join(content, "Info.plist"), PLIST);
  writeFileSync(join(root, "node"), "node");

  const pkg = assembleForMac({ version: "1.0.0", electron: join(root, "Electron.app"), node: join(root, "node") }, join(root, "volume"));

  assert.equal(readFileSync(join(pkg, "Contents", "Resources", "app", IN_THE_APP), "utf8"), readFileSync(ROLE_OF_SECOND, "utf8"));
});

test("l'app installée par l'installeur de Windows porte le rôle du second, tel qu'il est dans le dépôt", (t) => {
  const root = folder(t);
  mkdirSync(join(root, "electron", "resources"), { recursive: true });
  writeFileSync(join(root, "electron", "electron.exe"), "exe");
  writeFileSync(join(root, "node.exe"), "exe");

  const installedOne = assembleForWindows({ version: "1.0.0", electron: join(root, "electron"), node: join(root, "node.exe") }, join(root, "Brigade"));

  assert.equal(readFileSync(join(installedOne, "resources", "app", IN_THE_APP), "utf8"), readFileSync(ROLE_OF_SECOND, "utf8"));
});

test("l'AppImage Linux porte le rôle du second, tel qu'il est dans le dépôt", (t) => {
  const root = folder(t);
  mkdirSync(join(root, "electron", "resources"), { recursive: true });
  // Un ELF x86-64 : son en-tête suffit.
  const elf = Buffer.alloc(64);
  elf.write("\x7fELF", 0, "latin1");
  elf[4] = 2;
  elf[5] = 1;
  elf.writeUInt16LE(0x3e, 18);
  writeFileSync(join(root, "electron", "electron"), elf);
  writeFileSync(join(root, "node"), elf);
  writeFileSync(join(root, "pty.node"), elf);

  const appdir = assembleForLinux(
    { version: "1.0.0", electron: join(root, "electron"), node: join(root, "node"), pty: join(root, "pty.node"), executer: () => assert.fail("node-pty is given, nothing is compiled") },
    join(root, "Brigade.AppDir"),
  );

  assert.equal(readFileSync(join(appdir, "resources", "app", IN_THE_APP), "utf8"), readFileSync(ROLE_OF_SECOND, "utf8"));
});
