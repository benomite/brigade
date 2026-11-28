// The app's bundle carries the kitchen's agent prompts (#4793): `runtime/src/kitchen/agents.ts` reads them from
// `<runtime>/agents/kitchen/`, and without them the Mac kitchen launched no agent (ENOENT cook.md).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AGENTS, assembler } from "../../packaging/construire.ts";

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
const plist = (name: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleDisplayName</key>\n\t<string>${name}</string>\n\t<key>CFBundleExecutable</key>\n\t<string>${name}</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>\n\t<key>CFBundleName</key>\n\t<string>${name}</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>44.7.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>44.7.0</string>\n</dict>\n</plist>\n`;

test("the Mac bundle carries every prompt of agents/kitchen/ beside its runtime", (t) => {
  const root = mkdtempSync(join(tmpdir(), "brigade-4793-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const content = join(root, "Electron.app", "Contents");
  mkdirSync(join(content, "MacOS"), { recursive: true });
  mkdirSync(join(content, "Resources"), { recursive: true });
  writeFileSync(join(content, "Info.plist"), plist("Electron"));
  writeFileSync(join(content, "MacOS", "Electron"), MACH_O);
  for (const suffix of ["", " (GPU)", " (Renderer)", " (Plugin)"]) {
    const help = join(content, "Frameworks", `Electron Helper${suffix}.app`, "Contents");
    mkdirSync(join(help, "MacOS"), { recursive: true });
    writeFileSync(join(help, "Info.plist"), plist(`Electron Helper${suffix}`));
    writeFileSync(join(help, "MacOS", `Electron Helper${suffix}`), MACH_O);
  }
  writeFileSync(join(root, "node"), MACH_O);
  const pkg = assembler({ version: "1.0.0", electron: join(root, "Electron.app"), node: join(root, "node") }, join(root, "volume"));

  const prompts = readdirSync(AGENTS).filter((name) => name.endsWith(".md"));
  assert.ok(prompts.includes("cook.md"), "the repository's agents/kitchen/ holds cook.md");
  for (const name of prompts) assert.ok(existsSync(join(pkg, "Contents", "Resources", "runtime", "agents", "kitchen", name)), `the bundle carries ${name}`);
});
