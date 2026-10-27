import assert from "node:assert/strict";
import { test } from "node:test";
import { globSync } from "node:fs";
import { delimiter, join } from "node:path";
import { linuxOnly, macOnly, posixOnly, seulementSur, windowsOnly } from "./plateforme.ts";
import { environnement, fichiersDeTest, part } from "./windows.ts";

test("a Linux-only test is skipped on win32 and darwin, with its reason", () => {
  assert.equal(linuxOnly("requires POSIX permissions", "linux"), false);
  assert.equal(linuxOnly("requires POSIX permissions", "win32"), "skipped on win32: requires POSIX permissions");
  assert.equal(linuxOnly("needs /proc", "darwin"), "skipped on darwin: needs /proc");
});

test("a macOS-only test is skipped on linux and win32", () => {
  assert.equal(macOnly("needs launchd", "darwin"), false);
  assert.equal(macOnly("needs launchd", "linux"), "skipped on linux: needs launchd");
  assert.equal(macOnly("needs launchd", "win32"), "skipped on win32: needs launchd");
});

test("a Windows-only test is skipped on linux and darwin", () => {
  assert.equal(windowsOnly("reads Windows ACLs", "win32"), false);
  assert.equal(windowsOnly("reads Windows ACLs", "linux"), "skipped on linux: reads Windows ACLs");
  assert.equal(windowsOnly("reads Windows ACLs", "darwin"), "skipped on darwin: reads Windows ACLs");
});

test("a POSIX-only test plays on linux and darwin, not on win32", () => {
  assert.equal(posixOnly("x", "linux"), false);
  assert.equal(posixOnly("x", "darwin"), false);
  assert.equal(posixOnly("requires POSIX permissions", "win32"), "skipped on win32: requires POSIX permissions");
});

test("the guard follows the real platform by default", () => {
  assert.equal(seulementSur([process.platform], "x"), false);
  assert.equal(seulementSur([], "x"), `skipped on ${process.platform}: x`);
});

test("the Windows job plays every test file of the runtime, none set aside", () => {
  const tous = fichiersDeTest();
  assert.ok(tous.includes("test/support/plateforme.test.ts"));
  assert.ok(tous.includes("test/bascule/bascule.test.ts"));
  assert.deepEqual(tous, [...tous].sort());
  assert.equal(tous.length, globSync("test/**/*.test.ts", { cwd: join(import.meta.dirname, "../..") }).length);
});

test("the Windows job's parts together play every test file, each exactly once", () => {
  const tous = fichiersDeTest();
  const parts = [1, 2, 3, 4].map((i) => part(tous, `${i}/4`));
  assert.deepEqual(parts.flat().sort(), tous);
  assert.equal(new Set(parts.flat()).size, tous.length);
  for (const fichiers of parts) assert.ok(fichiers.length >= Math.floor(tous.length / 4), `${fichiers.length} of ${tous.length}`);
  assert.deepEqual(part(["a", "b", "c"], "1/1"), ["a", "b", "c"]);
  for (const demande of ["", "0/4", "5/4", "2", "1/0", "a/b"]) assert.throws(() => part(tous, demande), /expected <i>\/<n>/, demande);
});

test("the Windows job puts git's tools first in the PATH, under the case the variable already has", () => {
  const surWindows = environnement({ Path: "C:\\Windows", NODE_COMPILE_CACHE: "cache" }, "C:\\Git\\libexec\\git-core");
  assert.equal(surWindows.Path, `C:\\Git\\libexec\\git-core${delimiter}C:\\Windows`);
  assert.equal("PATH" in surWindows, false);
  assert.equal(environnement({ PATH: "/usr/bin", NODE_COMPILE_CACHE: "cache" }, undefined).PATH, "/usr/bin");
});
