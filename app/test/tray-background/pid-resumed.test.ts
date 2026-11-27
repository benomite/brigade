// #4071 — Le pid laissé par l'app quittée est rendu à un autre process (l'icône de fond, l'hôte de la station) : la place
// n'est tenue que par un process lancé comme celui qui la demande, sinon l'app rouverte passait la main et ne montrait rien.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { readTheCommand, sameProcess, takeThePlace } from "../../src/tray-background/instance.ts";

const UNDER_POSIX: string | false = process.platform === "win32" ? "the command line is read with ps, which Windows does not have" : false;

function launch(t: TestContext, ...args: string[]): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", ...args], { stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  return child.pid ?? assert.fail("no pid");
}

test("two living processes launched with the same command are the same; another command, or a dead one, is not", { skip: UNDER_POSIX }, async (t) => {
  const one = launch(t, "--une-app");
  const other = launch(t, "--une-app");
  const icon = launch(t, "--tray-fond");
  await jusqua(() => sameProcess(one, other, readTheCommand), 5_000);
  assert.equal(sameProcess(one, other, readTheCommand), true);
  assert.equal(sameProcess(icon, other, readTheCommand), false);
  assert.equal(sameProcess(4_000_000, other, readTheCommand), false, "a dead process has no command line");
});

test("a process launched like this one is the same; another command, or one that cannot be read, is not", () => {
  const commands = new Map<number, string>([
    [1, "/Applications/Brigade.app/Contents/MacOS/Brigade"],
    [2, "/Applications/Brigade.app/Contents/MacOS/Brigade -psn_0_12345"],
    [3, "/Applications/Brigade.app/Contents/MacOS/Brigade --tray-fond"],
    [4, "/usr/local/bin/node /Users/chef/.brigade/runtime/src/station/principal.ts"],
    [5, "C:\\Program Files\\Brigade\\Brigade.exe"],
    [6, '"C:\\Program Files\\Brigade\\Brigade.exe"'],
  ]);
  const read = (pid: number) => commands.get(pid);
  assert.equal(sameProcess(2, 1, read), true, "the same app, launched by the old LaunchServices");
  assert.equal(sameProcess(1, 2, read), true);
  assert.equal(sameProcess(3, 1, read), false, "the icon process of the same bundle is not the app");
  assert.equal(sameProcess(4, 1, read), false, "the station host is not the app");
  assert.equal(sameProcess(6, 5, read), true, "the same app, its binary quoted by a Windows shortcut");
  assert.equal(sameProcess(9, 1, read), false, "a command that cannot be read proves nothing");
  assert.equal(sameProcess(1, 9, read), false);
});

test("by default, a place held by a living process whose command cannot be read stays held: an unreadable command proves nothing", { skip: UNDER_POSIX }, async (t) => {
  const file = join(repertoireTemporaire(t), "tray.pid");
  const app = launch(t, "--une-app");
  const itself = launch(t, "--tray-fond");
  await jusqua(() => readTheCommand(app) !== undefined && readTheCommand(itself) !== undefined, 5_000);
  const path = process.env.PATH;
  t.after(() => (process.env.PATH = path));
  // Sans PATH, `ps` ne se lance pas : aucune commande ne se lit.
  process.env.PATH = "";
  writeFileSync(file, String(app));
  assert.equal(takeThePlace(file, itself), app, "not known as another: kept");
  process.env.PATH = path;
  assert.equal(takeThePlace(file, itself), undefined, "read, and launched otherwise: taken");
  assert.equal(readFileSync(file, "utf8"), String(itself));
});

// Quand `ps` ne lit pas la commande, la place de l'app est prise : une seconde app peut s'ouvrir à côté d'une vivante, deux
// fenêtres plutôt qu'aucune (#4071).
test("the app's place: free when no file, its own pid or a dead one; held by a living app launched alike; taken from another process, or when the command cannot be read", (t) => {
  const file = join(repertoireTemporaire(t), "app.pid");
  const alive = launch(t, "--une-app");
  const itself = 4_000_001;
  const commands = new Map<number, string>([[itself, "Brigade"]]);
  const read = (pid: number) => commands.get(pid);
  const isHolding = (pid: number) => sameProcess(pid, itself, read);
  assert.equal(takeThePlace(file, itself, isHolding), undefined, "no file: the place is free");
  assert.equal(readFileSync(file, "utf8"), String(itself));
  assert.equal(takeThePlace(file, itself, () => true), undefined, "its own pid does not hold it");
  writeFileSync(file, String(4_000_002));
  assert.equal(takeThePlace(file, itself, () => true), undefined, "a dead pid does not hold it");
  writeFileSync(file, String(alive));
  assert.equal(takeThePlace(file, itself, isHolding), undefined, "ps cannot read the living pid: the place is taken");
  assert.equal(readFileSync(file, "utf8"), String(itself));
  writeFileSync(file, String(alive));
  commands.set(alive, "Brigade --tray-fond");
  assert.equal(takeThePlace(file, itself, isHolding), undefined, "held by another process: taken");
  writeFileSync(file, String(alive));
  commands.set(alive, "Brigade");
  assert.equal(takeThePlace(file, itself, isHolding), alive, "held by an app like this one: kept");
  assert.equal(readFileSync(file, "utf8"), String(alive));
  commands.delete(itself);
  assert.equal(takeThePlace(file, itself, isHolding), undefined, "ps cannot read this process: the place is taken");
});

test("the app's place left with a pid now held by another process is taken; held by an app like this one, it is kept", { skip: UNDER_POSIX }, async (t) => {
  const file = join(repertoireTemporaire(t), "app.pid");
  const icon = launch(t, "--tray-fond");
  const app = launch(t, "--une-app");
  const itself = launch(t, "--une-app");
  const isHolding = (pid: number) => sameProcess(pid, itself, readTheCommand);
  await jusqua(() => isHolding(app), 5_000);
  writeFileSync(file, String(icon));
  assert.equal(takeThePlace(file, itself, isHolding), undefined, "the icon does not hold the app's place");
  assert.equal(readFileSync(file, "utf8"), String(itself));
  writeFileSync(file, String(app));
  assert.equal(takeThePlace(file, itself, isHolding), app, "another app holds it");
  assert.equal(readFileSync(file, "utf8"), String(app));
});

test("by default, a place is held only by a process launched like the one asking: the icon's pid given to the app does not keep the icon away", { skip: UNDER_POSIX }, async (t) => {
  const file = join(repertoireTemporaire(t), "tray.pid");
  const app = launch(t, "--une-app");
  const icon = launch(t, "--tray-fond");
  const itself = launch(t, "--tray-fond");
  await jusqua(() => sameProcess(icon, itself, readTheCommand), 5_000);
  writeFileSync(file, String(app));
  assert.equal(takeThePlace(file, itself), undefined, "the app does not hold the icon's place");
  assert.equal(readFileSync(file, "utf8"), String(itself));
  writeFileSync(file, String(icon));
  assert.equal(takeThePlace(file, itself), icon, "another icon holds it");
});

test("the command line is read by ps on POSIX, and by PowerShell on Windows without a console window flashing at each start", () => {
  const calls: { commande: string; args: string[]; windowsHide: boolean | undefined }[] = [];
  const launch = (output: string) => (command: string, args: string[], options: { windowsHide?: boolean }) => {
    calls.push({ commande: command, args, windowsHide: options.windowsHide });
    return output;
  };
  assert.equal(readTheCommand(42, "win32", launch("C:\\Brigade\\Brigade.exe\r\n")), "C:\\Brigade\\Brigade.exe");
  assert.equal(calls[0]?.commande, "powershell.exe");
  assert.match(calls[0]?.args.join(" ") ?? "", /ProcessId=42/);
  assert.equal(calls[0]?.windowsHide, true, "no console window on Windows");
  assert.equal(readTheCommand(42, "darwin", launch("/Applications/Brigade.app/Contents/MacOS/Brigade\n")), "/Applications/Brigade.app/Contents/MacOS/Brigade");
  assert.deepEqual([calls[1]?.commande, ...(calls[1]?.args ?? [])], ["ps", "-ww", "-o", "command=", "-p", "42"]);
  assert.equal(calls[1]?.windowsHide, undefined);
  assert.equal(readTheCommand(42, "darwin", launch("  \n")), undefined, "an empty answer is a command that cannot be read");
  assert.equal(readTheCommand(42, "darwin", () => { throw new Error("ps: no such process"); }), undefined, "nor a failed read");
});
