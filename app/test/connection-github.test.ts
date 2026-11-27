// Connecter cet ordinateur à GitHub d'un bouton (#1434) : le geste de l'app (`signInToGitHub`), lancé tel quel,
// sans terminal. Le code que `gh` donne revient à la vue ; sa page s'ouvre — par `gh` quand il attend Entrée, par
// l'app sinon ; la fin, réussie ou non, est dite. Un second clic pendant qu'il attend ne lance rien de plus.
// Contre un faux `gh` qui écrit ce que le vrai écrit, et attend qu'on le laisse finir.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { holdConnectionGitHub, signInToGitHub, type EndOfConnection } from "../src/connection-github.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const directory = (t: TestContext) => {
  const created = mkdtempSync(join(tmpdir(), "brigade-app-connexion-"));
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

// `interactif` : il attend Entrée pour ouvrir la page lui-même, et note ce qu'il a lu ; sinon, il donne l'adresse.
function oneFakeGh(t: TestContext, { interactif, code = 0, sansCode: withoutCode = false, parole = "First copy your one-time code: A1B2-C3D4" }: { interactif: boolean; code?: number; sansCode?: boolean; parole?: string }) {
  const folder = directory(t);
  const gh = join(folder, "gh");
  const page = interactif ? 'printf "Press Enter to open https://github.com/login/device in your browser... " >&2\nread ligne\necho "entree" >> "$D/lu"' : 'echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2';
  const gives = withoutCode ? 'echo "error connecting to api.github.com" >&2\nexit 1' : `printf '\\033[0;33m!\\033[0m \\033[1m${parole}\\033[0m\\n' >&2\n${page}`;
  writeFileSync(gh, `#!/bin/sh\nD="${folder}"\necho "$@" >> "$D/appels"\n${gives}\nwhile [ ! -f "$D/fin" ]; do sleep 0.05; done\necho "✓ Logged in as chef" >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  const lines = (file: string) => (existsSync(join(folder, file)) ? readFileSync(join(folder, file), "utf8").trim().split("\n") : []);
  return { gh, appels: () => lines("appels"), lu: () => lines("lu"), finir: () => writeFileSync(join(folder, "fin"), "") };
}

function oneConnection(gh: string) {
  const openEntries: string[] = [];
  const ends: EndOfConnection[] = [];
  const connect = holdConnectionGitHub({ commande: async () => signInToGitHub(gh), env: process.env, ouvrir: (address) => openEntries.push(address), apres: (end) => ends.push(end) });
  return { connecter: connect, ouvertes: openEntries, fins: ends };
}

test("le libellé récent de `gh` (« One-time code (ABCD-1234) copied to clipboard ») est lu, la page ouverte par l'app", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { interactif: false, parole: "One-time code (67C7-98FD) copied to clipboard" });
  const { connecter: connect, ouvertes: openEntries } = oneConnection(fake.gh);
  assert.deepEqual(await connect(), { code: "67C7-98FD", page: "https://github.com/login/device" });
  assert.deepEqual(openEntries, ["https://github.com/login/device"]);
  fake.finir();
});

test("`gh` attend Entrée : l'app la lui donne — il ouvre la page —, le code revient sans ses couleurs ; fini, c'est dit", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { interactif: true });
  const { connecter: connect, ouvertes: openEntries, fins: ends } = oneConnection(fake.gh);
  assert.deepEqual(await connect(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(fake.appels(), [signInToGitHub(fake.gh).slice(1).join(" ")]);
  assert.deepEqual(fake.appels(), ["auth login --hostname github.com --web --git-protocol https"]);
  await until(() => fake.lu().length === 1);
  assert.deepEqual(openEntries, []);
  // Un second clic pendant qu'il attend : le même code, rien de lancé de plus.
  assert.deepEqual(await connect(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.equal(fake.appels().length, 1);
  fake.finir();
  await until(() => ends.length === 1);
  assert.deepEqual(ends, [{ connecte: true }]);
});

test("`gh` sans terminal donne l'adresse : c'est l'app qui ouvre la page", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { interactif: false });
  const { connecter: connect, ouvertes: openEntries, fins: ends } = oneConnection(fake.gh);
  assert.deepEqual(await connect(), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(openEntries, ["https://github.com/login/device"]);
  fake.finir();
  await until(() => ends.length === 1);
  // Fini, un clic relance.
  const relaunch = oneFakeGh(t, { interactif: false, code: 1 });
  relaunch.finir();
  const suite = oneConnection(relaunch.gh);
  assert.equal("code" in (await suite.connecter()), true);
  await until(() => suite.fins.length === 1);
  assert.deepEqual(suite.fins, [{ refus: "GitHub sign-in did not finish (code 1): ✓ Logged in as chef.", detail: "! First copy your one-time code: A1B2-C3D4\nOpen this URL to continue in your web browser: https://github.com/login/device\n✓ Logged in as chef" }]);
});

test("un `gh` qui échoue avant de donner un code, ou absent : le refus en une phrase, le détail à part", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { interactif: false, sansCode: true });
  assert.deepEqual(await oneConnection(fake.gh).connecter(), { refus: "GitHub sign-in did not start (code 1): error connecting to api.github.com.", detail: "error connecting to api.github.com" });
  const absent = join(directory(t), "gh");
  const rendered = await oneConnection(absent).connecter();
  assert.equal("refus" in rendered && rendered.refus, `The GitHub CLI (\`${absent}\`) is not installed on this computer, so brigade cannot sign you in to GitHub.`);
});
