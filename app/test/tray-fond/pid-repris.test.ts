// #4071 — Le pid laissé par l'app quittée est rendu à un autre process (l'icône de fond, l'hôte de la station) : la place
// n'est tenue que par un process lancé comme celui qui la demande, sinon l'app rouverte passait la main et ne montrait rien.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { autreAppTourne, lireLaCommande, memeProcess, prendreLaPlace } from "../../src/tray-fond/instance.ts";

const SOUS_POSIX: string | false = process.platform === "win32" ? "the command line is read with ps, which Windows does not have" : false;

function lancer(t: TestContext, ...args: string[]): number {
  const enfant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", ...args], { stdio: "ignore" });
  t.after(() => enfant.kill("SIGKILL"));
  return enfant.pid ?? assert.fail("no pid");
}

test("two living processes launched with the same command are the same; another command, or a dead one, is not", { skip: SOUS_POSIX }, async (t) => {
  const une = lancer(t, "--une-app");
  const autre = lancer(t, "--une-app");
  const icone = lancer(t, "--tray-fond");
  await jusqua(() => memeProcess(une, autre, lireLaCommande), 5_000);
  assert.equal(memeProcess(une, autre, lireLaCommande), true);
  assert.equal(memeProcess(icone, autre, lireLaCommande), false);
  assert.equal(memeProcess(4_000_000, autre, lireLaCommande), false, "a dead process has no command line");
});

test("a process launched like this one is the same; another command, or one that cannot be read, is not", () => {
  const commandes = new Map<number, string>([
    [1, "/Applications/Brigade.app/Contents/MacOS/Brigade"],
    [2, "/Applications/Brigade.app/Contents/MacOS/Brigade -psn_0_12345"],
    [3, "/Applications/Brigade.app/Contents/MacOS/Brigade --tray-fond"],
    [4, "/usr/local/bin/node /Users/chef/.brigade/runtime/src/station/principal.ts"],
    [5, "C:\\Program Files\\Brigade\\Brigade.exe"],
    [6, '"C:\\Program Files\\Brigade\\Brigade.exe"'],
  ]);
  const lire = (pid: number) => commandes.get(pid);
  assert.equal(memeProcess(2, 1, lire), true, "the same app, launched by the old LaunchServices");
  assert.equal(memeProcess(1, 2, lire), true);
  assert.equal(memeProcess(3, 1, lire), false, "the icon process of the same bundle is not the app");
  assert.equal(memeProcess(4, 1, lire), false, "the station host is not the app");
  assert.equal(memeProcess(6, 5, lire), true, "the same app, its binary quoted by a Windows shortcut");
  assert.equal(memeProcess(9, 1, lire), false, "a command that cannot be read proves nothing");
  assert.equal(memeProcess(1, 9, lire), false);
});

test("by default, a place held by a living process whose command cannot be read stays held: an unreadable command proves nothing", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "tray.pid");
  const app = lancer(t, "--une-app");
  const soi = lancer(t, "--tray-fond");
  await jusqua(() => lireLaCommande(app) !== undefined && lireLaCommande(soi) !== undefined, 5_000);
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

// Quand `ps` ne lit pas la commande, la place de l'app est prise : une seconde app peut s'ouvrir à côté d'une vivante, deux
// fenêtres plutôt qu'aucune (#4071).
test("the app's place: free when no file, its own pid or a dead one; held by a living app launched alike; taken from another process, or when the command cannot be read", (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const vivante = lancer(t, "--une-app");
  const soi = 4_000_001;
  const commandes = new Map<number, string>([[soi, "Brigade"]]);
  const lire = (pid: number) => commandes.get(pid);
  const estTenant = (pid: number) => memeProcess(pid, soi, lire);
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "no file: the place is free");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  assert.equal(prendreLaPlace(fichier, soi, () => true), undefined, "its own pid does not hold it");
  writeFileSync(fichier, String(4_000_002));
  assert.equal(prendreLaPlace(fichier, soi, () => true), undefined, "a dead pid does not hold it");
  writeFileSync(fichier, String(vivante));
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "ps cannot read the living pid: the place is taken");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(vivante));
  commandes.set(vivante, "Brigade --tray-fond");
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "held by another process: taken");
  writeFileSync(fichier, String(vivante));
  commandes.set(vivante, "Brigade");
  assert.equal(prendreLaPlace(fichier, soi, estTenant), vivante, "held by an app like this one: kept");
  assert.equal(readFileSync(fichier, "utf8"), String(vivante));
  commandes.delete(soi);
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "ps cannot read this process: the place is taken");
});

test("the app's place left with a pid now held by another process is taken; held by an app like this one, it is kept", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const icone = lancer(t, "--tray-fond");
  const app = lancer(t, "--une-app");
  const soi = lancer(t, "--une-app");
  const estTenant = (pid: number) => memeProcess(pid, soi, lireLaCommande);
  await jusqua(() => estTenant(app), 5_000);
  writeFileSync(fichier, String(icone));
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "the icon does not hold the app's place");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(app));
  assert.equal(prendreLaPlace(fichier, soi, estTenant), app, "another app holds it");
  assert.equal(readFileSync(fichier, "utf8"), String(app));
});

test("by default, a place is held only by a process launched like the one asking: the icon's pid given to the app does not keep the icon away", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "tray.pid");
  const app = lancer(t, "--une-app");
  const icone = lancer(t, "--tray-fond");
  const soi = lancer(t, "--tray-fond");
  await jusqua(() => memeProcess(icone, soi, lireLaCommande), 5_000);
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
  const lire = (pid: number) => {
    lus.push(pid);
    return commandes.get(pid);
  };
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, true, soi, lire), false, "the lock given: no other app runs");
  assert.deepEqual(lus, [], "and no command line is read");
  assert.equal(readFileSync(fichier, "utf8"), String(soi), "the place is taken");
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, false, soi, lire), true, "the lock refused, the place held by an app like this one: hand off");
  assert.equal(readFileSync(fichier, "utf8"), String(laisse));
  commandes.set(laisse, "Brigade --tray-fond");
  assert.equal(autreAppTourne(fichier, false, soi, lire), false, "the lock refused, the place held by the icon process: the window shows");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  commandes.delete(laisse);
  writeFileSync(fichier, String(laisse));
  assert.equal(autreAppTourne(fichier, false, soi, lire), false, "the lock refused, the holder's command unreadable: the window shows");
});

test("the command line is read by ps on POSIX, and by PowerShell on Windows without a console window flashing at each start", () => {
  const appels: { commande: string; args: string[]; windowsHide: boolean | undefined }[] = [];
  const lancer = (sortie: string) => (commande: string, args: string[], options: { windowsHide?: boolean }) => {
    appels.push({ commande, args, windowsHide: options.windowsHide });
    return sortie;
  };
  assert.equal(lireLaCommande(42, "win32", lancer("C:\\Brigade\\Brigade.exe\r\n")), "C:\\Brigade\\Brigade.exe");
  assert.equal(appels[0]?.commande, "powershell.exe");
  assert.match(appels[0]?.args.join(" ") ?? "", /ProcessId=42/);
  assert.equal(appels[0]?.windowsHide, true, "no console window on Windows");
  assert.equal(lireLaCommande(42, "darwin", lancer("/Applications/Brigade.app/Contents/MacOS/Brigade\n")), "/Applications/Brigade.app/Contents/MacOS/Brigade");
  assert.deepEqual([appels[1]?.commande, ...(appels[1]?.args ?? [])], ["ps", "-ww", "-o", "command=", "-p", "42"]);
  assert.equal(appels[1]?.windowsHide, undefined);
  assert.equal(lireLaCommande(42, "darwin", lancer("  \n")), undefined, "an empty answer is a command that cannot be read");
  assert.equal(lireLaCommande(42, "darwin", () => { throw new Error("ps: no such process"); }), undefined, "nor a failed read");
});
