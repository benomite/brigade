import assert from "node:assert/strict";
import { test } from "node:test";
import { linuxOnly, macOnly, posixOnly, seulementSur, windowsOnly } from "./plateforme.ts";
import { lireListe, partager } from "./windows.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("the pending list splits the test files and refuses a stale entry", (t) => {
  const tous = ["test/a.test.ts", "test/b.test.ts", "test/c/d.test.ts"];
  const liste = { raison: "pending Windows port", fichiers: ["test/b.test.ts"] };
  assert.deepEqual(partager(tous, liste), { joues: ["test/a.test.ts", "test/c/d.test.ts"], sautes: ["test/b.test.ts"] });
  assert.throws(() => partager(tous, { ...liste, fichiers: ["test/gone.test.ts"] }), /do not exist: test\/gone\.test\.ts/);
  const dossier = mkdtempSync(join(tmpdir(), "liste-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const chemin = join(dossier, "liste.json");
  writeFileSync(chemin, JSON.stringify(liste));
  assert.deepEqual(lireListe(chemin), liste);
  writeFileSync(chemin, "{}");
  assert.throws(() => lireListe(chemin), /expected/);
});

test("the versioned pending list is well-formed and names existing tests", () => {
  const liste = lireListe(join(import.meta.dirname, "pas-encore-porte-sous-windows.json"));
  assert.equal(liste.raison, "pending Windows port");
  for (const f of liste.fichiers) assert.match(f, /^test\/.+\.test\.ts$/);
});
