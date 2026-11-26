// La station de fond à l'ouverture de session (#3630) : l'agent launchd `brigade.station` sur un Mac, la valeur `Run`
// sous Windows — et l'icône de fond qui la sait installée. Contre un faux système : ni launchctl, ni registre.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { ecrireLePidPourLIcone, inscrireLaStationDeBackground, INSCRITE_PAR_L_APP } from "../../src/station-background/inscription.ts";
import { stationDeBackgroundInstallee } from "../../src/tray-background/systeme.ts";

type Systeme = Parameters<typeof inscrireLaStationDeBackground>[0];
function unSysteme(maison: string, plateforme: NodeJS.Platform, answers: Record<string, number> = {}) {
  const calls: string[] = [];
  const systeme: Systeme = {
    plateforme,
    maison,
    localAppData: join(maison, "AppData", "Local"),
    uid: 501,
    executer: async (command, args) => {
      const call = [command, ...args].join(" ");
      calls.push(call);
      return { code: answers[`${command} ${args[0]}`] ?? 0, sortie: "" };
    },
    node: "/Applications/brigade.app/Contents/Resources/node/bin/node",
    hote: "/Applications/brigade.app/Contents/Resources/app/src/station-fond/hote.ts",
    racine: join(maison, ".config", "brigade", "station"),
    embarque: "/Applications/brigade.app/Contents/Resources/runtime/src/station/main.ts",
    chemin: "/opt/homebrew/bin:/usr/bin:/bin",
    binaire: "C:\\Program Files\\brigade\\brigade.exe",
  };
  return { systeme, appels: calls };
}

test("sur un Mac, l'agent launchd de la station joue l'hôte par le node de l'app, et se charge — l'hôte démarre à l'ouverture de session", async (t) => {
  const maison = repertoireTemporaire(t);
  const { systeme, appels: calls } = unSysteme(maison, "darwin", { "launchctl print": 113 });
  assert.deepEqual(await inscrireLaStationDeBackground(systeme), { par: "launchd" });
  const plist = readFileSync(join(maison, "Library", "LaunchAgents", "brigade.station.plist"), "utf8");
  assert.match(plist, /<string>brigade\.station<\/string>/);
  assert.match(plist, /<string>\/Applications\/brigade\.app\/Contents\/Resources\/node\/bin\/node<\/string>\n {4}<string>[^<]*station-fond\/hote\.ts<\/string>\n {4}<string>[^<]*station<\/string>\n {4}<string>[^<]*runtime\/src\/station\/main\.ts<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\n {2}<true\/>/);
  assert.match(plist, /<key>PATH<\/key>\n {4}<string>\/opt\/homebrew\/bin:\/usr\/bin:\/bin<\/string>/);
  assert.match(plist, /fond\.log<\/string>/);
  assert.deepEqual(calls, ["launchctl print gui/501/brigade.station", `launchctl bootstrap gui/501 ${join(maison, "Library", "LaunchAgents", "brigade.station.plist")}`]);
  // L'icône de fond la sait installée (tray-background/, #3631).
  assert.equal(stationDeBackgroundInstallee(systeme), true);
});

test("sur un Mac, un agent déjà chargé n'est jamais rechargé — ce serait arrêter la station qui tourne — : il est lancé s'il ne tourne pas", async (t) => {
  const maison = repertoireTemporaire(t);
  const { systeme, appels: calls } = unSysteme(maison, "darwin", { "launchctl print": 113 });
  await inscrireLaStationDeBackground(systeme);
  calls.length = 0;
  // Le plist est déjà celui que l'app écrirait : l'agent chargé reste tel quel.
  const charge = unSysteme(maison, "darwin");
  assert.deepEqual(await inscrireLaStationDeBackground(charge.systeme), { par: "launchd" });
  assert.deepEqual(charge.appels, ["launchctl print gui/501/brigade.station", "launchctl kickstart gui/501/brigade.station"]);
});

test("sur un Mac, un plist que l'app réécrit est rechargé — bootout puis bootstrap — : launchd ne garde pas l'ancienne définition (#4400)", async (t) => {
  const maison = repertoireTemporaire(t);
  const plist = join(maison, "Library", "LaunchAgents", "brigade.station.plist");
  const ancien = unSysteme(maison, "darwin", { "launchctl print": 113 });
  await inscrireLaStationDeBackground(ancien.systeme);
  const renomme = unSysteme(maison, "darwin");
  renomme.systeme.node = "/Applications/brigade.app/Contents/Resources/node/bin/brigade-node";
  assert.deepEqual(await inscrireLaStationDeBackground(renomme.systeme), { par: "launchd" });
  assert.match(readFileSync(plist, "utf8"), /bin\/brigade-node<\/string>/);
  assert.deepEqual(renomme.appels, ["launchctl print gui/501/brigade.station", "launchctl bootout gui/501/brigade.station", `launchctl bootstrap gui/501 ${plist}`]);

  const refuse = unSysteme(maison, "darwin", { "launchctl bootout": 5 });
  refuse.systeme.node = "/autre/node";
  const rendu = await inscrireLaStationDeBackground(refuse.systeme);
  assert.match("refus" in rendu ? rendu.refus : "", /did not unload the station's agent gui\/501\/brigade\.station \(exit code 5\)/);
  assert.ok(!refuse.appels.some((call) => call.includes("bootstrap")));
});

test("sur un Mac, l'agent posé par l'installeur de la station est laissé tel quel ; un launchd qui refuse est dit", async (t) => {
  const maison = repertoireTemporaire(t);
  const plist = join(maison, "Library", "LaunchAgents", "brigade.station.plist");
  mkdirSync(join(maison, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(plist, "<!-- Écrit par installer-station.sh -->");
  const installe = unSysteme(maison, "darwin");
  assert.deepEqual(await inscrireLaStationDeBackground(installe.systeme), { par: "installeur" });
  assert.deepEqual(installe.appels, []);
  assert.equal(readFileSync(plist, "utf8"), "<!-- Écrit par installer-station.sh -->");

  const autre = repertoireTemporaire(t);
  const refuse = unSysteme(autre, "darwin", { "launchctl print": 113, "launchctl bootstrap": 5 });
  const rendu = await inscrireLaStationDeBackground(refuse.systeme);
  assert.match("refus" in rendu ? rendu.refus : "", /launchd refused the station's agent .*brigade\.station\.plist \(exit code 5\)/);
});

test("sous Windows, la valeur Run relance le binaire de l'app avec --station-fond, et l'icône de fond la sait installée ; le lanceur de l'installeur présent, rien n'est écrit", async (t) => {
  const maison = repertoireTemporaire(t);
  const { systeme, appels: calls } = unSysteme(maison, "win32");
  assert.equal(stationDeBackgroundInstallee(systeme), false);
  assert.deepEqual(await inscrireLaStationDeBackground(systeme), { par: "run" });
  assert.deepEqual(calls, ['reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v brigade-station /t REG_SZ /d "C:\\Program Files\\brigade\\brigade.exe" --station-fond /f']);
  assert.ok(existsSync(join(maison, "AppData", "Local", "brigade-station", INSCRITE_PAR_L_APP)));
  assert.equal(stationDeBackgroundInstallee(systeme), true);

  // L'hôte écrit son pid là où « Quit the station » le cherche.
  ecrireLePidPourLIcone({ plateforme: "win32", localAppData: systeme.localAppData, pid: 4321, dire: () => assert.fail("rien à dire") });
  assert.equal(readFileSync(join(maison, "AppData", "Local", "brigade-station", "station.pid"), "utf8"), "4321\n");

  const avecInstalleur = repertoireTemporaire(t);
  mkdirSync(join(avecInstalleur, "AppData", "Local", "brigade-station"), { recursive: true });
  writeFileSync(join(avecInstalleur, "AppData", "Local", "brigade-station", "lancer-station.ps1"), "");
  const installe = unSysteme(avecInstalleur, "win32");
  assert.deepEqual(await inscrireLaStationDeBackground(installe.systeme), { par: "installeur" });
  assert.deepEqual(installe.appels, []);
  ecrireLePidPourLIcone({ plateforme: "win32", localAppData: installe.systeme.localAppData, pid: 4321, dire: () => {} });
  assert.equal(existsSync(join(avecInstalleur, "AppData", "Local", "brigade-station", "station.pid")), false);
});

test("sous Linux, rien ne s'inscrit : l'app lance l'hôte à son ouverture", async (t) => {
  const { systeme, appels: calls } = unSysteme(repertoireTemporaire(t), "linux");
  assert.deepEqual(await inscrireLaStationDeBackground(systeme), { par: "aucune" });
  assert.deepEqual(calls, []);
});

test("le binaire de l'app lancé avec --station-fond lance la station de fond, sans fenêtre", () => {
  const entree = readFileSync(join(import.meta.dirname, "../../src/tray-background/entree.ts"), "utf8");
  assert.match(entree, /if \(process\.argv\.includes\(ARGUMENT_BACKGROUND\)\) \{\n(?: {2}\/\/.*\n)? {2}await import\("\.\.\/station-background\/demarrage\.ts"\);\n\} else if/);
  const demarrage = readFileSync(join(import.meta.dirname, "../../src/station-background/demarrage.ts"), "utf8");
  assert.match(demarrage, /lancerLeBackground\(\{ node: emplacements\.node, embarque: role\.principal, racine, env: process\.env \}\)/);
  assert.match(demarrage, /app\.exit\(0\);\s*$/);
});
