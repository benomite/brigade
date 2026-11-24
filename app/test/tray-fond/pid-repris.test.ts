// #4071 — Le pid laissé par l'app quittée est rendu à un autre process (l'icône de fond, l'hôte de la station) : la place
// n'est tenue que par un process lancé comme celui qui la demande, sinon l'app rouverte passait la main et ne montrait rien.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { autreAppTourne, prendreLaPlace } from "../../src/tray-fond/instance.ts";

const SOUS_POSIX: string | false = process.platform === "win32" ? "the command line is read with ps, which Windows does not have" : false;

// Un process vivant lancé avec ces arguments, rendu quand `ps` lit sa commande telle qu'elle est lancée.
async function lancer(t: TestContext, ...args: string[]): Promise<number> {
  const enfant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", ...args], { stdio: "ignore" });
  t.after(() => enfant.kill("SIGKILL"));
  const pid = enfant.pid ?? assert.fail("no pid");
  const lue = () => {
    try {
      return execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
  await jusqua(() => lue().includes("setInterval"), 5_000);
  return pid;
}

// Un faux `ps` (ou PowerShell) : la commande de chaque pid connu, un échec pour les autres. Le pid demandé est le dernier
// nombre de ses arguments (`-p <pid>`, `ProcessId=<pid>`).
function fauxPs(commandes: Map<number, string>, lus: number[] = []) {
  return (_commande: string, args: string[]): string => {
    const pid = Number(/(\d+)\D*$/.exec(args.join(" "))?.[1]);
    lus.push(pid);
    const lue = commandes.get(pid);
    if (lue === undefined) throw new Error("ps: no such process");
    return `${lue}\n`;
  };
}

test("two living processes launched with the same command are the same; another command, or a dead one, is not", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const une = await lancer(t, "--une-app");
  const autre = await lancer(t, "--une-app");
  const icone = await lancer(t, "--tray-fond");
  writeFileSync(fichier, String(une));
  assert.equal(autreAppTourne(fichier, false, autre), true, "an app launched alike holds the place: hand off");
  writeFileSync(fichier, String(icone));
  assert.equal(autreAppTourne(fichier, false, autre), false, "the icon process does not");
  writeFileSync(fichier, String(4_000_000));
  assert.equal(autreAppTourne(fichier, false, autre), false, "a dead process does not");
});

test("a process launched like this one is the same; another command, or one that cannot be read, is not", (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  // Le pid laissé dans la place : celui du process qui joue ce test, vivant.
  const laisse = process.pid;
  const soi = 4_000_004;
  const commandes = new Map<number, string>();
  const tenue = (autre: string | undefined, nous: string | undefined, plateforme: NodeJS.Platform = "darwin") => {
    commandes.clear();
    if (autre !== undefined) commandes.set(laisse, autre);
    if (nous !== undefined) commandes.set(soi, nous);
    writeFileSync(fichier, String(laisse));
    return autreAppTourne(fichier, false, soi, plateforme, fauxPs(commandes));
  };
  const brigade = "/Applications/Brigade.app/Contents/MacOS/Brigade";
  assert.equal(tenue(`${brigade} -psn_0_12345`, brigade), true, "the same app, launched by the old LaunchServices");
  assert.equal(tenue(brigade, `${brigade} -psn_0_12345`), true);
  assert.equal(tenue(`${brigade} --tray-fond`, brigade), false, "the icon process of the same bundle is not the app");
  assert.equal(tenue("/usr/local/bin/node /Users/chef/.brigade/runtime/src/station/principal.ts", brigade), false, "the station host is not the app");
  assert.equal(tenue('"C:\\Program Files\\Brigade\\Brigade.exe"', "C:\\Program Files\\Brigade\\Brigade.exe", "win32"), true, "the same app, its binary quoted by a Windows shortcut");
  // Quand `ps` ne lit pas la commande, la place de l'app est prise : une seconde app peut s'ouvrir à côté d'une vivante,
  // deux fenêtres plutôt qu'aucune (#4071).
  assert.equal(tenue(undefined, brigade), false, "a command that cannot be read proves nothing: the window shows");
  assert.equal(tenue(brigade, undefined), false, "nor this process's own");
});

test("by default, a place held by a living process whose command cannot be read stays held: an unreadable command proves nothing", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "tray.pid");
  const app = await lancer(t, "--une-app");
  const soi = await lancer(t, "--tray-fond");
  const chemin = process.env.PATH;
  t.after(() => (process.env.PATH = chemin));
  // Sans PATH, `ps` ne se lance pas : aucune commande ne se lit.
  process.env.PATH = "";
  writeFileSync(fichier, String(app));
  assert.equal(prendreLaPlace(fichier, soi), app, "not known as another: kept");
  process.env.PATH = chemin;
  assert.equal(prendreLaPlace(fichier, soi), undefined, "read, and launched otherwise: taken");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
});

test("the app's place: free when no file, its own pid or a dead one; held by a living app launched alike; taken from another process, or when the command cannot be read", (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  // Ce process-ci, vivant, demande la place ; `vivante` est une autre app, lancée comme lui.
  const soi = process.pid;
  const vivante = process.ppid;
  const commandes = new Map<number, string>([[soi, "Brigade"]]);
  const tourne = () => autreAppTourne(fichier, false, soi, "darwin", fauxPs(commandes));
  assert.equal(tourne(), false, "no file: the place is free");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  assert.equal(tourne(), false, "its own pid does not hold it");
  writeFileSync(fichier, String(4_000_002));
  commandes.set(4_000_002, "Brigade");
  assert.equal(tourne(), false, "a dead pid does not hold it");
  writeFileSync(fichier, String(vivante));
  assert.equal(tourne(), false, "ps cannot read the living pid: the place is taken");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(vivante));
  commandes.set(vivante, "Brigade --tray-fond");
  assert.equal(tourne(), false, "held by another process: taken");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(vivante));
  commandes.set(vivante, "Brigade");
  assert.equal(tourne(), true, "held by an app like this one: kept");
  assert.equal(readFileSync(fichier, "utf8"), String(vivante));
  commandes.delete(soi);
  assert.equal(tourne(), false, "ps cannot read this process: the place is taken");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
});

test("the app's place left with a pid now held by another process is taken; held by an app like this one, it is kept", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const icone = await lancer(t, "--tray-fond");
  const app = await lancer(t, "--une-app");
  const soi = await lancer(t, "--une-app");
  writeFileSync(fichier, String(icone));
  assert.equal(autreAppTourne(fichier, false, soi), false, "the icon does not hold the app's place");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(app));
  assert.equal(autreAppTourne(fichier, false, soi), true, "another app holds it");
  assert.equal(readFileSync(fichier, "utf8"), String(app));
});

test("by default, a place is held only by a process launched like the one asking: the icon's pid given to the app does not keep the icon away", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "tray.pid");
  const app = await lancer(t, "--une-app");
  const icone = await lancer(t, "--tray-fond");
  const soi = await lancer(t, "--tray-fond");
  writeFileSync(fichier, String(app));
  assert.equal(prendreLaPlace(fichier, soi), undefined, "the app does not hold the icon's place");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(icone));
  assert.equal(prendreLaPlace(fichier, soi), icone, "another icon holds it");
});

test("the app hands off only when Electron refuses its lock and its place is held by an app like it; with the lock, no command line is read", (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  // Le pid laissé dans la place : celui du process qui joue ce test, vivant.
  const laisse = process.pid;
  const soi = 4_000_003;
  const commandes = new Map<number, string>([[soi, "Brigade"], [laisse, "Brigade"]]);
  const lus: number[] = [];
  const ps = fauxPs(commandes, lus);
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, true, soi, "darwin", ps), false, "the lock given: no other app runs");
  assert.deepEqual(lus, [], "and no command line is read");
  assert.equal(readFileSync(fichier, "utf8"), String(soi), "the place is taken");
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, false, soi, "darwin", ps), true, "the lock refused, the place held by an app like this one: hand off");
  assert.equal(readFileSync(fichier, "utf8"), String(laisse));
  commandes.set(laisse, "Brigade --tray-fond");
  assert.equal(autreAppTourne(fichier, false, soi, "darwin", ps), false, "the lock refused, the place held by the icon process: the window shows");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  commandes.delete(laisse);
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, false, soi, "darwin", ps), false, "the lock refused, the holder's command unreadable: the window shows");
});

test("the command line is read by ps on POSIX, and by PowerShell on Windows without a console window flashing at each start", (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const laisse = process.pid;
  const soi = 4_000_005;
  const appels: { commande: string; args: string[]; windowsHide: boolean | undefined }[] = [];
  const lancer = (sortie: string) => (commande: string, args: string[], options: { windowsHide?: boolean }) => {
    appels.push({ commande, args, windowsHide: options.windowsHide });
    return sortie;
  };
  const tourne = (plateforme: NodeJS.Platform, ps: (commande: string, args: string[], options: { windowsHide?: boolean }) => string) => {
    writeFileSync(fichier, String(laisse));
    return autreAppTourne(fichier, false, soi, plateforme, ps);
  };
  assert.equal(tourne("win32", lancer("C:\\Brigade\\Brigade.exe\r\n")), true, "both read alike by PowerShell: hand off");
  assert.equal(appels[0]?.commande, "powershell.exe");
  assert.match(appels[0]?.args.join(" ") ?? "", new RegExp(`ProcessId=${laisse}\\b`));
  assert.equal(appels[0]?.windowsHide, true, "no console window on Windows");
  appels.length = 0;
  assert.equal(tourne("darwin", lancer("/Applications/Brigade.app/Contents/MacOS/Brigade\n")), true, "both read alike by ps: hand off");
  assert.deepEqual([appels[0]?.commande, ...(appels[0]?.args ?? [])], ["ps", "-ww", "-o", "command=", "-p", String(laisse)]);
  assert.equal(appels[0]?.windowsHide, undefined);
  assert.equal(tourne("darwin", lancer("  \n")), false, "an empty answer is a command that cannot be read: the window shows");
  assert.equal(tourne("darwin", () => { throw new Error("ps: no such process"); }), false, "nor a failed read");
});
