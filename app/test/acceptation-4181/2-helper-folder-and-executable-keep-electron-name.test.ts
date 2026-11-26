// Test d acceptation gelé (#4181). Critère 2 : le dossier et l exécutable des auxiliaires gardent le nom d Electron.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const entete = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n`;
const line = (cle: string, valeur: string) => `\t<key>${cle}</key>\n\t<string>${valeur}</string>\n`;
const plist = (lines: string) => `${entete}${lines}</dict>\n</plist>\n`;
const appPlist = plist(line("CFBundleDisplayName", "Electron") + line("CFBundleExecutable", "Electron") + line("CFBundleIconFile", "electron.icns") + line("CFBundleIdentifier", "com.github.Electron") + line("CFBundleName", "Electron") + line("CFBundleShortVersionString", "44.7.0") + line("CFBundleVersion", "44.7.0"));

// Les plists d aide tels que ceux d Electron 44.7.0 : sans CFBundleDisplayName, avec un nom qui ne
// colle pas, ou sans aucune des deux clés dans la forme attendue.
const aidePlist = (suffixe: string, cas: number) => {
  const name = `Electron Helper${suffixe}`;
  const id = line("CFBundleIdentifier", `com.github.Electron.helper${suffixe === "" ? "" : ".GPU"}`);
  const reste = line("CFBundleExecutable", name) + id + line("CFBundleShortVersionString", "44.7.0") + line("CFBundleVersion", "44.7.0");
  if (cas === 0) return plist(line("CFBundleName", name) + reste);
  if (cas === 1) return plist(line("CFBundleDisplayName", "Electron Helper") + line("CFBundleName", name) + reste);
  return plist(line("CFBundleDisplayName", "Helper") + line("CFBundleName", "Helper") + reste);
};

function construit(): { racine: string; paquet: string } {
  const racine = mkdtempSync(join(tmpdir(), "brigade-4181-"));
  const electron = join(racine, "Electron.app");
  const contenu = join(electron, "Contents");
  mkdirSync(join(contenu, "MacOS"), { recursive: true });
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  writeFileSync(join(contenu, "Info.plist"), appPlist);
  writeFileSync(join(contenu, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(contenu, "Resources", "electron.icns"), "icns-electron");
  [" (GPU)", " (Renderer)", ""].forEach((suffixe, cas) => {
    const aide = join(contenu, "Frameworks", `Electron Helper${suffixe}.app`, "Contents");
    mkdirSync(join(aide, "MacOS"), { recursive: true });
    writeFileSync(join(aide, "Info.plist"), aidePlist(suffixe, cas));
    writeFileSync(join(aide, "MacOS", `Electron Helper${suffixe}`), MACH_O);
  });
  const node = join(racine, "node");
  writeFileSync(node, MACH_O);
  return { racine, paquet: assembler({ version: "1.0.0", electron, node }, join(racine, "volume")) };
}

test("les dossiers et exécutables des auxiliaires prennent le nom de Brigade", (t) => {
  const { racine, paquet } = construit();
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const frameworks = join(paquet, "Contents", "Frameworks");
  assert.deepEqual(readdirSync(frameworks).sort(), ["Brigade Helper (GPU).app", "Brigade Helper (Renderer).app", "Brigade Helper.app"]);
  for (const suffixe of [" (GPU)", " (Renderer)", ""])
    assert.ok(existsSync(join(frameworks, `Brigade Helper${suffixe}.app`, "Contents", "MacOS", `Brigade Helper${suffixe}`)));
});
