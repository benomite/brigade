// Test d'acceptation gelé (#4071). Critère 2 : après une mise à jour posée par l'app, la réouverture montre la fenêtre — l'installeur
// rouvre le paquet en nouvelle instance, car l'icône de fond du même paquet tourne et avalerait un simple `open`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { commandDInstallation } from "../../src/update/installation.ts";
import { PAQUETS } from "../aides/posix.ts";

const executable = (chemin: string, corps: string) => {
  writeFileSync(chemin, `#!/bin/sh\n${corps}\n`);
  chmodSync(chemin, 0o755);
};

test("the installer reopens the new app as a new instance, so a running icon process of the same bundle does not swallow the open", { skip: PAQUETS }, (t) => {
  const racine = repertoireTemporaire(t);
  const paquet = join(racine, "Applications", "Brigade.app");
  mkdirSync(join(paquet, "Contents"), { recursive: true });
  writeFileSync(join(paquet, "Contents", "version"), "1.0.0");
  const volume = join(racine, "volume");
  mkdirSync(join(volume, "Brigade.app", "Contents"), { recursive: true });
  writeFileSync(join(volume, "Brigade.app", "Contents", "version"), "1.1.0");
  const dossier = join(racine, "mise-a-jour");
  mkdirSync(dossier);
  const dmg = join(dossier, "Brigade-1.1.0-arm64.dmg");
  writeFileSync(dmg, "un dmg");
  const tools = join(racine, "outils");
  mkdirSync(tools);
  const calls = join(racine, "appels");
  writeFileSync(calls, "");
  const noter = `echo "$(basename "$0") $*" >> '${calls}'`;
  executable(join(tools, "hdiutil"), `${noter}\ncase "$1" in\n  attach) cp -R '${volume}/.' "$6/" ;;\n  detach) rm -rf "$2"/* ;;\nesac`);
  executable(join(tools, "codesign"), `${noter}\ncase "$1" in\n  --verify) exit 0 ;;\n  -dv) echo "TeamIdentifier=ABCDE12345" >&2 ;;\nesac`);
  executable(join(tools, "ditto"), `${noter}\ncp -R "$1" "$2"`);
  executable(join(tools, "open"), noter);
  const env = { ...process.env, BRIGADE_HDIUTIL: join(tools, "hdiutil"), BRIGADE_CODESIGN: join(tools, "codesign"), BRIGADE_DITTO: join(tools, "ditto"), BRIGADE_OPEN: join(tools, "open"), TMPDIR: racine };
  const pidMort = spawnSync("true").pid ?? assert.fail("no pid");
  const { commande: command, args, env: envInstalleur } = commandDInstallation({ pid: pidMort, dmg, paquet, dossier, env });
  const fini = spawnSync(command, args, { env: envInstalleur, encoding: "utf8" });
  assert.equal(fini.status, 0, fini.stderr);
  assert.equal(readFileSync(join(paquet, "Contents", "version"), "utf8"), "1.1.0", "the new version is in place");
  const ouvertures = readFileSync(calls, "utf8").trim().split("\n").filter((l) => l.startsWith("open "));
  assert.equal(ouvertures.length, 1, "the app is reopened once");
  assert.match(ouvertures[0] ?? "", /^open (-\w*n\w* |--new )/, `reopened with 'open -n', got: ${ouvertures[0]}`);
  assert.ok((ouvertures[0] ?? "").endsWith(paquet), "and it opens the installed bundle");
  assert.deepEqual(readdirSync(join(racine, "Applications")), ["Brigade.app"]);
});
