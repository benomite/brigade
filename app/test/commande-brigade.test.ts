import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { poserLaCommande } from "../src/commande-brigade.ts";
type OptionsCommande = Parameters<typeof poserLaCommande>[0];
// La commande `brigade` est un script shell de l'app Mac et Linux : sous Windows, rien ne l'écrit ni ne l'exécute ainsi.
const SOUS_POSIX: string | false = process.platform === "win32" ? "writes and runs the POSIX shell `brigade` command of the Mac and Linux app, which Windows does not run" : false;

const options = (maison: string, plus: Partial<OptionsCommande> = {}): OptionsCommande => ({
  plateforme: "darwin", facon: "installee", maison, version: "1.2.3", runtime: "/App/Resources/runtime", node: "/App/Resources/node/bin/node", racine: "/h/station", chemin: "/usr/bin:/bin", ...plus,
});

test("the installed Mac app writes an executable `brigade` that runs the station's gesture", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const fichier = poserLaCommande(options(maison));
  assert.equal(fichier, join(maison, ".local", "bin", "brigade"));
  const texte = readFileSync(fichier!, "utf8");
  assert.match(texte, /brigade-version: 1\.2\.3/);
  assert.match(texte, /'\/App\/Resources\/node\/bin\/node' src\/station\/geste\.ts "\$@"/);
  assert.match(texte, /BRIGADE_STATION_DIR='\/h\/station'/);
  assert.ok((statSync(fichier!).mode & 0o111) !== 0);
});

test("an update rewrites the command on the new version and the new runtime", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  poserLaCommande(options(maison));
  const fichier = poserLaCommande(options(maison, { version: "2.0.0", runtime: "/Nouveau/runtime" }));
  const texte = readFileSync(fichier!, "utf8");
  assert.match(texte, /brigade-version: 2\.0\.0/);
  assert.match(texte, /cd '\/Nouveau\/runtime'/);
  assert.doesNotMatch(texte, /1\.2\.3/);
});

test("nothing is written from the repository or on another platform", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  assert.equal(poserLaCommande(options(maison, { facon: "depot" })), undefined);
  assert.equal(poserLaCommande(options(maison, { plateforme: "linux" })), undefined);
  assert.throws(() => statSync(join(maison, ".local")));
});

test("a write that fails is told, and the app goes on", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(maison, ".local"), "un fichier, pas un dossier");
  const dits: string[] = [];
  assert.equal(poserLaCommande(options(maison), (m) => dits.push(m)), undefined);
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /n'a pas pu être écrite/);
});

test("the command stops with 70 and says so when the app's runtime is gone", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const fichier = poserLaCommande(options(maison, { runtime: join(maison, "absent") }));
  const r = spawnSync("/bin/sh", [fichier!], { encoding: "utf8" });
  assert.equal(r.status, 70);
  assert.match(r.stderr, /le runtime de l'app/);
});

test("a new terminal on a default PATH finds `brigade`, with no step from the chef", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  poserLaCommande(options(maison));
  poserLaCommande(options(maison));
  const profil = readFileSync(join(maison, ".zprofile"), "utf8");
  assert.equal(profil.split("installer-station.sh").length, 2, "the line is written once");
  const r = spawnSync("/bin/sh", ["-c", `. "$HOME/.zprofile"; command -v brigade`], { encoding: "utf8", env: { HOME: maison, PATH: "/usr/bin:/bin" } });
  assert.equal(r.stdout.trim(), join(maison, ".local", "bin", "brigade"));
});

test("the shell files of the chef keep their text, a missing bash profile is not created, and the station installer's line is not doubled", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(maison, ".zprofile"), "export A=1");
  poserLaCommande(options(maison));
  assert.match(readFileSync(join(maison, ".zprofile"), "utf8"), /^export A=1\n\nexport PATH="\$HOME\/\.local\/bin:\$PATH" # la commande brigade \(installer-station\.sh\)\n$/);
  assert.throws(() => statSync(join(maison, ".bash_profile")));
  writeFileSync(join(maison, ".bash_profile"), "x=1\n");
  const autre = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(autre, ".bash_profile"), "x=1\n");
  poserLaCommande(options(autre));
  assert.match(readFileSync(join(autre, ".bash_profile"), "utf8"), /^x=1\n\nexport PATH=.*installer-station\.sh\)\n$/);
  // The station installer already wrote its line: the app adds nothing.
  const ligne = readFileSync(join(maison, ".zprofile"), "utf8").trim().split("\n").at(-1)!;
  const deja = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(deja, ".bash_login"), `${ligne}\n`);
  poserLaCommande(options(deja));
  assert.equal(readFileSync(join(deja, ".bash_login"), "utf8"), `${ligne}\n`);
  assert.throws(() => statSync(join(deja, ".zprofile")));
});

test("the command runs the gesture with the app's node, a clean environment and the arguments", { skip: SOUS_POSIX }, () => {
  const maison = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const runtime = join(maison, "runtime");
  mkdirSync(join(runtime, "src", "station"), { recursive: true });
  const faux = join(maison, "node");
  writeFileSync(faux, '#!/bin/sh\necho "$@|$BRIGADE_STATION_DIR|$HOME|$PATH|$SECRET|$USER|$(pwd)"\n');
  chmodSync(faux, 0o755);
  const fichier = poserLaCommande(options(maison, { runtime, node: faux }));
  const r = spawnSync("/bin/sh", [fichier!, "proj", "waiting", "set", "7"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", SECRET: "x", USER: "chef" } });
  assert.equal(r.stdout.trim(), `src/station/geste.ts proj waiting set 7|/h/station|${maison}|/usr/bin:/bin||chef|${runtime}`);
});
