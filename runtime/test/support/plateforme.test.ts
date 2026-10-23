import assert from "node:assert/strict";
import { test } from "node:test";
import { linuxOnly, macOnly, posixOnly, seulementSur, windowsOnly } from "./plateforme.ts";

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
