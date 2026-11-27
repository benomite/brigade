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
const plist = (keys: Record<string, string>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${Object.entries(keys)
    .map(([k, v]) => `\t<key>${k}</key>\n\t<string>${v}</string>\n`)
    .join("")}</dict>\n</plist>\n`;

const AUXILIARY: Record<string, Record<string, string>> = {
  "Electron Helper": { CFBundleName: "Electron Helper" },
  "Electron Helper (GPU)": { CFBundleDisplayName: "Electron Helper (GPU)" },
  "Electron Helper (Renderer)": { CFBundleName: "Electron Helper", CFBundleDisplayName: "Electron Helper (Renderer)" },
  "Electron Helper (Plugin)": {},
};

test("assembler then the plist check rename every helper folder and executable to Brigade Helper", (t) => {
  const root = mkdtempSync(join(tmpdir(), "brigade-4182-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const content = join(root, "Electron.app", "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  writeFileSync(
    join(content, "Info.plist"),
    plist({ CFBundleName: "Electron", CFBundleDisplayName: "Electron", CFBundleIdentifier: "com.github.Electron", CFBundleIconFile: "electron.icns", CFBundleShortVersionString: "44.7.0", CFBundleVersion: "44.7.0" }),
  );
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O);
  writeFileSync(join(content, "Resources", "electron.icns"), "icns");
  for (const [name, keys] of Object.entries(AUXILIARY)) {
    const help = join(content, "Frameworks", `${name}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    writeFileSync(join(help, "Info.plist"), plist({ ...keys, CFBundleExecutable: name, CFBundleIdentifier: "com.github.Electron.helper" }));
    writeFileSync(join(help, "MacOS", name), MACH_O);
  }
  const node = join(root, "node");
  writeFileSync(node, MACH_O);

  const pkg = assembler({ version: "1.0.0", electron: join(root, "Electron.app"), node }, join(root, "volume"));

  assert.deepEqual(defautsDeNom(pkg), []);
  const frameworks = join(pkg, "Contents", "Frameworks");
  assert.deepEqual(readdirSync(frameworks).sort(), Object.keys(AUXILIARY).map((n) => `${n.replace(/^Electron/, "Brigade")}.app`).sort());
  for (const name of Object.keys(AUXILIARY).map((n) => n.replace(/^Electron/, "Brigade"))) assert.deepEqual(readdirSync(join(frameworks, `${name}.app`, "Contents", "MacOS")), [name]);
});
