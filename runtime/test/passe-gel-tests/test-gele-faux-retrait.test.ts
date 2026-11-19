// Le retrait d'un cas gelé faux (#3799), et ce qu'il fait quand il ne peut pas
// se faire : un fichier gelé illisible, un cas qui ne se découpe pas, un
// fichier dont les cas ne se lisent pas. Le commit qu'il écrit tient le gel.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { violationsDuGel } from "../../src/passe-gel-tests/gel-tests.ts";
import { corrigerLesTestsGeles } from "../../src/passe-gel-tests/gele-faux.ts";
import { ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const ENTETE = 'import { test } from "node:test";\n';
const BON = 'test("adds two numbers", () => {\n  assert.equal(somme(2, 3), 5);\n});\n';
const FAUX = 'test("somme is a function", () => {\n  // a ) in a comment\n  assert.equal(typeof somme, "function", "a ) in a string");\n});\n';

const lancerGit = async (args: string[], worktree: string) => {
  try {
    return { code: 0, stdout: execFileSync("git", args, { cwd: worktree, env: ENV_GIT, encoding: "utf8" }), stderr: "" };
  } catch (erreur) {
    return { code: 1, stdout: "", stderr: String((erreur as { stderr?: unknown }).stderr ?? erreur) };
  }
};

// Une branche dont le premier commit gèle `test/a.test.ts`.
function branche(t: TestContext, gele: string): string {
  const dossier = repertoireTemporaire(t);
  git(dossier, "init", "-q", "-b", "main");
  writeFileSync(join(dossier, "README.md"), "base\n");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "base");
  git(dossier, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dossier, "checkout", "-q", "-b", "livraison");
  mkdirSync(join(dossier, "test"));
  writeFileSync(join(dossier, "test", "a.test.ts"), gele);
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "test(#41): frozen acceptance tests", "-m", "Acceptance-Tests: frozen");
  return dossier;
}

const rejeu = (nom: string | null) => ({ fichier: "test/a.test.ts", nom, main: true, branche: true });

test("a wrong case is cut out of its frozen file, whole and alone, parentheses in its strings and comments included", async (t) => {
  for (const [gele, reste] of [
    [ENTETE + BON + FAUX, ENTETE + BON],
    [ENTETE + FAUX + BON, ENTETE + BON],
  ] as const) {
    const dossier = branche(t, gele);
    const correction = await corrigerLesTestsGeles([rejeu("somme is a function")], { worktree: dossier, ticket: 41, base: "main", git: lancerGit });
    assert.ok("retires" in correction, JSON.stringify(correction));
    assert.equal(readFileSync(join(dossier, "test", "a.test.ts"), "utf8"), reste);
  }
  const ouvert = branche(t, `${ENTETE + BON}test("somme is a function", () => {\n`);
  const correction = await corrigerLesTestsGeles([rejeu("somme is a function")], { worktree: ouvert, ticket: 41, base: "main", git: lancerGit });
  assert.ok("echec" in correction, "a call that never closes is not cut");
});

test("the wrong case is dropped by a commit of the manager carrying the amendment trailer, which holds the freeze", async (t) => {
  const dossier = branche(t, ENTETE + BON + FAUX);
  const correction = await corrigerLesTestsGeles([rejeu("somme is a function")], { worktree: dossier, ticket: 41, base: "main", git: lancerGit });
  assert.ok("retires" in correction, JSON.stringify(correction));
  assert.equal(readFileSync(join(dossier, "test", "a.test.ts"), "utf8"), ENTETE + BON);
  assert.match(git(dossier, "log", "-1", "--format=%ae%n%B"), /^manager@brigade\.localhost\n[\s\S]*Amendment: #41/);
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});

test("a frozen file left with no case, or whose cases cannot be read, sets the ticket aside with the reason in one line; nothing is committed", async (t) => {
  for (const [gele, faux] of [
    [ENTETE + FAUX, [rejeu("somme is a function")]],
    [ENTETE + "await import('./x.ts');\n", [rejeu(null)]],
  ] as const) {
    const dossier = branche(t, gele);
    const tete = git(dossier, "rev-parse", "HEAD");
    const correction = await corrigerLesTestsGeles(faux, { worktree: dossier, ticket: 41, base: "main", git: lancerGit });
    assert.ok("ecarte" in correction, JSON.stringify(correction));
    assert.match(correction.ecarte, /already passes on `main`/);
    assert.equal(correction.ecarte.includes("\n"), false);
    assert.equal(git(dossier, "rev-parse", "HEAD"), tete);
  }
});

test("a frozen file that cannot be read, or a case that cannot be cut, is a failure said in words: nothing is written nor committed", async (t) => {
  const dossier = branche(t, ENTETE + BON + FAUX);
  const tete = git(dossier, "rev-parse", "HEAD");
  const illisible = await corrigerLesTestsGeles([{ ...rejeu("x"), fichier: "test/absent.test.ts" }], { worktree: dossier, ticket: 41, base: "main", git: lancerGit });
  assert.match("echec" in illisible ? illisible.echec : "", /cannot be read/);
  const introuvable = await corrigerLesTestsGeles([rejeu("not in the file")], { worktree: dossier, ticket: 41, base: "main", git: lancerGit });
  assert.match("echec" in introuvable ? introuvable.echec : "", /could not be cut/);
  assert.equal(git(dossier, "rev-parse", "HEAD"), tete);
  assert.equal(git(dossier, "status", "--porcelain"), "");
});
