// The per-test limit (#2084): a hanging test fails, named, with where it stopped; one that opted in
// for more keeps it. The limit is shortened by BRIGADE_TEST_TIMEOUT_MS; its default is 30 s. The
// guard wraps a stand-in runner here, on the test's clock: nothing waits, no Node is launched.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as garde from "./garde.ts";

const ICI = import.meta.dirname;
const { scripts } = JSON.parse(readFileSync(join(ICI, "../package.json"), "utf8")) as { scripts: { test: string } };

type Corps = () => unknown;

// What the guard hands to the runner, for each `(name, [options,] fn)` it is given.
function coureurDeDoublure(): { test: (...args: unknown[]) => void; corps: Map<string, Corps> } {
  const corps = new Map<string, Corps>();
  const original = (titre: string, ...reste: unknown[]): void => {
    corps.set(titre, reste.find((a) => typeof a === "function") as Corps);
  };
  return { test: garde.enveloppe(original) as (...args: unknown[]) => void, corps };
}

// Where a body stands once every callback already due has run: the clock is the test's, nothing else waits.
async function reglee(p: Promise<unknown>): Promise<string> {
  let etat = "en cours";
  p.then(
    () => (etat = "réussi"),
    (e: Error) => (etat = `échoué : ${e.message}`),
  );
  await new Promise((r) => setImmediate(r));
  return etat;
}

test("a hanging test fails at the limit, naming file, title, where it is written and what it still held; an opted-in test and a quick one pass", async (t) => {
  const avant = process.env.BRIGADE_TEST_TIMEOUT_MS;
  process.env.BRIGADE_TEST_TIMEOUT_MS = "500";
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const enfant = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  try {
    const coureur = coureurDeDoublure();
    let finir: () => void = () => {};
    coureur.test("never resolves", () => new Promise(() => {}));
    coureur.test("opted in for longer", { timeout: 5000 }, () => new Promise<void>((r) => (finir = r)));
    coureur.test("quick", () => {});

    const suspendu = Promise.resolve(coureur.corps.get("never resolves")!());
    const long = Promise.resolve(coureur.corps.get("opted in for longer")!());
    assert.equal(await reglee(Promise.resolve(coureur.corps.get("quick")!())), "réussi");

    t.mock.timers.tick(499);
    assert.equal(await reglee(suspendu), "en cours", "not before its limit");
    t.mock.timers.tick(1);
    const sortie = await reglee(suspendu);
    assert.match(sortie, /^échoué : test timed out after 500 ms/);
    assert.match(sortie, /file:\s+\S*garde\.test\.ts/);
    assert.match(sortie, /test:\s+never resolves/);
    assert.match(sortie, /written at: .*garde\.test\.ts:\d+/);
    assert.match(sortie, new RegExp(`child process pid ${enfant.pid}`));

    t.mock.timers.tick(1500);
    assert.equal(await reglee(long), "en cours", "an opted-in test keeps its own limit, past the default");
    finir();
    assert.equal(await reglee(long), "réussi");
  } finally {
    enfant.kill();
    t.mock.timers.reset();
    if (avant === undefined) delete process.env.BRIGADE_TEST_TIMEOUT_MS;
    else process.env.BRIGADE_TEST_TIMEOUT_MS = avant;
  }
});

test("the suite's command preloads the guard, which every `node:test` import then reaches, and the default limit is 30 s", () => {
  assert.match(scripts.test, /--import \.\/test-hang-guard\/charger\.ts/);
  assert.equal(test, garde.test, "this file's `node:test` is the guard's: it is played with the preload, like the suite");
  assert.match(readFileSync(join(ICI, "garde.ts"), "utf8"), /const DEFAUT_MS = 30_000;/);
});
