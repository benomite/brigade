// Le geste d'installation de la station de cet ordinateur (#2640), tel que le pont de l'app le joue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { installerLaStation } from "../../src/poste/installer.ts";
import type { EtatStationLocale, StationLocale } from "../../src/poste/station.ts";

const station = (etat: EtatStationLocale): StationLocale => ({ etat: () => etat, tourne: () => etat === "demarree", arreter: async () => {} });

test("la station lancée avec l'app est installée : le geste ne refuse rien et relit les stations du chef", async () => {
  let relues = 0;
  assert.equal(await installerLaStation(station("demarree"), () => void relues++), undefined);
  assert.equal(await installerLaStation(station("tenue-ailleurs"), () => void relues++), undefined);
  assert.equal(relues, 2);
});

test("sans station sur cet ordinateur, ou refusée, le geste le dit en une ligne et ne relit rien", async () => {
  const relire = () => assert.fail("rien à relire");
  assert.match((await installerLaStation(undefined, relire))?.refus ?? "", /does not run a station/);
  assert.match((await installerLaStation(station("refusee"), relire))?.refus ?? "", /refused to start/);
  assert.match((await installerLaStation(station("arretee"), relire))?.refus ?? "", /stopped/);
});

test("le pont l'expose : le preload l'invoque et le main le joue", () => {
  const src = join(import.meta.dirname, "../../src");
  assert.match(readFileSync(join(src, "preload.cjs"), "utf8"), /installerLaStation: \(\) => ipcRenderer\.invoke\("installerLaStation"\)/);
  assert.match(readFileSync(join(src, "main.ts"), "utf8"), /ipcMain\.handle\("installerLaStation"/);
});
