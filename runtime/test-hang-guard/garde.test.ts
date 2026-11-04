// The per-test limit (#2084): a hanging test fails, named, with where it stopped; one that opted in
// for more keeps it. The limit is shortened by BRIGADE_TEST_TIMEOUT_MS; its default is 30 s.
// Played in this process, on a runner that only calls the test's function: no child test process,
// and no wait longer than the limits it sets.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import garde, { enveloppe } from "./garde.ts";

const ICI = import.meta.dirname;
const { scripts } = JSON.parse(readFileSync(join(ICI, "../package.json"), "utf8")) as { scripts: { test: string } };

// A runner that plays the test it is given, as `node:test` would, and returns how it ended.
const jouer = enveloppe((...args: unknown[]) => (args.find((a) => typeof a === "function") as () => Promise<unknown>)()) as unknown as (...args: unknown[]) => Promise<unknown>;

test("a hanging test fails at the limit, naming file, title and what it still held; an opted-in test and a quick one pass", async (t) => {
  const avant = process.env.BRIGADE_TEST_TIMEOUT_MS;
  process.env.BRIGADE_TEST_TIMEOUT_MS = "50";
  t.after(() => (avant === undefined ? delete process.env.BRIGADE_TEST_TIMEOUT_MS : (process.env.BRIGADE_TEST_TIMEOUT_MS = avant)));
  const enfant = spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdio: ["pipe", "ignore", "ignore"] });
  t.after(() => enfant.kill("SIGKILL"));

  const echec = await jouer("never resolves", () => new Promise(() => {})).then(
    () => assert.fail("a test that never resolves passed"),
    (e: Error) => e.message,
  );
  assert.match(echec, /^test timed out after 50 ms/);
  assert.match(echec, new RegExp(`file:\\s+${process.argv[1]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(echec, /test:\s+never resolves/);
  assert.match(echec, /written at: .*garde\.test\.ts:\d+/);
  assert.match(echec, new RegExp(`child process pid ${enfant.pid}: ${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -e process\\.stdin\\.resume\\(\\)`));
  assert.match(echec, /pending resources: /);

  // Past the 50 ms limit, within the 400 ms it opted in for.
  assert.equal(await jouer("opted in for longer", { timeout: 400 }, () => new Promise((resolve) => setTimeout(() => resolve("passed"), 100))), "passed");
  assert.equal(await jouer("quick", () => "passed"), "passed");
});

test("the suite's command preloads the guard, every `node:test` of a test file is the guard's, and the default limit is 30 s", () => {
  assert.match(scripts.test, /--import \.\/test-hang-guard\/charger\.ts/);
  assert.equal(test, garde);
  assert.match(readFileSync(join(ICI, "garde.ts"), "utf8"), /const DEFAUT_MS = 30_000;/);
});
