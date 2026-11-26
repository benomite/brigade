// The Windows shim of the preload (chemins.ts): a `URL.pathname` path loses the slash before its drive
// on Windows only, and `fs` then reads it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cheminLisible } from "./chemins.ts";

test("on Windows, the slash before the drive of a URL pathname is dropped, with either separator", () => {
  assert.equal(cheminLisible("/D:/a/brigade/runtime/src", "win32"), "D:/a/brigade/runtime/src");
  assert.equal(cheminLisible("\\D:\\a\\brigade\\runtime\\src\\x.ts", "win32"), "D:\\a\\brigade\\runtime\\src\\x.ts");
});

test("a Windows path that is already readable, and every path elsewhere, is left as is", () => {
  assert.equal(cheminLisible("D:\\a\\src", "win32"), "D:\\a\\src");
  assert.equal(cheminLisible("/home/a/src", "win32"), "/home/a/src");
  assert.equal(cheminLisible("/D:/a/src", "linux"), "/D:/a/src");
  assert.equal(cheminLisible(3, "win32"), 3);
});

// Off Windows, a folder named `D:` in the working directory stands for the drive: `/D:/…` is read there only once adapted.
test("once adapted for Windows, fs and its named imports read a URL pathname path", () => {
  const dossier = mkdtempSync(join(tmpdir(), "chemins-"));
  try {
    mkdirSync(join(dossier, "D:", "src"), { recursive: true });
    writeFileSync(join(dossier, "D:", "src", "x.ts"), "");
    const lire = (adapter: boolean): unknown => {
      const script = `import { adapterFs } from ${JSON.stringify(new URL("./chemins.ts", import.meta.url).href)};
${adapter ? 'adapterFs("win32");' : ""}
const { existsSync, readdirSync } = await import("node:fs");
console.log(JSON.stringify([existsSync("/D:/src/x.ts"), existsSync("/D:/src/x.ts") ? readdirSync("/D:/src") : null]));`;
      const sortie = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dossier, encoding: "utf8" });
      assert.equal(sortie.status, 0, sortie.stderr);
      return JSON.parse(sortie.stdout);
    };
    assert.deepEqual(lire(true), [true, ["x.ts"]]);
    assert.deepEqual(lire(false), [false, null]);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
