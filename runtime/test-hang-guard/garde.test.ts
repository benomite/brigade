// The per-test limit (#2084): a hanging test fails, named, with where it stopped; one that opted in
// for more keeps it. The limit is shortened by BRIGADE_TEST_TIMEOUT_MS; its default is 30 s.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ENV_ENFANT } from "../test/outils.ts";

const ICI = import.meta.dirname;
const { scripts } = JSON.parse(readFileSync(join(ICI, "../package.json"), "utf8")) as { scripts: { test: string } };

test("a hanging test fails at the limit, naming file, title and what it still held; an opted-in test and a quick one pass", () => {
  const fichier = join(ICI, "aides/suspendu.ts");
  const r = spawnSync(process.execPath, ["--import", join(ICI, "charger.ts"), "--test", "--test-force-exit", "--test-timeout=120000", fichier], {
    encoding: "utf8",
    env: { ...ENV_ENFANT, BRIGADE_TEST_TIMEOUT_MS: "500" },
    timeout: 60_000,
  });
  const sortie = r.stdout + r.stderr;
  assert.equal(r.status, 1, sortie);
  assert.match(sortie, /✖ never resolves/);
  assert.match(sortie, /test timed out after 500 ms/);
  assert.match(sortie, /file:\s+\S*aides\/suspendu\.ts/);
  assert.match(sortie, /test:\s+never resolves/);
  assert.match(sortie, /written at: \S*suspendu\.ts:\d+/);
  assert.match(sortie, /child process pid \d+/);
  assert.match(sortie, /✔ opted in for longer/);
  assert.match(sortie, /✔ quick/);
});

test("the suite's command preloads the guard, and the default limit is 30 s", () => {
  assert.match(scripts.test, /--import \.\/test-hang-guard\/charger\.ts/);
  assert.match(readFileSync(join(ICI, "garde.ts"), "utf8"), /const DEFAUT_MS = 30_000;/);
});
