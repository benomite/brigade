// #4071 — Le pid laissé par l'app quittée est rendu à un autre process (l'icône de fond, l'hôte de la station) : la place
// n'est tenue que par un process lancé comme celui qui la demande, sinon l'app rouverte passait la main et ne montrait rien.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { commandeDe, memeProcess, prendreLaPlace } from "../../src/tray-fond/instance.ts";

const SOUS_POSIX: string | false = process.platform === "win32" ? "the command line is read with ps, which Windows does not have" : false;

function lancer(t: TestContext, ...args: string[]): number {
  const enfant = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)", "--", ...args], { stdio: "ignore" });
  t.after(() => enfant.kill("SIGKILL"));
  return enfant.pid ?? assert.fail("no pid");
}

test("the command line of a living process is read; a dead one has none", { skip: SOUS_POSIX }, async (t) => {
  const pid = lancer(t, "--une-app");
  await jusqua(() => commandeDe(pid)?.includes("--une-app") === true, 5_000);
  assert.ok(commandeDe(pid)?.startsWith(process.execPath), `got: ${commandeDe(pid)}`);
  assert.equal(commandeDe(4_000_000), undefined);
});

test("a process launched like this one is the same; another command, or one that cannot be read, is not", () => {
  const commandes = new Map<number, string>([
    [1, "/Applications/Brigade.app/Contents/MacOS/Brigade"],
    [2, "/Applications/Brigade.app/Contents/MacOS/Brigade -psn_0_12345"],
    [3, "/Applications/Brigade.app/Contents/MacOS/Brigade --tray-fond"],
    [4, "/usr/local/bin/node /Users/chef/.brigade/runtime/src/station/principal.ts"],
  ]);
  const lire = (pid: number) => commandes.get(pid);
  assert.equal(memeProcess(2, 1, lire), true, "the same app, launched by the old LaunchServices");
  assert.equal(memeProcess(1, 2, lire), true);
  assert.equal(memeProcess(3, 1, lire), false, "the icon process of the same bundle is not the app");
  assert.equal(memeProcess(4, 1, lire), false, "the station host is not the app");
  assert.equal(memeProcess(9, 1, lire), false, "a command that cannot be read proves nothing");
  assert.equal(memeProcess(1, 9, lire), false);
});

test("the app's place left with a pid now held by another process is taken; held by an app like this one, it is kept", { skip: SOUS_POSIX }, async (t) => {
  const fichier = join(repertoireTemporaire(t), "app.pid");
  const icone = lancer(t, "--tray-fond");
  const app = lancer(t, "--une-app");
  const soi = lancer(t, "--une-app");
  await jusqua(() => [icone, app, soi].every((pid) => commandeDe(pid) !== undefined), 5_000);
  const estTenant = (pid: number) => memeProcess(pid, soi);
  writeFileSync(fichier, String(icone));
  assert.equal(prendreLaPlace(fichier, soi, estTenant), undefined, "the icon does not hold the app's place");
  assert.equal(readFileSync(fichier, "utf8"), String(soi));
  writeFileSync(fichier, String(app));
  assert.equal(prendreLaPlace(fichier, soi, estTenant), app, "another app holds it");
  assert.equal(readFileSync(fichier, "utf8"), String(app));
});
