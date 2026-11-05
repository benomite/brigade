// Le compte GitHub de cet ordinateur, lu par le process principal pour l'étape du compte (#2475,
// connexion-github.ts) : la question que le runtime pose déjà à un `gh` (`gh api user --jq .login`), son échec lu par
// le runtime (`echecDeGh`). Un login, aucun compte — l'étape à faire, pas une panne —, ou pourquoi il ne se lit pas.
// Contre un faux `gh` qui répond comme le vrai.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { lireLeCompteGitHub } from "../../src/connexion-github.ts";
import { SANS_POSIX } from "../aides/posix.ts";

const repertoire = (t: TestContext) => {
  const cree = mkdtempSync(join(tmpdir(), "brigade-app-compte-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
};

// Un faux `gh` : il note ses arguments, écrit `sortie` et `erreurs`, et sort avec `code`.
function unFauxGh(t: TestContext, { sortie = "", erreurs = "", code = 0 }: { sortie?: string; erreurs?: string; code?: number }) {
  const dossier = repertoire(t);
  const gh = join(dossier, "gh");
  writeFileSync(join(dossier, "sortie"), sortie);
  writeFileSync(join(dossier, "erreurs"), erreurs);
  writeFileSync(gh, `#!/bin/sh\nD="${dossier}"\necho "$@" > "$D/appel"\ncat "$D/sortie"\ncat "$D/erreurs" >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return { gh, appel: () => readFileSync(join(dossier, "appel"), "utf8").trim() };
}

const lire = (gh: string) => lireLeCompteGitHub({ gh, env: process.env, echecDeGh });

test("connecté : le login que `gh api user` rend, sans rien demander au terminal", { skip: SANS_POSIX }, async (t) => {
  const faux = unFauxGh(t, { sortie: "octo-chef\n" });
  assert.deepEqual(await lire(faux.gh), { login: "octo-chef" });
  assert.equal(faux.appel(), "api user --jq .login");
});

test("aucun compte : ni panne ni raison — l'étape du compte offre de se connecter", { skip: SANS_POSIX }, async (t) => {
  const faux = unFauxGh(t, { erreurs: "To get started with GitHub CLI, please run:  gh auth login\n", code: 4 });
  assert.deepEqual(await lire(faux.gh), { nonConnecte: true });
  const refuse = unFauxGh(t, { erreurs: "HTTP 401: Bad credentials (https://api.github.com/user)\n", code: 1 });
  assert.deepEqual(await lire(refuse.gh), { nonConnecte: true });
});

test("illisible : la raison en une phrase, ce que `gh` a dit à part, et la page qui la lève quand il en est une", { skip: SANS_POSIX }, async (t) => {
  const absent = join(repertoire(t), "gh");
  const sansGh = await lire(absent);
  assert.equal("refus" in sansGh && sansGh.refus, `The GitHub CLI (\`${absent}\`) is not installed on this computer, and brigade reads your GitHub account through it.`);
  assert.equal("lien" in sansGh && sansGh.lien, "https://cli.github.com");
  const sansReseau = unFauxGh(t, { erreurs: "error connecting to api.github.com\n", code: 1 });
  assert.deepEqual(await lire(sansReseau.gh), {
    refus: "GitHub cannot be reached from this computer, so your GitHub account could not be read: check its network connection.",
    detail: "error connecting to api.github.com",
  });
  const autre = unFauxGh(t, { erreurs: "HTTP 500: something broke\n", code: 1 });
  assert.deepEqual(await lire(autre.gh), { refus: "GitHub did not say which account this computer is connected to.", detail: "HTTP 500: something broke" });
});
