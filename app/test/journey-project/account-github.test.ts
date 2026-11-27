// Le compte GitHub de cet ordinateur, lu par le process principal pour l'étape du compte (#2475,
// connection-github.ts) : la question posée à un `gh` (`gh api user --jq .login`), son échec lu par l'app
// (`failureOfGh`). Un login, aucun compte — l'étape à faire, pas une panne —, ou pourquoi il ne se lit pas.
// Contre un faux `gh` qui répond comme le vrai.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { failureOfGh, readTheAccountGitHub } from "../../src/connection-github.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const directory = (t: TestContext) => {
  const created = mkdtempSync(join(tmpdir(), "brigade-app-compte-"));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
};

// Un faux `gh` : il note ses arguments, écrit `sortie` et `erreurs`, et sort avec `code`.
function oneFakeGh(t: TestContext, { sortie: output = "", erreurs: errors = "", code = 0 }: { sortie?: string; erreurs?: string; code?: number }) {
  const folder = directory(t);
  const gh = join(folder, "gh");
  writeFileSync(join(folder, "sortie"), output);
  writeFileSync(join(folder, "erreurs"), errors);
  writeFileSync(gh, `#!/bin/sh\nD="${folder}"\necho "$@" > "$D/appel"\ncat "$D/sortie"\ncat "$D/erreurs" >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return { gh, appel: () => readFileSync(join(folder, "appel"), "utf8").trim() };
}

const read = (gh: string) => readTheAccountGitHub({ gh, env: process.env, echecDeGh: failureOfGh });

test("connecté : le login que `gh api user` rend, sans rien demander au terminal", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { sortie: "octo-chef\n" });
  assert.deepEqual(await read(fake.gh), { login: "octo-chef" });
  assert.equal(fake.appel(), "api user --jq .login");
});

test("aucun compte : ni panne ni raison — l'étape du compte offre de se connecter", { skip: WITHOUT_POSIX }, async (t) => {
  const fake = oneFakeGh(t, { erreurs: "To get started with GitHub CLI, please run:  gh auth login\n", code: 4 });
  assert.deepEqual(await read(fake.gh), { nonConnecte: true });
  const refuses = oneFakeGh(t, { erreurs: "HTTP 401: Bad credentials (https://api.github.com/user)\n", code: 1 });
  assert.deepEqual(await read(refuses.gh), { nonConnecte: true });
});

test("illisible : la raison en une phrase, ce que `gh` a dit à part, et la page qui la lève quand il en est une", { skip: WITHOUT_POSIX }, async (t) => {
  const absent = join(directory(t), "gh");
  const withoutGh = await read(absent);
  assert.equal("refus" in withoutGh && withoutGh.refus, `The GitHub CLI (\`${absent}\`) is not installed on this computer, and brigade reads your GitHub account through it.`);
  assert.equal("lien" in withoutGh && withoutGh.lien, "https://cli.github.com");
  const withoutNetwork = oneFakeGh(t, { erreurs: "error connecting to api.github.com\n", code: 1 });
  assert.deepEqual(await read(withoutNetwork.gh), {
    refus: "GitHub cannot be reached from this computer, so your GitHub account could not be read: check its network connection.",
    detail: "error connecting to api.github.com",
  });
  const other = oneFakeGh(t, { erreurs: "HTTP 500: something broke\n", code: 1 });
  assert.deepEqual(await read(other.gh), { refus: "GitHub did not say which account this computer is connected to.", detail: "HTTP 500: something broke" });
});
