// Une mise à jour arrête l'unité du runtime pendant que des cooks tournent :
// l'unité ne doit signaler que le process du runtime. Avec `control-group`,
// systemd envoie SIGTERM à tout le cgroup — les relais et les cooks que le
// runtime lâche pour qu'ils survivent — et ils sortent en code 143 (#704).
// La reprise elle-même se prouve ailleurs (`reprise.test.ts`, `main.test.ts`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const UNITE = join(import.meta.dirname, "../deploy/brigade@.service");

test("l'unité du runtime ne signale que son process à l'arrêt : les cooks en vol ne reçoivent aucun SIGTERM", () => {
  const modes = readFileSync(UNITE, "utf8")
    .split("\n")
    .filter((ligne) => /^\s*KillMode\s*=/.test(ligne))
    .map((ligne) => ligne.split("=")[1]?.trim());
  assert.deepEqual(modes, ["process"]);
});
