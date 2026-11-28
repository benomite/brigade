// Test d acceptation gelé (#4181). Critère 2 : le dossier et l exécutable des auxiliaires gardent le nom d Electron.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const header = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n`;
const line = (key: string, value: string) => `\t<key>${key}</key>\n\t<string>${value}</string>\n`;
const plist = (lines: string) => `${header}${lines}</dict>\n</plist>\n`;
const appPlist = plist(line("CFBundleDisplayName", "Electron") + line("CFBundleExecutable", "Electron") + line("CFBundleIconFile", "electron.icns") + line("CFBundleIdentifier", "com.github.Electron") + line("CFBundleName", "Electron") + line("CFBundleShortVersionString", "44.7.0") + line("CFBundleVersion", "44.7.0"));

// Les plists d aide tels que ceux d Electron 44.7.0 : sans CFBundleDisplayName, avec un nom qui ne
// colle pas, ou sans aucune des deux clés dans la forme attendue.
const helpPlist = (suffix: string, theCase: number) => {
  const name = `Electron Helper${suffix}`;
  const id = line("CFBundleIdentifier", `com.github.Electron.helper${suffix === "" ? "" : ".GPU"}`);
  const remains = line("CFBundleExecutable", name) + id + line("CFBundleShortVersionString", "44.7.0") + line("CFBundleVersion", "44.7.0");
  if (theCase === 0) return plist(line("CFBundleName", name) + remains);
  if (theCase === 1) return plist(line("CFBundleDisplayName", "Electron Helper") + line("CFBundleName", name) + remains);
  return plist(line("CFBundleDisplayName", "Helper") + line("CFBundleName", "Helper") + remains);
};

function built(): { racine: string; paquet: string } {
  const root = mkdtempSync(join(tmpdir(), "brigade-4181-"));
  const electron = join(root, "Electron.app");
  const content = join(electron, "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), appPlist);
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(content, "Resources", "electron.icns"), "icns-electron");
  [" (GPU)", " (Renderer)", ""].forEach((suffix, theCase) => {
    const help = join(content, "Frameworks", `Electron Helper${suffix}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    writeFileSync(join(help, "Info.plist"), helpPlist(suffix, theCase));
    writeFileSync(join(help, "MacOS", `Electron Helper${suffix}`), MACH_O);
  });
  const node = join(root, "node");
  writeFileSync(node, MACH_O);
  return { racine: root, paquet: assembler({ version: "1.0.0", electron, node }, join(root, "volume")) };
}

test("les dossiers et exécutables des auxiliaires prennent le nom de Brigade", (t) => {
  const { racine: root, paquet: pkg } = built();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const frameworks = join(pkg, "Contents", "Frameworks");
  assert.deepEqual(readdirSync(frameworks).sort(), ["Brigade Helper (GPU).app", "Brigade Helper (Renderer).app", "Brigade Helper.app"]);
  for (const suffix of [" (GPU)", " (Renderer)", ""])
    assert.ok(existsSync(join(frameworks, `Brigade Helper${suffix}.app`, "Contents", "MacOS", `Brigade Helper${suffix}`)));
});
