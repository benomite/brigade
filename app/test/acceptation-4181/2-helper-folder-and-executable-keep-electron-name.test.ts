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
const ligne = (cle: string, valeur: string) => `\t<key>${cle}</key>\n\t<string>${valeur}</string>\n`;
const plist = (lignes: string) => `${entete}${lignes}</dict>\n</plist>\n`;
const appPlist = plist(ligne("CFBundleDisplayName", "Electron") + ligne("CFBundleExecutable", "Electron") + ligne("CFBundleIconFile", "electron.icns") + ligne("CFBundleIdentifier", "com.github.Electron") + ligne("CFBundleName", "Electron") + ligne("CFBundleShortVersionString", "44.7.0") + ligne("CFBundleVersion", "44.7.0"));

// Les plists d aide tels que ceux d Electron 44.7.0 : sans CFBundleDisplayName, avec un nom qui ne
// colle pas, ou sans aucune des deux clés dans la forme attendue.
const aidePlist = (suffixe: string, cas: number) => {
  const nom = `Electron Helper${suffixe}`;
  const id = ligne("CFBundleIdentifier", `com.github.Electron.helper${suffixe === "" ? "" : ".GPU"}`);
  const reste = ligne("CFBundleExecutable", nom) + id + ligne("CFBundleShortVersionString", "44.7.0") + ligne("CFBundleVersion", "44.7.0");
  if (cas === 0) return plist(ligne("CFBundleName", nom) + reste);
  if (cas === 1) return plist(ligne("CFBundleDisplayName", "Electron Helper") + ligne("CFBundleName", nom) + reste);
  return plist(ligne("CFBundleDisplayName", "Helper") + ligne("CFBundleName", "Helper") + reste);
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
