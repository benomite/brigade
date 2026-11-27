// La station de fond à l'ouverture de session (#3630) : l'agent launchd `brigade.station` sur un Mac, la valeur `Run`
// sous Windows — et l'icône de fond qui la sait installée. Contre un faux système : ni launchctl, ni registre.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { writeThePidForTheIcon, registerTheStationOfBackground, REGISTERED_BY_THE_APP } from "../../src/station-background/registration.ts";
import { roleOf } from "../../src/workstation/role.ts";
import { stationOfBackgroundInstalled } from "../../src/tray-background/system.ts";

type System = Parameters<typeof registerTheStationOfBackground>[0];
function oneSystem(home: string, platform: NodeJS.Platform, answers: Record<string, number> = {}) {
  const calls: string[] = [];
  const system: System = {
    plateforme: platform,
    maison: home,
    localAppData: join(home, "AppData", "Local"),
    uid: 501,
    executer: async (command, args) => {
      const call = [command, ...args].join(" ");
      calls.push(call);
      return { code: answers[`${command} ${args[0]}`] ?? 0, sortie: "" };
    },
    node: "/Applications/brigade.app/Contents/Resources/node/bin/node",
    hote: "/Applications/brigade.app/Contents/Resources/app/src/station-background/host.ts",
    racine: join(home, ".config", "brigade", "station"),
    embarque: "/Applications/brigade.app/Contents/Resources/runtime/src/kitchen/main.ts",
    chemin: "/opt/homebrew/bin:/usr/bin:/bin",
    binaire: "C:\\Program Files\\brigade\\brigade.exe",
  };
  return { systeme: system, appels: calls };
}

test("sur un Mac, l'agent launchd de la station joue l'hôte par le node de l'app, et se charge — l'hôte démarre à l'ouverture de session", async (t) => {
  const home = repertoireTemporaire(t);
  const { systeme: system, appels: calls } = oneSystem(home, "darwin", { "launchctl print": 113 });
  assert.deepEqual(await registerTheStationOfBackground(system), { par: "launchd" });
  const plist = readFileSync(join(home, "Library", "LaunchAgents", "brigade.station.plist"), "utf8");
  assert.match(plist, /<string>brigade\.station<\/string>/);
  assert.match(plist, /<string>\/Applications\/brigade\.app\/Contents\/Resources\/node\/bin\/node<\/string>\n {4}<string>[^<]*station-background\/host\.ts<\/string>\n {4}<string>[^<]*station<\/string>\n {4}<string>[^<]*runtime\/src\/kitchen\/main\.ts<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\n {2}<true\/>/);
  assert.match(plist, /<key>PATH<\/key>\n {4}<string>\/opt\/homebrew\/bin:\/usr\/bin:\/bin<\/string>/);
  assert.match(plist, /fond\.log<\/string>/);
  assert.deepEqual(calls, ["launchctl print gui/501/brigade.station", `launchctl bootstrap gui/501 ${join(home, "Library", "LaunchAgents", "brigade.station.plist")}`]);
  // L'icône de fond la sait installée (tray-fond/, #3631).
  assert.equal(stationOfBackgroundInstalled(system), true);
});

test("sur un Mac, un agent déjà chargé n'est jamais rechargé — ce serait arrêter la station qui tourne — : il est lancé s'il ne tourne pas", async (t) => {
  const home = repertoireTemporaire(t);
  const { systeme: system, appels: calls } = oneSystem(home, "darwin", { "launchctl print": 113 });
  await registerTheStationOfBackground(system);
  calls.length = 0;
  // Le plist est déjà celui que l'app écrirait : l'agent chargé reste tel quel.
  const load = oneSystem(home, "darwin");
  assert.deepEqual(await registerTheStationOfBackground(load.systeme), { par: "launchd" });
  assert.deepEqual(load.appels, ["launchctl print gui/501/brigade.station", "launchctl kickstart gui/501/brigade.station"]);
});

test("sur un Mac, un plist que l'app réécrit est rechargé — bootout puis bootstrap — : launchd ne garde pas l'ancienne définition (#4400)", async (t) => {
  const home = repertoireTemporaire(t);
  const plist = join(home, "Library", "LaunchAgents", "brigade.station.plist");
  const old = oneSystem(home, "darwin", { "launchctl print": 113 });
  await registerTheStationOfBackground(old.systeme);
  const renamed = oneSystem(home, "darwin");
  renamed.systeme.node = "/Applications/brigade.app/Contents/Resources/node/bin/brigade-node";
  assert.deepEqual(await registerTheStationOfBackground(renamed.systeme), { par: "launchd" });
  assert.match(readFileSync(plist, "utf8"), /bin\/brigade-node<\/string>/);
  assert.deepEqual(renamed.appels, ["launchctl print gui/501/brigade.station", "launchctl bootout gui/501/brigade.station", `launchctl bootstrap gui/501 ${plist}`]);

  const refuses = oneSystem(home, "darwin", { "launchctl bootout": 5 });
  refuses.systeme.node = "/autre/node";
  const rendered = await registerTheStationOfBackground(refuses.systeme);
  assert.match("refus" in rendered ? rendered.refus : "", /did not unload the station's agent gui\/501\/brigade\.station \(exit code 5\)/);
  assert.ok(!refuses.appels.some((call) => call.includes("bootstrap")));
});

test("sur un Mac, un plist que l'app a écrit avant le renommage (#4413) est le sien : il est réécrit et rechargé, bootout puis bootstrap (#4603)", async (t) => {
  const home = repertoireTemporaire(t);
  const plist = join(home, "Library", "LaunchAgents", "brigade.station.plist");
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(plist, "<!-- Written by the brigade app (app/src/station-fond/inscription.ts), and rewritten when it changes: do not edit. -->\n<string>/Applications/Brigade.app/Contents/Resources/runtime/src/station/main.ts</string>");
  const { systeme: system, appels: calls } = oneSystem(home, "darwin");
  assert.deepEqual(await registerTheStationOfBackground(system), { par: "launchd" });
  const written = readFileSync(plist, "utf8");
  assert.match(written, /Written by the brigade app \(app\/src\/station-background\/registration\.ts\)/);
  assert.doesNotMatch(written, /station-fond|runtime\/src\/station\/main/);
  assert.deepEqual(calls, ["launchctl print gui/501/brigade.station", "launchctl bootout gui/501/brigade.station", `launchctl bootstrap gui/501 ${plist}`]);
});

test("sur un Mac, le plist que l'app écrit lance la cuisine, runtime/src/kitchen/main.ts (#4603)", async (t) => {
  const home = repertoireTemporaire(t);
  const runtime = "/Applications/brigade.app/Contents/Resources/runtime";
  const role = roleOf({ plateforme: "darwin", runtime, env: {}, existe: () => true });
  assert.deepEqual(role, { role: "station", principal: join(runtime, "src", "kitchen", "main.ts") });
  const { systeme: system } = oneSystem(home, "darwin", { "launchctl print": 113 });
  system.embarque = role.role === "station" ? role.principal : assert.fail("pas une station");
  await registerTheStationOfBackground(system);
  const plist = readFileSync(join(home, "Library", "LaunchAgents", "brigade.station.plist"), "utf8");
  assert.match(plist, /<string>[^<]*runtime\/src\/kitchen\/main\.ts<\/string>/);
  assert.doesNotMatch(plist, /runtime\/src\/station\//);
});

test("sur un Mac, l'agent posé par l'installeur de la station est laissé tel quel ; un launchd qui refuse est dit", async (t) => {
  const home = repertoireTemporaire(t);
  const plist = join(home, "Library", "LaunchAgents", "brigade.station.plist");
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(plist, "<!-- Écrit par le script d installation -->");
  const installs = oneSystem(home, "darwin");
  assert.deepEqual(await registerTheStationOfBackground(installs.systeme), { par: "installeur" });
  assert.deepEqual(installs.appels, []);
  assert.equal(readFileSync(plist, "utf8"), "<!-- Écrit par le script d installation -->");

  const other = repertoireTemporaire(t);
  const refuses = oneSystem(other, "darwin", { "launchctl print": 113, "launchctl bootstrap": 5 });
  const rendered = await registerTheStationOfBackground(refuses.systeme);
  assert.match("refus" in rendered ? rendered.refus : "", /launchd refused the station's agent .*brigade\.station\.plist \(exit code 5\)/);
});

test("sous Windows, la valeur Run relance le binaire de l'app avec --station-fond, et l'icône de fond la sait installée ; le lanceur de l'installeur présent, rien n'est écrit", async (t) => {
  const home = repertoireTemporaire(t);
  const { systeme: system, appels: calls } = oneSystem(home, "win32");
  assert.equal(stationOfBackgroundInstalled(system), false);
  assert.deepEqual(await registerTheStationOfBackground(system), { par: "run" });
  assert.deepEqual(calls, ['reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v brigade-station /t REG_SZ /d "C:\\Program Files\\brigade\\brigade.exe" --station-fond /f']);
  assert.ok(existsSync(join(home, "AppData", "Local", "brigade-station", REGISTERED_BY_THE_APP)));
  assert.equal(stationOfBackgroundInstalled(system), true);

  // L'hôte écrit son pid là où « Quit the station » le cherche.
  writeThePidForTheIcon({ plateforme: "win32", localAppData: system.localAppData, pid: 4321, dire: () => assert.fail("rien à dire") });
  assert.equal(readFileSync(join(home, "AppData", "Local", "brigade-station", "station.pid"), "utf8"), "4321\n");

  const withInstaller = repertoireTemporaire(t);
  mkdirSync(join(withInstaller, "AppData", "Local", "brigade-station"), { recursive: true });
  writeFileSync(join(withInstaller, "AppData", "Local", "brigade-station", "lancer-station.ps1"), "");
  const installs = oneSystem(withInstaller, "win32");
  assert.deepEqual(await registerTheStationOfBackground(installs.systeme), { par: "installeur" });
  assert.deepEqual(installs.appels, []);
  writeThePidForTheIcon({ plateforme: "win32", localAppData: installs.systeme.localAppData, pid: 4321, dire: () => {} });
  assert.equal(existsSync(join(withInstaller, "AppData", "Local", "brigade-station", "station.pid")), false);
});

test("sous Linux, rien ne s'inscrit : l'app lance l'hôte à son ouverture", async (t) => {
  const { systeme: system, appels: calls } = oneSystem(repertoireTemporaire(t), "linux");
  assert.deepEqual(await registerTheStationOfBackground(system), { par: "aucune" });
  assert.deepEqual(calls, []);
});

test("le binaire de l'app lancé avec --station-fond lance la station de fond, sans fenêtre", () => {
  const entry = readFileSync(join(import.meta.dirname, "../../src/tray-background/entry.ts"), "utf8");
  assert.match(entry, /if \(process\.argv\.includes\(ARGUMENT_BACKGROUND\)\) \{\n(?: {2}\/\/.*\n)? {2}await import\("\.\.\/station-background\/startup\.ts"\);\n\} else if/);
  const startup = readFileSync(join(import.meta.dirname, "../../src/station-background/startup.ts"), "utf8");
  assert.match(startup, /launchTheBackground\(\{ node: locations\.node, embarque: role\.principal, racine: root, env: process\.env \}\)/);
  assert.match(startup, /app\.exit\(0\);\s*$/);
});
