// L'installeur de l'app installée (mise-a-jour/installation.ts) : il attend que l'app soit fermée,
// ouvre le .dmg, vérifie sa signature, met la nouvelle app à la place de l'ancienne et la rouvre —
// ou laisse l'ancienne intacte, dit pourquoi et la rouvre. Joué pour de vrai par `sh`, contre des
// doublures de `hdiutil`, `codesign`, `ditto` et `open` : ni Mac, ni .dmg.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { ECHEC } from "../../src/mise-a-jour/etat.ts";
import { APP_DU_DMG, commandeDInstallation, installabilite, lancerInstallation, paquetDe } from "../../src/mise-a-jour/installation.ts";
import { PAQUETS } from "../aides/posix.ts";

const executable = (chemin: string, corps: string) => {
  writeFileSync(chemin, `#!/bin/sh\n${corps}\n`);
  chmodSync(chemin, 0o755);
};

// Une machine : l'app installée dans `Applications/`, en version 1.0.0 et signée par l'équipe
// `equipe`, le .dmg de la 1.1.0 (son contenu est dans `volume/`, que le faux `hdiutil` « monte »), et
// les doublures — chacune note ses appels dans `appels`.
function uneMachine(t: TestContext, reglages: { equipe?: string; equipeNouvelle?: string; signatureValide?: boolean; montage?: boolean } = {}) {
  const racine = repertoireTemporaire(t);
  const paquet = join(racine, "Applications", "Brigade.app");
  mkdirSync(join(paquet, "Contents"), { recursive: true });
  writeFileSync(join(paquet, "Contents", "version"), "1.0.0");
  writeFileSync(join(paquet, "Contents", "equipe"), reglages.equipe ?? "ABCDE12345");
  const volume = join(racine, "volume");
  mkdirSync(join(volume, APP_DU_DMG, "Contents"), { recursive: true });
  writeFileSync(join(volume, APP_DU_DMG, "Contents", "version"), "1.1.0");
  writeFileSync(join(volume, APP_DU_DMG, "Contents", "equipe"), reglages.equipeNouvelle ?? "ABCDE12345");
  const dossier = join(racine, "mise-a-jour");
  mkdirSync(dossier);
  const dmg = join(dossier, "Brigade-1.1.0-arm64.dmg");
  writeFileSync(dmg, "un dmg");
  const outils = join(racine, "outils");
  mkdirSync(outils);
  const appels = join(racine, "appels");
  writeFileSync(appels, "");
  const noter = `echo "$(basename "$0") $*" >> '${appels}'`;
  executable(
    join(outils, "hdiutil"),
    `${noter}
case "$1" in
  attach) ${reglages.montage === false ? "exit 1" : `cp -R '${volume}/.' "$6/"`} ;;
  detach) rm -rf "$2"/* ;;
esac`,
  );
  executable(
    join(outils, "codesign"),
    `${noter}
case "$1" in
  --verify) exit ${reglages.signatureValide === false ? 1 : 0} ;;
  -dv) echo "TeamIdentifier=$(cat "$2/Contents/equipe")" >&2 ;;
esac`,
  );
  executable(join(outils, "ditto"), `${noter}\ncp -R "$1" "$2"`);
  executable(join(outils, "open"), noter);
  const env = { ...process.env, BRIGADE_HDIUTIL: join(outils, "hdiutil"), BRIGADE_CODESIGN: join(outils, "codesign"), BRIGADE_DITTO: join(outils, "ditto"), BRIGADE_OPEN: join(outils, "open"), TMPDIR: racine };
  return {
    paquet,
    dossier,
    dmg,
    env,
    version: () => readFileSync(join(paquet, "Contents", "version"), "utf8"),
    appels: () => readFileSync(appels, "utf8").trim().split("\n").filter(Boolean),
    echec: () => (existsSync(join(dossier, ECHEC)) ? readFileSync(join(dossier, ECHEC), "utf8").trim() : undefined),
    // Ce qui reste à côté de l'app : rien que l'app.
    applications: () => readdirSync(join(racine, "Applications")),
  };
}

// Un pid qui ne tourne plus : celui d'un process fini.
const unPidMort = () => spawnSync("true").pid ?? assert.fail("no pid");

function installer(machine: ReturnType<typeof uneMachine>, pid = unPidMort()) {
  const { commande, args, env } = commandeDInstallation({ pid, dmg: machine.dmg, paquet: machine.paquet, dossier: machine.dossier, env: machine.env });
  return spawnSync(commande, args, { env, encoding: "utf8" });
}

test("le paquet de l'app est celui de son Contents/Resources", { skip: PAQUETS }, () => {
  assert.equal(paquetDe("/Applications/Brigade.app/Contents/Resources"), "/Applications/Brigade.app");
});

test("une app qui ne pourrait pas se remplacer là où elle est le dit", () => {
  const ouvert = () => {};
  assert.equal(installabilite("/Applications/Brigade.app", ouvert), undefined);
  assert.match(installabilite("/private/var/folders/x/AppTranslocation/1234/d/Brigade.app", ouvert) ?? "", /temporary copy: move Brigade to the Applications folder/);
  assert.match(installabilite("/Volumes/Brigade/Brigade.app", ouvert) ?? "", /from its disk image/);
  assert.match(installabilite("/repo/app/node_modules/electron/dist", ouvert) ?? "", /does not run from an app bundle/);
  const ferme = (chemin: string) => {
    if (chemin === "/Applications") throw new Error("EACCES");
  };
  assert.equal(installabilite("/Applications/Brigade.app", ferme), "this account cannot write to /Applications");
});

test("l'installeur met la nouvelle version à la place de l'app, range le .dmg et la rouvre", { skip: PAQUETS }, (t) => {
  const machine = uneMachine(t);
  const fini = installer(machine);
  assert.equal(fini.status, 0, fini.stderr);
  assert.equal(machine.version(), "1.1.0");
  assert.deepEqual(machine.applications(), ["Brigade.app"]);
  assert.equal(existsSync(machine.dmg), false);
  assert.equal(machine.echec(), undefined);
  const appels = machine.appels();
  assert.ok(appels.some((appel) => appel.startsWith(`codesign --verify --deep --strict `)));
  assert.equal(appels.at(-1), `open ${machine.paquet}`);
  assert.ok(appels.indexOf(appels.find((appel) => appel.startsWith("hdiutil detach")) ?? "") < appels.length - 1);
});

test("une app qui tourne sans développeur identifié (signée ad hoc) prend la version signée", { skip: PAQUETS }, (t) => {
  const machine = uneMachine(t, { equipe: "not set" });
  assert.equal(installer(machine).status, 0);
  assert.equal(machine.version(), "1.1.0");
});

for (const [cas, reglages, raison] of [
  ["une signature qui ne tient pas", { signatureValide: false }, "the new version is not correctly signed"],
  ["un autre développeur", { equipeNouvelle: "ZZZZZ99999" }, "the new version is not signed by the same developer as this one (ABCDE12345)"],
  ["un .dmg qui ne s'ouvre pas", { montage: false }, "the disk image of the new version could not be opened"],
] as const) {
  test(`${cas} : l'app en place n'est pas touchée, la raison est écrite et l'ancienne est rouverte`, { skip: PAQUETS }, (t) => {
    const machine = uneMachine(t, reglages);
    assert.equal(installer(machine).status, 1);
    assert.equal(machine.version(), "1.0.0");
    assert.deepEqual(machine.applications(), ["Brigade.app"]);
    assert.equal(machine.echec(), raison);
    assert.equal(existsSync(machine.dmg), false);
    assert.equal(machine.appels().at(-1), `open ${machine.paquet}`);
  });
}

test("l'installeur, détaché, attend que l'app soit fermée avant de rien toucher", { skip: PAQUETS }, async (t) => {
  const machine = uneMachine(t);
  // L'app qui tourne : un process qui attend qu'on le ferme.
  const app = spawn("sh", ["-c", "read ligne"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => app.kill("SIGKILL"));
  const fermee = new Promise((resoudre) => app.once("exit", resoudre));
  lancerInstallation({ pid: app.pid ?? assert.fail("no pid"), dmg: machine.dmg, paquet: machine.paquet, dossier: machine.dossier, env: machine.env });
  // Tant qu'elle tourne, rien n'est ouvert ni remplacé : l'installeur n'a appelé aucun outil.
  await new Promise((resoudre) => setTimeout(resoudre, 300));
  assert.deepEqual(machine.appels(), []);
  assert.equal(machine.version(), "1.0.0");
  app.stdin?.end();
  await fermee;
  await jusqua(() => machine.appels().at(-1) === `open ${machine.paquet}`);
  assert.equal(machine.version(), "1.1.0");
});

test("un paquet qui n'est pas une app n'est pas remplacé", () => {
  assert.throws(() => lancerInstallation({ pid: unPidMort(), dmg: "/tmp/x.dmg", paquet: "/repo/app", dossier: "/tmp" }), /not an app bundle/);
});
