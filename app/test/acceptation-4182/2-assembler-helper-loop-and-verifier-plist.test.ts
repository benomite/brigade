// Test d'acceptation gelé (#4182). Critère 2 : `assembler` (sa boucle sur les auxiliaires) puis `verifier-plist.ts` tournent
// sur une mise en page d'Electron aux plists variés ; aucun dossier ni exécutable d'auxiliaire n'est renommé.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assembler } from "../../packaging/construire.ts";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const plist = (cles: Record<string, string>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${Object.entries(cles)
    .map(([k, v]) => `\t<key>${k}</key>\n\t<string>${v}</string>\n`)
    .join("")}</dict>\n</plist>\n`;

const AUXILIAIRES: Record<string, Record<string, string>> = {
  "Electron Helper": { CFBundleName: "Electron Helper" },
  "Electron Helper (GPU)": { CFBundleDisplayName: "Electron Helper (GPU)" },
  "Electron Helper (Renderer)": { CFBundleName: "Electron Helper", CFBundleDisplayName: "Electron Helper (Renderer)" },
  "Electron Helper (Plugin)": {},
};

test("assembler then the plist check rename every helper folder and executable to Brigade Helper", (t) => {
  const racine = mkdtempSync(join(tmpdir(), "brigade-4182-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const contenu = join(racine, "Electron.app", "Contents");
  mkdirSync(join(contenu, "MacOS"), { recursive: true });
  mkdirSync(join(contenu, "Resources"), { recursive: true });
  writeFileSync(
    join(contenu, "Info.plist"),
    plist({ CFBundleName: "Electron", CFBundleDisplayName: "Electron", CFBundleIdentifier: "com.github.Electron", CFBundleIconFile: "electron.icns", CFBundleShortVersionString: "44.7.0", CFBundleVersion: "44.7.0" }),
  );
  writeFileSync(join(contenu, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(contenu, "Resources", "electron.icns"), "icns");
  for (const [nom, cles] of Object.entries(AUXILIAIRES)) {
    const aide = join(contenu, "Frameworks", `${nom}.app`, "Contents");
    mkdirSync(join(aide, "MacOS"), { recursive: true });
    writeFileSync(join(aide, "Info.plist"), plist({ ...cles, CFBundleExecutable: nom, CFBundleIdentifier: "com.github.Electron.helper" }));
    writeFileSync(join(aide, "MacOS", nom), MACH_O);
  }
  const node = join(racine, "node");
  writeFileSync(node, MACH_O);

  const paquet = assembler({ version: "1.0.0", electron: join(racine, "Electron.app"), node }, join(racine, "volume"));

  assert.deepEqual(defautsDeNom(paquet), []);
  const frameworks = join(paquet, "Contents", "Frameworks");
  assert.deepEqual(readdirSync(frameworks).sort(), Object.keys(AUXILIAIRES).map((n) => `${n.replace(/^Electron/, "Brigade")}.app`).sort());
  for (const nom of Object.keys(AUXILIAIRES).map((n) => n.replace(/^Electron/, "Brigade"))) assert.deepEqual(readdirSync(join(frameworks, `${nom}.app`, "Contents", "MacOS")), [nom]);
});
