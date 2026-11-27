// Le login de la station de cet ordinateur : `claude auth login`, le binaire officiel et lui seul,
// un à la fois. Contre un faux `claude` qui note ses arguments et attend qu'on le laisse finir.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gistLocal, LAUNCHES, holdLogin } from "../../src/outages/login.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const directory = (t: TestContext) => {
  const created = mkdtempSync(join(tmpdir(), "brigade-app-login-"));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
};

// Un fait, attendu : jamais une durée. La garde ne sert qu'à ce qu'un test cassé le dise.
async function until(done: () => boolean, guard = 60_000) {
  const end = Date.now() + guard;
  while (!done()) {
    if (Date.now() > end) assert.fail("le fait attendu n'est pas arrivé");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function oneFakeClaude(t: TestContext, code = 0) {
  const folder = directory(t);
  const claude = join(folder, "claude");
  writeFileSync(claude, `#!/bin/sh\necho "$@" >> "${folder}/appels"\nwhile [ ! -f "${folder}/fin" ]; do sleep 0.05; done\necho "Login failed: timed out"\nexit ${code}\n`);
  chmodSync(claude, 0o755);
  return { claude, appels: () => (existsSync(join(folder, "appels")) ? readFileSync(join(folder, "appels"), "utf8").trim().split("\n") : []), finir: () => writeFileSync(join(folder, "fin"), "") };
}

test("le bouton lance `claude auth login` une fois ; un second clic pendant qu'il attend ne lance rien de plus ; fini, la station est relue", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeClaude(t);
  const said: string[] = [];
  let reread = 0;
  const login = holdLogin({ claude: fake.claude, env: process.env, dire: (line) => said.push(line), apres: () => reread++ });
  assert.deepEqual(await login(), { fait: LAUNCHES });
  await until(() => fake.appels().length === 1);
  assert.deepEqual(await login(), { fait: `a login is already open: ${LAUNCHES}` });
  assert.deepEqual(fake.appels(), ["auth login"]);
  fake.finir();
  await until(() => reread === 1);
  assert.deepEqual(said, ["brigade: Max login done on this computer — its station sees it within the minute"]);
  // Fini, un clic le relance.
  assert.deepEqual(await login(), { fait: LAUNCHES });
  await until(() => fake.appels().length === 2);
  await until(() => reread === 2);
});

test("un login qui échoue se dit au terminal de l'app ; un `claude` absent est refusé en une ligne", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeClaude(t, 1);
  fake.finir();
  const said: string[] = [];
  let reread = 0;
  assert.deepEqual(await holdLogin({ claude: fake.claude, env: process.env, dire: (line) => said.push(line), apres: () => reread++ })(), { fait: LAUNCHES });
  await until(() => reread === 1);
  assert.deepEqual(said, ["brigade: Max login on this computer did not finish (code 1) — Login failed: timed out"]);
  const absent = await holdLogin({ claude: join(directory(t), "claude"), env: process.env, dire: () => {} })();
  // Absent, il n'est plus « could not be started » : l'écran de l'outil manquant le prend (#4059).
  assert.deepEqual(absent, { outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" });
});

test("le gist de la station de cet ordinateur se lit là où elle le garde ; sans lui, aucune station n'est d'ici", (t) => {
  const root = directory(t);
  assert.equal(gistLocal(root), null);
  writeFileSync(join(root, "appairage.json"), JSON.stringify({ gist: "abc123", appairee: true }));
  assert.equal(gistLocal(root), "abc123");
  writeFileSync(join(root, "appairage.json"), "{");
  assert.equal(gistLocal(root), null);
});
