import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTheCommand } from "../src/command-brigade.ts";
type OptionsCommand = Parameters<typeof setTheCommand>[0];
// La commande `brigade` est un script shell de l'app Mac et Linux : sous Windows, rien ne l'écrit ni ne l'exécute ainsi.
const UNDER_POSIX: string | false = process.platform === "win32" ? "writes and runs the POSIX shell `brigade` command of the Mac and Linux app, which Windows does not run" : false;

const options = (home: string, more: Partial<OptionsCommand> = {}): OptionsCommand => ({
  plateforme: "darwin", facon: "installee", maison: home, version: "1.2.3", runtime: "/App/Resources/runtime", node: "/App/Resources/node/bin/node", racine: "/h/station", chemin: "/usr/bin:/bin", ...more,
});

test("the installed Mac app writes an executable `brigade` that runs the station's gesture", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const file = setTheCommand(options(home));
  assert.equal(file, join(home, ".local", "bin", "brigade"));
  const text = readFileSync(file!, "utf8");
  assert.match(text, /brigade-version: 1\.2\.3/);
  assert.match(text, /'\/App\/Resources\/node\/bin\/node' src\/station\/geste\.ts "\$@"/);
  assert.match(text, /BRIGADE_STATION_DIR='\/h\/station'/);
  assert.ok((statSync(file!).mode & 0o111) !== 0);
});

test("an update rewrites the command on the new version and the new runtime", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  setTheCommand(options(home));
  const file = setTheCommand(options(home, { version: "2.0.0", runtime: "/Nouveau/runtime" }));
  const text = readFileSync(file!, "utf8");
  assert.match(text, /brigade-version: 2\.0\.0/);
  assert.match(text, /cd '\/Nouveau\/runtime'/);
  assert.doesNotMatch(text, /1\.2\.3/);
});

test("nothing is written from the repository or on another platform", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  assert.equal(setTheCommand(options(home, { facon: "depot" })), undefined);
  assert.equal(setTheCommand(options(home, { plateforme: "linux" })), undefined);
  assert.throws(() => statSync(join(home, ".local")));
});

test("a write that fails is told, and the app goes on", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(home, ".local"), "un fichier, pas un dossier");
  const saidOnes: string[] = [];
  assert.equal(setTheCommand(options(home), (m) => saidOnes.push(m)), undefined);
  assert.equal(saidOnes.length, 1);
  assert.match(saidOnes[0] ?? "", /n'a pas pu être écrite/);
});

test("the command stops with 70 and says so when the app's runtime is gone", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const file = setTheCommand(options(home, { runtime: join(home, "absent") }));
  const r = spawnSync("/bin/sh", [file!], { encoding: "utf8" });
  assert.equal(r.status, 70);
  assert.match(r.stderr, /le runtime de l'app/);
});

test("a new terminal on a default PATH finds `brigade`, with no step from the chef", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  setTheCommand(options(home));
  setTheCommand(options(home));
  const profile = readFileSync(join(home, ".zprofile"), "utf8");
  assert.equal(profile.split("installer-station.sh").length, 2, "the line is written once");
  const r = spawnSync("/bin/sh", ["-c", `. "$HOME/.zprofile"; command -v brigade`], { encoding: "utf8", env: { HOME: home, PATH: "/usr/bin:/bin" } });
  assert.equal(r.stdout.trim(), join(home, ".local", "bin", "brigade"));
});

test("the shell files of the chef keep their text, a missing bash profile is not created, and the station installer's line is not doubled", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(home, ".zprofile"), "export A=1");
  setTheCommand(options(home));
  assert.match(readFileSync(join(home, ".zprofile"), "utf8"), /^export A=1\n\nexport PATH="\$HOME\/\.local\/bin:\$PATH" # la commande brigade \(installer-station\.sh\)\n$/);
  assert.throws(() => statSync(join(home, ".bash_profile")));
  writeFileSync(join(home, ".bash_profile"), "x=1\n");
  const other = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(other, ".bash_profile"), "x=1\n");
  setTheCommand(options(other));
  assert.match(readFileSync(join(other, ".bash_profile"), "utf8"), /^x=1\n\nexport PATH=.*installer-station\.sh\)\n$/);
  // The station installer already wrote its line: the app adds nothing.
  const line = readFileSync(join(home, ".zprofile"), "utf8").trim().split("\n").at(-1)!;
  const already = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  writeFileSync(join(already, ".bash_login"), `${line}\n`);
  setTheCommand(options(already));
  assert.equal(readFileSync(join(already, ".bash_login"), "utf8"), `${line}\n`);
  assert.throws(() => statSync(join(already, ".zprofile")));
});

test("the command runs the gesture with the app's node, a clean environment and the arguments", { skip: UNDER_POSIX }, () => {
  const home = mkdtempSync(join(tmpdir(), "brigade-cmd-"));
  const runtime = join(home, "runtime");
  mkdirSync(join(runtime, "src", "station"), { recursive: true });
  const fake = join(home, "node");
  writeFileSync(fake, '#!/bin/sh\necho "$@|$BRIGADE_STATION_DIR|$HOME|$PATH|$SECRET|$USER|$(pwd)"\n');
  chmodSync(fake, 0o755);
  const file = setTheCommand(options(home, { runtime, node: fake }));
  const r = spawnSync("/bin/sh", [file!, "proj", "rail", "--all"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", SECRET: "x", USER: "chef" } });
  assert.equal(r.stdout.trim(), `src/station/geste.ts proj rail --all|/h/station|${home}|/usr/bin:/bin||chef|${runtime}`);
});
