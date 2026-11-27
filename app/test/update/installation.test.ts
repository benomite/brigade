// L'installeur de l'app installée (update/installation.ts) : il attend que l'app soit fermée,
// ouvre le .dmg, vérifie sa signature, met la nouvelle app à la place de l'ancienne et la rouvre —
// ou laisse l'ancienne intacte, dit pourquoi et la rouvre. Joué pour de vrai par `sh`, contre des
// doublures de `hdiutil`, `codesign`, `ditto` et `open` : ni Mac, ni .dmg.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { FAILURE } from "../../src/update/state.ts";
import { APP_OF_DMG, commandOfInstallation, installability, launchInstallation, packageOf } from "../../src/update/installation.ts";
import { PACKAGES } from "../helpers/posix.ts";

const executable = (path: string, body: string) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

// Une machine : l'app installée dans `Applications/`, en version 1.0.0 et signée par l'équipe
// `equipe`, le .dmg de la 1.1.0 (son contenu est dans `volume/`, que le faux `hdiutil` « monte »), et
// les doublures — chacune note ses appels dans `appels`.
function oneMachine(t: TestContext, settings: { equipe?: string; equipeNouvelle?: string; signatureValide?: boolean; montage?: boolean } = {}) {
  const root = repertoireTemporaire(t);
  const pkg = join(root, "Applications", "Brigade.app");
  mkdirSync(join(pkg, "Contents"), { recursive: true });
  writeFileSync(join(pkg, "Contents", "version"), "1.0.0");
  writeFileSync(join(pkg, "Contents", "equipe"), settings.equipe ?? "ABCDE12345");
  const volume = join(root, "volume");
  mkdirSync(join(volume, APP_OF_DMG, "Contents"), { recursive: true });
  writeFileSync(join(volume, APP_OF_DMG, "Contents", "version"), "1.1.0");
  writeFileSync(join(volume, APP_OF_DMG, "Contents", "equipe"), settings.equipeNouvelle ?? "ABCDE12345");
  const folder = join(root, "mise-a-jour");
  mkdirSync(folder);
  const dmg = join(folder, "Brigade-1.1.0-arm64.dmg");
  writeFileSync(dmg, "un dmg");
  const tools = join(root, "outils");
  mkdirSync(tools);
  const calls = join(root, "appels");
  writeFileSync(calls, "");
  const note = `echo "$(basename "$0") $*" >> '${calls}'`;
  executable(
    join(tools, "hdiutil"),
    `${note}
case "$1" in
  attach) ${settings.montage === false ? "exit 1" : `cp -R '${volume}/.' "$6/"`} ;;
  detach) rm -rf "$2"/* ;;
esac`,
  );
  executable(
    join(tools, "codesign"),
    `${note}
case "$1" in
  --verify) exit ${settings.signatureValide === false ? 1 : 0} ;;
  -dv) echo "TeamIdentifier=$(cat "$2/Contents/equipe")" >&2 ;;
esac`,
  );
  executable(join(tools, "ditto"), `${note}\ncp -R "$1" "$2"`);
  executable(join(tools, "open"), note);
  const env = { ...process.env, BRIGADE_HDIUTIL: join(tools, "hdiutil"), BRIGADE_CODESIGN: join(tools, "codesign"), BRIGADE_DITTO: join(tools, "ditto"), BRIGADE_OPEN: join(tools, "open"), TMPDIR: root };
  return {
    paquet: pkg,
    dossier: folder,
    dmg,
    env,
    version: () => readFileSync(join(pkg, "Contents", "version"), "utf8"),
    appels: () => readFileSync(calls, "utf8").trim().split("\n").filter(Boolean),
    echec: () => (existsSync(join(folder, FAILURE)) ? readFileSync(join(folder, FAILURE), "utf8").trim() : undefined),
    // Ce qui reste à côté de l'app : rien que l'app.
    applications: () => readdirSync(join(root, "Applications")),
  };
}

// Un pid qui ne tourne plus : celui d'un process fini.
const onePidDead = () => spawnSync("true").pid ?? assert.fail("no pid");

function installer(machine: ReturnType<typeof oneMachine>, pid = onePidDead()) {
  const { commande: command, args, env } = commandOfInstallation({ pid, dmg: machine.dmg, paquet: machine.paquet, dossier: machine.dossier, env: machine.env });
  return spawnSync(command, args, { env, encoding: "utf8" });
}

test("le paquet de l'app est celui de son Contents/Resources", { skip: PACKAGES }, () => {
  assert.equal(packageOf("/Applications/Brigade.app/Contents/Resources"), "/Applications/Brigade.app");
});

test("une app qui ne pourrait pas se remplacer là où elle est le dit", () => {
  const opened = () => {};
  assert.equal(installability("/Applications/Brigade.app", opened), undefined);
  assert.match(installability("/private/var/folders/x/AppTranslocation/1234/d/Brigade.app", opened) ?? "", /temporary copy: move Brigade to the Applications folder/);
  assert.match(installability("/Volumes/Brigade/Brigade.app", opened) ?? "", /from its disk image/);
  assert.match(installability("/repo/app/node_modules/electron/dist", opened) ?? "", /does not run from an app bundle/);
  const closes = (path: string) => {
    if (path === "/Applications") throw new Error("EACCES");
  };
  assert.equal(installability("/Applications/Brigade.app", closes), "this account cannot write to /Applications");
});

test("l'installeur met la nouvelle version à la place de l'app, range le .dmg et la rouvre", { skip: PACKAGES }, (t) => {
  const machine = oneMachine(t);
  const finished = installer(machine);
  assert.equal(finished.status, 0, finished.stderr);
  assert.equal(machine.version(), "1.1.0");
  assert.deepEqual(machine.applications(), ["Brigade.app"]);
  assert.equal(existsSync(machine.dmg), false);
  assert.equal(machine.echec(), undefined);
  const calls = machine.appels();
  assert.ok(calls.some((call) => call.startsWith(`codesign --verify --deep --strict `)));
  assert.equal(calls.at(-1), `open -n ${machine.paquet}`);
  assert.ok(calls.indexOf(calls.find((call) => call.startsWith("hdiutil detach")) ?? "") < calls.length - 1);
});

test("une app qui tourne sans développeur identifié (signée ad hoc) prend la version signée", { skip: PACKAGES }, (t) => {
  const machine = oneMachine(t, { equipe: "not set" });
  assert.equal(installer(machine).status, 0);
  assert.equal(machine.version(), "1.1.0");
});

for (const [theCase, settings, reason] of [
  ["une signature qui ne tient pas", { signatureValide: false }, "the new version is not correctly signed"],
  ["un autre développeur", { equipeNouvelle: "ZZZZZ99999" }, "the new version is not signed by the same developer as this one (ABCDE12345)"],
  ["un .dmg qui ne s'ouvre pas", { montage: false }, "the disk image of the new version could not be opened"],
] as const) {
  test(`${theCase} : l'app en place n'est pas touchée, la raison est écrite et l'ancienne est rouverte`, { skip: PACKAGES }, (t) => {
    const machine = oneMachine(t, settings);
    assert.equal(installer(machine).status, 1);
    assert.equal(machine.version(), "1.0.0");
    assert.deepEqual(machine.applications(), ["Brigade.app"]);
    assert.equal(machine.echec(), reason);
    assert.equal(existsSync(machine.dmg), false);
    assert.equal(machine.appels().at(-1), `open -n ${machine.paquet}`);
  });
}

test("l'installeur, détaché, attend que l'app soit fermée avant de rien toucher", { skip: PACKAGES }, async (t) => {
  const machine = oneMachine(t);
  // L'app qui tourne : un process qui attend qu'on le ferme.
  const app = spawn("sh", ["-c", "read ligne"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const closedOne = new Promise((resolve) => app.once("exit", resolve));
  launchInstallation({ pid: app.pid ?? assert.fail("no pid"), dmg: machine.dmg, paquet: machine.paquet, dossier: machine.dossier, env: machine.env });
  // Tant qu'elle tourne, rien n'est ouvert ni remplacé : l'installeur n'a appelé aucun outil.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(machine.appels(), []);
  assert.equal(machine.version(), "1.0.0");
  app.stdin?.end();
  await closedOne;
  await jusqua(() => machine.appels().at(-1) === `open -n ${machine.paquet}`);
  assert.equal(machine.version(), "1.1.0");
});

test("un paquet qui n'est pas une app n'est pas remplacé", () => {
  assert.throws(() => launchInstallation({ pid: onePidDead(), dmg: "/tmp/x.dmg", paquet: "/repo/app", dossier: "/tmp" }), /not an app bundle/);
});
