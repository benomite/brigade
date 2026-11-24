import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { poserLaCommande, type OptionsCommande } from "../src/commande-brigade.ts";

const options = (maison: string, plus: Partial<OptionsCommande> = {}): OptionsCommande => ({
  plateforme: "darwin", facon: "installee", maison, version: "1.2.3", runtime: "/App/Resources/runtime", node: "/App/Resources/node/bin/node", racine: "/h/station", chemin: "/usr/bin:/bin", ...plus,
});

test("the installed Mac app writes an executable `brigade` that runs the station's gesture", () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const fichier = poserLaCommande(options(maison));
  assert.equal(fichier, join(maison, ".local", "bin", "brigade"));
  const texte = readFileSync(fichier!, "utf8");
  assert.match(texte, /brigade-version: 1\.2\.3/);
  assert.match(texte, /'\/App\/Resources\/node\/bin\/node' src\/station\/geste\.ts "\$@"/);
  assert.match(texte, /BRIGADE_STATION_DIR='\/h\/station'/);
  assert.ok((statSync(fichier!).mode & 0o111) !== 0);
});

test("an update rewrites the command on the new version and the new runtime", () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  poserLaCommande(options(maison));
  const fichier = poserLaCommande(options(maison, { version: "2.0.0", runtime: "/Nouveau/runtime" }));
  const texte = readFileSync(fichier!, "utf8");
  assert.match(texte, /brigade-version: 2\.0\.0/);
  assert.match(texte, /cd '\/Nouveau\/runtime'/);
  assert.doesNotMatch(texte, /1\.2\.3/);
});

test("nothing is written from the repository or on another platform", () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  assert.equal(poserLaCommande(options(maison, { facon: "depot" })), undefined);
  assert.equal(poserLaCommande(options(maison, { plateforme: "linux" })), undefined);
  assert.throws(() => statSync(join(maison, ".local")));
});

test("a write that fails is told, and the app goes on", () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(maison, ".local"), "un fichier, pas un dossier");
  const dits: string[] = [];
  assert.equal(poserLaCommande(options(maison), (m) => dits.push(m)), undefined);
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /n'a pas pu être écrite/);
});

test("the command stops with 70 and says so when the app's runtime is gone", () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const fichier = poserLaCommande(options(maison, { runtime: join(maison, "absent") }));
  const r = spawnSync("/bin/sh", [fichier!], { encoding: "utf8" });
  assert.equal(r.status, 70);
  assert.match(r.stderr, /le runtime de l'app/);
});
