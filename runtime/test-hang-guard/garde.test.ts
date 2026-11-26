// The per-test limit (#2084): a hanging test fails, named, with where it stopped; one that opted in
// for more keeps it. The limit is shortened by BRIGADE_TEST_TIMEOUT_MS; its default is 30 s.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { ENV_ENFANT } from "../test/outils.ts";
import { posixOnly } from "../test/support/plateforme.ts";

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

// #3847: a frozen acceptance test that reads a live PR through `gh` skips where `gh` is logged out
// (the CI, a bare clone), and runs where it is logged in (the station's pass). Every way of declaring
// a test skips — `test`, `it`, `test.todo` —, and a hook is not a test: it still runs.
test("a frozen acceptance test that calls gh skips when gh is logged out, and runs when it is logged in", { skip: posixOnly("a fake gh shell script") }, () => {
  const racine = mkdtempSync(join(tmpdir(), "garde-gh-"));
  const dossier = join(racine, "test/acceptation-1");
  mkdirSync(dossier, { recursive: true });
  const fichier = join(dossier, "lit-une-pr.test.ts");
  const lit = (quoi: string) => `() => { execFileSync("gh", ["pr", "view", "1"]); throw new Error("ran ${quoi}"); }`;
  writeFileSync(
    fichier,
    [
      'import { execFileSync } from "node:child_process";',
      'import test, { before, it } from "node:test";',
      'before(() => { console.log("hook ran"); });',
      `test("reads the PR", ${lit("test")});`,
      `it("reads the PR with it", ${lit("it")});`,
      `test.todo("reads the PR later", ${lit("todo")});`,
      "",
    ].join("\n"),
  );
  const jouer = (connecte: boolean) => {
    const bin = mkdtempSync(join(tmpdir(), "garde-gh-bin-"));
    writeFileSync(join(bin, "gh"), `#!/bin/sh\nexit ${connecte ? 0 : 1}\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const r = spawnSync(process.execPath, ["--import", join(ICI, "charger.ts"), "--test", "--test-force-exit", fichier], {
      encoding: "utf8",
      env: { ...ENV_ENFANT, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin` },
    });
    return { status: r.status, sortie: r.stdout + r.stderr };
  };
  const deconnecte = jouer(false);
  assert.equal(deconnecte.status, 0, deconnecte.sortie);
  for (const titre of ["reads the PR", "reads the PR with it", "reads the PR later"]) assert.match(deconnecte.sortie, new RegExp(`﹣ ${titre} \\(.*# gh is missing or logged out`));
  assert.match(deconnecte.sortie, /hook ran/);
  assert.doesNotMatch(deconnecte.sortie, /Error: ran/);
  const connecte = jouer(true);
  assert.equal(connecte.status, 1, connecte.sortie);
  assert.match(connecte.sortie, /✖ reads the PR \(/);
  assert.match(connecte.sortie, /✖ reads the PR with it/);
  assert.match(connecte.sortie, /Error: ran todo/);
  assert.match(connecte.sortie, /hook ran/);
});

// #4229: no step freezes a test any more, so the skip reason names a plain acceptance test; and the
// skip hangs on the login: logged out it skips with that reason, logged in the test runs.
test("the skip reason of a gh-reading acceptance test names no frozen test, and only a logged-out gh skips", { skip: posixOnly("a fake gh shell script") }, () => {
  const racine = mkdtempSync(join(tmpdir(), "garde-gh-"));
  const dossier = join(racine, "test/acceptation-2");
  mkdirSync(dossier, { recursive: true });
  const fichier = join(dossier, "lit-une-pr.test.ts");
  writeFileSync(
    fichier,
    ['import { execFileSync } from "node:child_process";', 'import test from "node:test";', 'test("reads the PR", () => { execFileSync("gh", ["pr", "view", "1"]); throw new Error("ran it"); });', ""].join("\n"),
  );
  const jouer = (connecte: boolean) => {
    const bin = mkdtempSync(join(tmpdir(), "garde-gh-bin-"));
    writeFileSync(join(bin, "gh"), `#!/bin/sh\nexit ${connecte ? 0 : 1}\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const r = spawnSync(process.execPath, ["--import", join(ICI, "charger.ts"), "--test", "--test-force-exit", fichier], {
      encoding: "utf8",
      env: { ...ENV_ENFANT, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin` },
    });
    return { status: r.status, sortie: r.stdout + r.stderr };
  };
  const deconnecte = jouer(false);
  assert.equal(deconnecte.status, 0, deconnecte.sortie);
  assert.match(deconnecte.sortie, /# gh is missing or logged out: this acceptance test reads GitHub through it/);
  assert.doesNotMatch(deconnecte.sortie, /frozen/);
  const connecte = jouer(true);
  assert.equal(connecte.status, 1, connecte.sortie);
  assert.match(connecte.sortie, /Error: ran it/);
  assert.doesNotMatch(connecte.sortie, /gh is missing or logged out/);
});
