// L'icône de la station de fond (#3631), sur la station et le système : l'inscription à l'ouverture de session, et ce que « Quit the station » arrête.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { keepTheIcon, registerTheBackground, quitTheStation, stationOfBackgroundInstalled } from "../src/tray-background/system.ts";

type System = Parameters<typeof registerTheBackground>[0];
type Run = System["executer"];

function home(t: TestContext): string {
  const folder = mkdtempSync(join(tmpdir(), "tray-fond-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function system(t: TestContext, platform: NodeJS.Platform, reply: (command: string, args: readonly string[]) => number = () => 0) {
  const launched: string[] = [];
  const run: Run = async (command, args) => {
    launched.push([command, ...args].join(" "));
    return { code: reply(command, args), sortie: "" };
  };
  const here = home(t);
  const s: System = { plateforme: platform, maison: here, localAppData: join(here, "AppData", "Local"), uid: 501, binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade", executer: run };
  return { s, lancees: launched };
}

describe("l'icône à l'ouverture de session", () => {
  test("seulement là où la station de fond est installée — son agent launchd, ou son lanceur Windows", (t) => {
    const mac = system(t, "darwin").s;
    assert.equal(stationOfBackgroundInstalled(mac), false);
    mkdirSync(join(mac.maison, "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(join(mac.maison, "Library", "LaunchAgents", "brigade.station.plist"), "");
    assert.equal(stationOfBackgroundInstalled(mac), true);
    const windows = system(t, "win32").s;
    assert.equal(stationOfBackgroundInstalled(windows), false);
    mkdirSync(join(windows.localAppData ?? "", "brigade-station"), { recursive: true });
    writeFileSync(join(windows.localAppData ?? "", "brigade-station", "lancer-station.ps1"), "");
    assert.equal(stationOfBackgroundInstalled(windows), true);
    assert.equal(stationOfBackgroundInstalled({ ...windows, localAppData: undefined }), false);
    assert.equal(stationOfBackgroundInstalled({ ...mac, plateforme: "linux" }), false);
  });

  test("sur un Mac : son agent launchd, chargé une fois, rechargé seulement quand il change", async (t) => {
    const { s, lancees: launched } = system(t, "darwin", (_, args) => (args[0] === "print" && launched.length > 2 ? 0 : args[0] === "print" ? 113 : 0));
    assert.equal(await registerTheBackground(s), undefined);
    const plist = join(s.maison, "Library", "LaunchAgents", "brigade.tray-fond.plist");
    assert.match(readFileSync(plist, "utf8"), /<key>Label<\/key>\n  <string>brigade\.tray-fond<\/string>/);
    assert.match(readFileSync(plist, "utf8"), /<key>RunAtLoad<\/key>\n  <true\/>/);
    assert.ok(readFileSync(plist, "utf8").includes(`<string>${join(s.maison, "Library", "Logs", "brigade-tray.log")}</string>`));
    assert.match(readFileSync(plist, "utf8"), /<string>\/Applications\/Brigade\.app\/Contents\/MacOS\/Brigade<\/string>\n    <string>--tray-fond<\/string>/);
    assert.deepEqual(launched, ["launchctl print gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
    // Chargé, et le même : rien n'est relancé.
    assert.equal(await registerTheBackground(s), undefined);
    assert.deepEqual(launched.slice(2), ["launchctl print gui/501/brigade.tray-fond"]);
    // L'app a bougé : l'agent est rechargé sur le nouveau binaire.
    assert.equal(await registerTheBackground({ ...s, binaire: "/Applications/Autre.app/Contents/MacOS/Brigade" }), undefined);
    assert.deepEqual(launched.slice(3), ["launchctl print gui/501/brigade.tray-fond", "launchctl bootout gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
  });

  test("son agent est relancé quelle que soit sa sortie, un 0 compris (#3711)", async (t) => {
    const { s } = system(t, "darwin", (_, args) => (args[0] === "print" ? 113 : 0));
    await registerTheBackground(s);
    const plist = readFileSync(join(s.maison, "Library", "LaunchAgents", "brigade.tray-fond.plist"), "utf8");
    assert.match(plist, /<key>KeepAlive<\/key>\n  <true\/>/);
    assert.doesNotMatch(plist, /SuccessfulExit/);
  });

  describe("garderLIcone : l'agent tourne, sinon il est relancé, sinon la raison est dite", () => {
    const agent = (t: TestContext, answers: Array<{ code: number; sortie: string }>, launched: string[]) => {
      const { s } = system(t, "darwin");
      let readings = 0;
      const run: Run = async (command, args) => {
        launched.push([command, ...args].join(" "));
        if (args[0] !== "print") return { code: 0, sortie: "" };
        return answers[Math.min(readings++, answers.length - 1)] ?? { code: 1, sortie: "" };
      };
      return { ...s, executer: run };
    };
    const runs = { code: 0, sortie: "brigade.tray-fond = {\n\tstate = running\n}" };
    const stops = { code: 0, sortie: "brigade.tray-fond = {\n\tstate = not running\n\tlast exit code = 0\n}" };
    const not = async () => {};

    test("qui tourne : rien n'est relancé", async (t) => {
      const launched: string[] = [];
      assert.equal(await keepTheIcon(agent(t, [runs], launched), not), undefined);
      assert.ok(!launched.some((l) => l.includes("kickstart")));
    });

    test("sorti avec 0 : il est relancé, et il tourne", async (t) => {
      const launched: string[] = [];
      // inscrireLeFond lit l'agent chargé (code 0), puis l'état : arrêté, puis en marche après le kickstart.
      assert.equal(await keepTheIcon(agent(t, [stops, stops, runs], launched), not), undefined);
      assert.ok(launched.includes("launchctl kickstart gui/501/brigade.tray-fond"));
    });

    test("relancé mais retombé, ou refusé : la raison est dite", async (t) => {
      const fallsBack = await keepTheIcon(agent(t, [stops], []), not);
      assert.match(fallsBack ?? "", /^the menu bar icon is not running: launchd started it .*brigade-tray\.log$/);
      const { s } = system(t, "darwin", (_, args) => (args[0] === "kickstart" ? 113 : 0));
      assert.match((await keepTheIcon(s, not)) ?? "", /^the menu bar icon is not running and launchd would not start it .* \(exit code 113\)$/);
    });

    test("hors d'un Mac : rien à garder", async (t) => {
      assert.equal(await keepTheIcon(system(t, "win32").s, not), undefined);
    });
  });

  test("launchd qui refuse l'agent : c'est dit", async (t) => {
    const { s } = system(t, "darwin", (_, args) => (args[0] === "bootstrap" ? 5 : 113));
    assert.match((await registerTheBackground(s)) ?? "", /^launchd refused the menu bar icon's agent .*brigade\.tray-fond\.plist \(exit code 5\)$/);
  });

  test("sous Windows : la valeur `brigade-tray` de la clé Run", async (t) => {
    const { s, lancees: launched } = system(t, "win32");
    assert.equal(await registerTheBackground({ ...s, binaire: "C:\\Brigade\\Brigade.exe" }), undefined);
    assert.deepEqual(launched, ['reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v brigade-tray /t REG_SZ /d "C:\\Brigade\\Brigade.exe" --tray-fond /f']);
    const refuses = system(t, "win32", () => 1).s;
    assert.match((await registerTheBackground(refuses)) ?? "", /^the notification area icon's logon start could not be written/);
  });
});

describe("quitter la station, une fois confirmé", () => {
  test("sur un Mac : l'agent de la station, puis celui de l'icône, déchargés", async (t) => {
    const { s, lancees: launched } = system(t, "darwin");
    assert.deepEqual(await quitTheStation(s), []);
    assert.deepEqual(launched, ["launchctl bootout gui/501/brigade.station", "launchctl bootout gui/501/brigade.tray-fond"]);
    const refuses = system(t, "darwin", (_, args) => (args[1]?.endsWith("brigade.station") ? 3 : 0));
    assert.deepEqual(await quitTheStation(refuses.s), ["launchd did not stop the station (gui/501/brigade.station) (exit code 3)"]);
    assert.equal(refuses.lancees.length, 2, "l'icône part quand même");
  });

  test("sous Windows : le lanceur d'abord, puis la station et ses cooks", async (t) => {
    const { s, lancees: launched } = system(t, "win32");
    const folder = join(s.localAppData ?? "", "brigade-station");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "lanceur.pid"), "4100\n");
    writeFileSync(join(folder, "station.pid"), "4200\n");
    assert.deepEqual(await quitTheStation(s), []);
    assert.deepEqual(launched, ['taskkill /PID 4100 /FI IMAGENAME eq node.exe /F', 'taskkill /PID 4200 /FI IMAGENAME eq node.exe /T /F']);
    // Une station déjà arrêtée n'a plus de `station.pid` : seul le lanceur est visé.
    rmSync(join(folder, "station.pid"));
    const fails = system(t, "win32", () => 128);
    mkdirSync(join(fails.s.localAppData ?? "", "brigade-station"), { recursive: true });
    writeFileSync(join(fails.s.localAppData ?? "", "brigade-station", "lanceur.pid"), "4100\n");
    assert.deepEqual(await quitTheStation(fails.s), ["the station's launcher (pid 4100) did not stop (exit code 128)"]);
    assert.deepEqual(await quitTheStation({ ...s, localAppData: undefined }), ["LOCALAPPDATA is not set: the station's launcher cannot be found"]);
  });
});

describe("le binaire de l'app, branché sur l'icône de fond", () => {
  const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");

  test("son entrée lance l'icône avec `--tray-fond`, l'app sans — et l'app inscrit l'icône quand la station de fond est là", () => {
    assert.equal(JSON.parse(read("package.json")).main, "src/tray-background/entry.ts");
    const entry = read("src/tray-background/entry.ts");
    assert.match(entry, /if \(process\.argv\.includes\(ARGUMENT\)\) \{\n  await import\("\.\/process\.ts"\);\n\} else \{/);
    assert.ok(entry.includes('await import(' + '"../main.ts");'));
    assert.ok(entry.includes("if (installedOne && stationOfBackgroundInstalled(system))"));
    assert.ok(entry.includes("await registerTheBackground("));
  });

  test("l'app ne pose pas sa propre icône quand celle de fond la tient", () => {
    const principal = read("src/main.ts");
    assert.ok(principal.includes('const iconAtBackground = locations.facon === "installee" && stationOfBackgroundInstalled('));
    assert.ok(principal.includes("menuBar.poser(tracking.configuration().barreDeMenus !== false && !iconAtBackground,"));
  });

  test("le process de l'icône ne lit aucun fichier de projets de la station, la confirmation de quitter — et ne lance aucune commande du runtime", () => {
    const process = read("src/tray-background/process.ts");
    assert.doesNotMatch(process, /servedBy|kitchen-here/);
    assert.ok(process.includes("const text = confirmationOfQuit();"));
    assert.doesNotMatch(process, /launchHere|facts|geste\.ts/);
    assert.equal(existsSync(join(import.meta.dirname, "..", "src", "tray-background", "read.ts")), false);
    assert.match(process, /if \(response !== 0\) return;\n\s+await tell\(await quitTheStation\(/);
  });
});
