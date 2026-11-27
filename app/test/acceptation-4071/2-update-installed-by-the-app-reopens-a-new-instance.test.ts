// Test d'acceptation gelé (#4071). Critère 2 : après une mise à jour posée par l'app, la réouverture montre la fenêtre — l'installeur
// rouvre le paquet en nouvelle instance, car l'icône de fond du même paquet tourne et avalerait un simple `open`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { commandOfInstallation } from "../../src/update/installation.ts";
import { PACKAGES } from "../helpers/posix.ts";

const executable = (path: string, body: string) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

test("the installer reopens the new app as a new instance, so a running icon process of the same bundle does not swallow the open", { skip: PACKAGES }, (t) => {
  const root = repertoireTemporaire(t);
  const pkg = join(root, "Applications", "Brigade.app");
  mkdirSync(join(pkg, "Contents"), { recursive: true });
  writeFileSync(join(pkg, "Contents", "version"), "1.0.0");
  const volume = join(root, "volume");
  mkdirSync(join(volume, "Brigade.app", "Contents"), { recursive: true });
  writeFileSync(join(volume, "Brigade.app", "Contents", "version"), "1.1.0");
  const folder = join(root, "mise-a-jour");
  mkdirSync(folder);
  const dmg = join(folder, "Brigade-1.1.0-arm64.dmg");
  writeFileSync(dmg, "un dmg");
  const tools = join(root, "outils");
  mkdirSync(tools);
  const calls = join(root, "appels");
  writeFileSync(calls, "");
  const note = `echo "$(basename "$0") $*" >> '${calls}'`;
  executable(join(tools, "hdiutil"), `${note}\ncase "$1" in\n  attach) cp -R '${volume}/.' "$6/" ;;\n  detach) rm -rf "$2"/* ;;\nesac`);
  executable(join(tools, "codesign"), `${note}\ncase "$1" in\n  --verify) exit 0 ;;\n  -dv) echo "TeamIdentifier=ABCDE12345" >&2 ;;\nesac`);
  executable(join(tools, "ditto"), `${note}\ncp -R "$1" "$2"`);
  executable(join(tools, "open"), note);
  const env = { ...process.env, BRIGADE_HDIUTIL: join(tools, "hdiutil"), BRIGADE_CODESIGN: join(tools, "codesign"), BRIGADE_DITTO: join(tools, "ditto"), BRIGADE_OPEN: join(tools, "open"), TMPDIR: root };
  const pidDead = spawnSync("true").pid ?? assert.fail("no pid");
  const { commande: command, args, env: envInstaller } = commandOfInstallation({ pid: pidDead, dmg, paquet: pkg, dossier: folder, env });
  const finished = spawnSync(command, args, { env: envInstaller, encoding: "utf8" });
  assert.equal(finished.status, 0, finished.stderr);
  assert.equal(readFileSync(join(pkg, "Contents", "version"), "utf8"), "1.1.0", "the new version is in place");
  const openings = readFileSync(calls, "utf8").trim().split("\n").filter((l) => l.startsWith("open "));
  assert.equal(openings.length, 1, "the app is reopened once");
  assert.match(openings[0] ?? "", /^open (-\w*n\w* |--new )/, `reopened with 'open -n', got: ${openings[0]}`);
  assert.ok((openings[0] ?? "").endsWith(pkg), "and it opens the installed bundle");
  assert.deepEqual(readdirSync(join(root, "Applications")), ["Brigade.app"]);
});
