import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nomDeLAppImage } from "../../../app/packaging/linux.ts";
import { lireMetadonnees } from "../../../app/src/mise-a-jour/flux.ts";
import { fichiers, notes, paquetsDeLApp, paquetsDeLaStation, renommer } from "../paquets.ts";

const script = fileURLToPath(new URL("../paquets.ts", import.meta.url));

test("every package name includes its platform", () => {
  for (const p of [...paquetsDeLApp("1.2.3", false), ...paquetsDeLaStation()]) {
    if (p.nom === "installer-station.sh" || p.nom === "installer-station.ps1") continue; // named by the install commands everybody copies
    assert.match(p.nom.toLowerCase(), new RegExp(p.plateforme.toLowerCase()), p.nom);
  }
});

test("the unsigned app has a package for Mac, Windows, Linux and Android; the signed one has no .apk", () => {
  assert.deepEqual(paquetsDeLApp("1.2.3", false).map((p) => p.plateforme), ["Mac", "Windows", "Linux", "Android"]);
  assert.deepEqual(paquetsDeLApp("1.2.3", true).map((p) => p.plateforme), ["Mac", "Windows", "Linux"]);
});

test("the Linux package is the AppImage, under the name app/packaging/linux.ts builds", () => {
  for (const signe of [false, true]) {
    const linux = paquetsDeLApp("1.2.3", signe).find((p) => p.plateforme === "Linux");
    assert.equal(linux?.nom, "brigade-1.2.3-linux-x64.AppImage");
    assert.equal(linux?.construit, nomDeLAppImage("1.2.3"));
  }
});

test("fichiers lists the release names of the app, for one platform or all", () => {
  assert.deepEqual(fichiers("1.2.3", false, "Linux"), ["brigade-1.2.3-linux-x64.AppImage"]);
  assert.deepEqual(fichiers("1.2.3", true), ["Brigade-1.2.3-mac-arm64.dmg", "Brigade-1.2.3-windows-x64-setup.exe", "brigade-1.2.3-linux-x64.AppImage"]);
  assert.deepEqual(fichiers("1.2.3", true, "Android"), []);
});

test("the fichiers command prints one name per line, and refuses an unknown platform", () => {
  assert.equal(execFileSync("node", [script, "fichiers", "--version", "1.2.3", "--plateforme", "Linux"], { encoding: "utf8" }), "brigade-1.2.3-linux-x64.AppImage\n");
  const inconnue = spawnSync("node", [script, "fichiers", "--version", "1.2.3", "--plateforme", "linux"], { encoding: "utf8" });
  assert.equal(inconnue.status, 2);
  assert.match(inconnue.stderr, /paquets\.ts fichiers --version <v> \[--plateforme Mac\|Windows\|Linux\|Android\]/);
  assert.equal(inconnue.stdout, "");
});

test("the app notes list each package with its platform and its steps", () => {
  const texte = notes({ produit: "app", version: "1.2.3", signe: false, commit: "abc123" });
  assert.match(texte, /built from the commit abc123/);
  assert.match(texte, /\| `Brigade-1\.2\.3-mac-arm64\.dmg` \| Mac \|.*Gatekeeper.*right-click/);
  assert.match(texte, /\| `Brigade-1\.2\.3-windows-x64-setup\.exe` \| Windows \|.*SmartScreen.*More info.*Run anyway/);
  assert.match(texte, /\| `Brigade-1\.2\.3-android\.apk` \| Android \|/);
  assert.match(texte, /unsigned/);
});

test("the app notes list the Linux AppImage with the executable bit, signed or not", () => {
  for (const signe of [false, true]) {
    const texte = notes({ produit: "app", version: "1.2.3", signe });
    assert.match(texte, /\| `brigade-1\.2\.3-linux-x64\.AppImage` \| Linux \| App, AppImage \(x64\) \| .*chmod \+x brigade-1\.2\.3-linux-x64\.AppImage.*--appimage-extract-and-run/);
  }
  assert.match(notes({ produit: "app", version: "1.2.3", signe: true }), /the Linux AppImage, which is not signed/);
});

test("the station notes list its Linux packages, its macOS and Windows runtimes, and the executable bit", () => {
  const texte = notes({ produit: "station", version: "0.1.0" });
  assert.match(texte, /\| `brigade-station-linux-amd64\.deb` \| Linux \|/);
  assert.match(texte, /\| `brigade-station-mac\.tar\.gz` \| Mac \|.*without sudo/);
  assert.match(texte, /\| `installer-station\.sh` \| Linux \|.*chmod \+x/);
  assert.match(texte, /\| `installer-station\.ps1` \| Windows \|.*irm <its address> \\\| iex/);
  assert.match(texte, /\| `brigade-station-windows\.zip` \| Windows \|/);
});

test("renaming gives the release names and keeps the updater files readable", () => {
  const dossier = mkdtempSync(join(tmpdir(), "paquets-"));
  const sha = "A".repeat(86) + "==";
  const yml = (nom: string) => `version: 1.2.3\nfiles:\n  - url: ${nom}\n    sha512: ${sha}\n    size: 10\npath: ${nom}\nsha512: ${sha}\nreleaseDate: '2026-01-01T00:00:00Z'\n`;
  writeFileSync(join(dossier, "Brigade-1.2.3-arm64.dmg"), "dmg");
  writeFileSync(join(dossier, "Brigade-1.2.3-x64-setup.exe"), "exe");
  writeFileSync(join(dossier, "latest-mac.yml"), yml("Brigade-1.2.3-arm64.dmg"));
  writeFileSync(join(dossier, "latest.yml"), yml("Brigade-1.2.3-x64-setup.exe"));
  renommer(dossier, "1.2.3");
  assert.deepEqual(readdirSync(dossier).sort(), ["Brigade-1.2.3-mac-arm64.dmg", "Brigade-1.2.3-windows-x64-setup.exe", "latest-mac.yml", "latest.yml"]);
  assert.equal(lireMetadonnees(readFileSync(join(dossier, "latest-mac.yml"), "utf8")).nom, "Brigade-1.2.3-mac-arm64.dmg");
  assert.equal(
    lireMetadonnees(readFileSync(join(dossier, "latest.yml"), "utf8"), { metadonnees: "latest.yml", extension: ".exe" }).nom,
    "Brigade-1.2.3-windows-x64-setup.exe",
  );
});

test("renaming keeps the AppImage under its name", () => {
  const dossier = mkdtempSync(join(tmpdir(), "paquets-"));
  writeFileSync(join(dossier, "brigade-1.2.3-linux-x64.AppImage"), "appimage");
  assert.deepEqual(renommer(dossier, "1.2.3"), ["brigade-1.2.3-linux-x64.AppImage"]);
  assert.deepEqual(readdirSync(dossier), ["brigade-1.2.3-linux-x64.AppImage"]);
});
