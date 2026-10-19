// Le login de la station de cet ordinateur : `claude auth login`, le binaire officiel et lui seul,
// un à la fois. Contre un faux `claude` qui note ses arguments et attend qu'on le laisse finir.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gistLocal, LANCE, tenirLogin } from "../../src/pannes/login.ts";

const repertoire = (t: TestContext) => {
  const cree = mkdtempSync(join(tmpdir(), "brigade-app-login-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
};

// Un fait, attendu : jamais une durée. La garde ne sert qu'à ce qu'un test cassé le dise.
async function jusqua(fait: () => boolean, garde = 60_000) {
  const fin = Date.now() + garde;
  while (!fait()) {
    if (Date.now() > fin) assert.fail("le fait attendu n'est pas arrivé");
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
}

function unFauxClaude(t: TestContext, code = 0) {
  const dossier = repertoire(t);
  const claude = join(dossier, "claude");
  writeFileSync(claude, `#!/bin/sh\necho "$@" >> "${dossier}/appels"\nwhile [ ! -f "${dossier}/fin" ]; do sleep 0.05; done\necho "Login failed: timed out"\nexit ${code}\n`);
  chmodSync(claude, 0o755);
  // Le shell crée le fichier avant d'y écrire la ligne : lu entre les deux, il est vide, et une
  // ligne vide n'est pas un appel.
  return { claude, appels: () => (existsSync(join(dossier, "appels")) ? readFileSync(join(dossier, "appels"), "utf8").split("\n").filter(Boolean) : []), finir: () => writeFileSync(join(dossier, "fin"), "") };
}

test("le bouton lance `claude auth login` une fois ; un second clic pendant qu'il attend ne lance rien de plus ; fini, la station est relue", async (t) => {
  const faux = unFauxClaude(t);
  const dit: string[] = [];
  let relues = 0;
  const login = tenirLogin({ claude: faux.claude, env: process.env, dire: (ligne) => dit.push(ligne), apres: () => relues++ });
  assert.deepEqual(await login(), { fait: LANCE });
  await jusqua(() => faux.appels().length === 1);
  assert.deepEqual(await login(), { fait: `a login is already open: ${LANCE}` });
  assert.deepEqual(faux.appels(), ["auth login"]);
  faux.finir();
  await jusqua(() => relues === 1);
  assert.deepEqual(dit, ["brigade: Max login done on this computer — its station sees it within the minute"]);
  // Fini, un clic le relance.
  assert.deepEqual(await login(), { fait: LANCE });
  await jusqua(() => faux.appels().length === 2);
  await jusqua(() => relues === 2);
});

test("un login qui échoue se dit au terminal de l'app ; un `claude` absent est refusé en une ligne", async (t) => {
  const faux = unFauxClaude(t, 1);
  faux.finir();
  const dit: string[] = [];
  let relues = 0;
  assert.deepEqual(await tenirLogin({ claude: faux.claude, env: process.env, dire: (ligne) => dit.push(ligne), apres: () => relues++ })(), { fait: LANCE });
  await jusqua(() => relues === 1);
  assert.deepEqual(dit, ["brigade: Max login on this computer did not finish (code 1) — Login failed: timed out"]);
  const absent = await tenirLogin({ claude: join(repertoire(t), "claude"), env: process.env, dire: () => {} })();
  assert.ok("refus" in absent);
  assert.match(absent.refus, /^the login was not launched: Claude Code could not be started on this computer/);
});

test("le gist de la station de cet ordinateur se lit là où elle le garde ; sans lui, aucune station n'est d'ici", (t) => {
  const racine = repertoire(t);
  assert.equal(gistLocal(racine), null);
  writeFileSync(join(racine, "appairage.json"), JSON.stringify({ gist: "abc123", appairee: true }));
  assert.equal(gistLocal(racine), "abc123");
  writeFileSync(join(racine, "appairage.json"), "{");
  assert.equal(gistLocal(racine), null);
});
