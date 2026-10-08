// Les outils des tests qui jugent : un outil qui se trompe fait passer un test
// qui n'a rien vérifié.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { mort } from "./outils.ts";

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
