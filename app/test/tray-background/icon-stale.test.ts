// #4071 — Une mise à jour ne relance pas l'icône de fond : launchd la garde sur le code d'avant. L'app, à son ouverture,
// relance une icône d'une autre version que la sienne, sans toucher à la station.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { FOLDER_OF_BACKGROUND, writeTheVersionOfBackground, backgroundStale, registerTheBackground } from "../../src/tray-background/system.ts";

type System = Parameters<typeof registerTheBackground>[0];

test("the icon is out of date when it wrote another version, or none", (t) => {
  const data = repertoireTemporaire(t);
  assert.equal(backgroundStale(data, "1.0.350"), true, "an icon from before #4071 writes no version");
  mkdirSync(join(data, FOLDER_OF_BACKGROUND));
  writeTheVersionOfBackground(join(data, FOLDER_OF_BACKGROUND), "1.0.349");
  assert.equal(backgroundStale(data, "1.0.350"), true);
  assert.equal(backgroundStale(data, "1.0.349"), false);
});

test("an out-of-date icon is restarted by launchd; the station's agent is not touched", async (t) => {
  const launched: string[] = [];
  let kickstart = 0;
  const s: System = {
    plateforme: "darwin",
    maison: repertoireTemporaire(t),
    localAppData: undefined,
    uid: 501,
    binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade",
    executer: async (command, args) => {
      launched.push([command, ...args].join(" "));
      return { code: args[0] === "kickstart" ? kickstart : 0, sortie: args[0] === "kickstart" && kickstart !== 0 ? "not permitted" : "" };
    },
  };
  assert.equal(await registerTheBackground(s), undefined);
  launched.length = 0;
  assert.equal(await registerTheBackground({ ...s, fondPerime: false }), undefined);
  assert.deepEqual(launched, ["launchctl print gui/501/brigade.tray-fond"], "an icon of this version is left alone");
  launched.length = 0;
  assert.equal(await registerTheBackground({ ...s, fondPerime: true }), undefined);
  assert.deepEqual(launched, ["launchctl print gui/501/brigade.tray-fond", "launchctl kickstart -k gui/501/brigade.tray-fond"]);
  kickstart = 1;
  assert.equal(await registerTheBackground({ ...s, fondPerime: true }), "launchd would not restart the menu bar icon on this version of the app (gui/501/brigade.tray-fond) (exit code 1): not permitted");
  assert.equal(launched.some((l) => l.includes("brigade.station")), false);
});

test("an out-of-date icon whose agent launchd has not loaded is loaded, not restarted", async (t) => {
  const launched: string[] = [];
  const s: System = {
    plateforme: "darwin",
    maison: repertoireTemporaire(t),
    localAppData: undefined,
    uid: 501,
    binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade",
    executer: async (command, args) => {
      launched.push([command, ...args].join(" "));
      return { code: args[0] === "print" ? 113 : 0, sortie: "" };
    },
  };
  assert.equal(await registerTheBackground(s), undefined, "the plist is written");
  launched.length = 0;
  assert.equal(await registerTheBackground({ ...s, fondPerime: true }), undefined);
  assert.equal(launched.some((l) => l.includes("kickstart")), false, "an agent launchd does not hold cannot be restarted");
  assert.equal(launched.some((l) => l.startsWith("launchctl bootstrap gui/501 ")), true, "it is loaded");
});
