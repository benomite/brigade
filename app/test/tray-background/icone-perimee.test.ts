// #4071 — Une mise à jour ne relance pas l'icône de fond : launchd la garde sur le code d'avant. L'app, à son ouverture,
// relance une icône d'une autre version que la sienne, sans toucher à la station.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { DOSSIER_DU_BACKGROUND, ecrireLaVersionDuBackground, backgroundPerime, inscrireLeBackground } from "../../src/tray-background/systeme.ts";

type Systeme = Parameters<typeof inscrireLeBackground>[0];

test("the icon is out of date when it wrote another version, or none", (t) => {
  const donnees = repertoireTemporaire(t);
  assert.equal(backgroundPerime(donnees, "1.0.350"), true, "an icon from before #4071 writes no version");
  mkdirSync(join(donnees, DOSSIER_DU_BACKGROUND));
  ecrireLaVersionDuBackground(join(donnees, DOSSIER_DU_BACKGROUND), "1.0.349");
  assert.equal(backgroundPerime(donnees, "1.0.350"), true);
  assert.equal(backgroundPerime(donnees, "1.0.349"), false);
});

test("an out-of-date icon is restarted by launchd; the station's agent is not touched", async (t) => {
  const lancees: string[] = [];
  let kickstart = 0;
  const s: Systeme = {
    plateforme: "darwin",
    maison: repertoireTemporaire(t),
    localAppData: undefined,
    uid: 501,
    binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade",
    executer: async (command, args) => {
      lancees.push([command, ...args].join(" "));
      return { code: args[0] === "kickstart" ? kickstart : 0, sortie: args[0] === "kickstart" && kickstart !== 0 ? "not permitted" : "" };
    },
  };
  assert.equal(await inscrireLeBackground(s), undefined);
  lancees.length = 0;
  assert.equal(await inscrireLeBackground({ ...s, fondPerime: false }), undefined);
  assert.deepEqual(lancees, ["launchctl print gui/501/brigade.tray-fond"], "an icon of this version is left alone");
  lancees.length = 0;
  assert.equal(await inscrireLeBackground({ ...s, fondPerime: true }), undefined);
  assert.deepEqual(lancees, ["launchctl print gui/501/brigade.tray-fond", "launchctl kickstart -k gui/501/brigade.tray-fond"]);
  kickstart = 1;
  assert.equal(await inscrireLeBackground({ ...s, fondPerime: true }), "launchd would not restart the menu bar icon on this version of the app (gui/501/brigade.tray-fond) (exit code 1): not permitted");
  assert.equal(lancees.some((l) => l.includes("brigade.station")), false);
});

test("an out-of-date icon whose agent launchd has not loaded is loaded, not restarted", async (t) => {
  const lancees: string[] = [];
  const s: Systeme = {
    plateforme: "darwin",
    maison: repertoireTemporaire(t),
    localAppData: undefined,
    uid: 501,
    binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade",
    executer: async (command, args) => {
      lancees.push([command, ...args].join(" "));
      return { code: args[0] === "print" ? 113 : 0, sortie: "" };
    },
  };
  assert.equal(await inscrireLeBackground(s), undefined, "the plist is written");
  lancees.length = 0;
  assert.equal(await inscrireLeBackground({ ...s, fondPerime: true }), undefined);
  assert.equal(lancees.some((l) => l.includes("kickstart")), false, "an agent launchd does not hold cannot be restarted");
  assert.equal(lancees.some((l) => l.startsWith("launchctl bootstrap gui/501 ")), true, "it is loaded");
});
