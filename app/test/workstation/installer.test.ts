// Le geste d'installation de la station de cet ordinateur (#2640), tel que le pont de l'app le joue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { installerTheStation } from "../../src/workstation/installer.ts";
import type { StateStationLocale, StationLocale } from "../../src/workstation/station.ts";

const station = (state: StateStationLocale): StationLocale => ({ etat: () => state, tourne: () => state === "demarree", arreter: async () => {} });

test("la station lancée avec l'app est installée : le geste ne refuse rien et relit les stations du chef", async () => {
  let reread = 0;
  assert.equal(await installerTheStation(station("demarree"), () => void reread++), undefined);
  assert.equal(await installerTheStation(station("tenue-ailleurs"), () => void reread++), undefined);
  assert.equal(reread, 2);
});

test("sans station sur cet ordinateur, ou refusée, le geste le dit en une ligne et ne relit rien", async () => {
  const reread = () => assert.fail("rien à relire");
  assert.match((await installerTheStation(undefined, reread))?.refus ?? "", /does not run a station/);
  assert.match((await installerTheStation(station("refusee"), reread))?.refus ?? "", /refused to start/);
  assert.match((await installerTheStation(station("arretee"), reread))?.refus ?? "", /stopped/);
});

test("le pont l'expose : le preload l'invoque et le main le joue", () => {
  const src = join(import.meta.dirname, "../../src");
  assert.match(readFileSync(join(src, "preload.cjs"), "utf8"), /installerLaStation: \(\) => ipcRenderer\.invoke\("installerLaStation"\)/);
  assert.match(readFileSync(join(src, "main.ts"), "utf8"), /ipcMain\.handle\("installerLaStation"/);
});
