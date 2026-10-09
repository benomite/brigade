// Les outils des tests qui jugent : un outil qui se trompe fait passer un test
// qui n'a rien vérifié.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fauxGh, mort } from "./outils.ts";

test("mort : un process terminé est mort", async () => {
  const enfant = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await once(enfant, "close");

  await mort(enfant.pid ?? Number.NaN);
});

test("mort : un pid qui n'en est pas un est une erreur, pas un process mort", async () => {
  // Ce que rend `Number(/pid=(\d+)/.exec(sortie)?.[1])` quand la sortie ne porte plus de pid.
  for (const pid of [Number.NaN, 0, -1, 1.5]) await assert.rejects(mort(pid), /pid illisible/);
});

test("mort : un process qu'on n'a pas le droit de sonder n'est pas mort", { skip: process.getuid?.() === 0 }, async () => {
  // Le pid 1 vit toujours, et n'est pas à nous : le sonder rend EPERM.
  await assert.rejects(mort(1), { code: "EPERM" });
});

test("fauxGh : des appels simultanés gardent chacun leur jeton, à tout instant", async (t) => {
  const gh = fauxGh(t);
  // Un appel n'est jamais lu sans son jeton, ni avec celui d'un autre.
  const apparies = () => {
    const appels = gh.appels();
    const jetons = gh.jetons();
    assert.deepEqual(appels.map((appel, i) => [appel[0], jetons[i]]), appels.map((appel) => [appel[0], `jeton-de-${appel[0]}`]));
    return appels.length;
  };
  const enfants = Array.from({ length: 12 }, (_, i) => spawn(gh.bin, [`appel-${i}`], { stdio: "ignore", env: { ...process.env, GH_TOKEN: `jeton-de-appel-${i}` } }));
  const finis = Promise.all(enfants.map((enfant) => once(enfant, "close")));
  let fini = false;
  void finis.then(() => (fini = true));

  while (!fini) {
    apparies();
    await new Promise((resoudre) => setImmediate(resoudre));
  }

  assert.equal(apparies(), enfants.length);
});
