import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { amenderParLeManager } from "../../src/amendement/amender.ts";
import { violationsDuGel } from "../../src/passe-gel-tests/gel-tests.ts";
import { ENV_GIT, git } from "../outils.ts";

const GELE = "test/acceptance/41.test.ts";
const PETIT = JSON.stringify({ accepte_tout_l_ancien: true, change_ce_que_voit_l_utilisateur: false, raison: "A typo.", remplacer: "Exprot", par: "Export", changement: "the label reads Export" });

// Une branche dont le premier commit gèle le test, puis le commit que le vrai
// `amenderParLeManager` signe : l auteur vient du code de l amendement, pas du test.
async function brancheAmendee(t: TestContext): Promise<string> {
  const dossier = mkdtempSync(join(tmpdir(), "gel-amendement-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  git(dossier, "init", "-q", "-b", "main");
  writeFileSync(join(dossier, "README.md"), "base\n");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "base");
  git(dossier, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dossier, "checkout", "-q", "-b", "livraison");
  mkdirSync(join(dossier, "test", "acceptance"), { recursive: true });
  writeFileSync(join(dossier, GELE), "label: Exprot\n");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "acceptance tests", "-m", "Acceptance-Tests: frozen");
  const amender = amenderParLeManager({
    depotGitHub: "benomite/brigade",
    base: "main",
    depot: { connait: () => true, reprendre: async () => dossier, retirer: () => {}, pousser: () => {} },
    git: async (args, worktree) => {
      try {
        return { code: 0, stdout: execFileSync("git", args, { cwd: worktree, env: ENV_GIT, encoding: "utf8" }), stderr: "" };
      } catch (erreur) {
        return { code: 1, stdout: "", stderr: String(erreur) };
      }
    },
    lire: async () => ({ issue: { number: 41, title: "t", body: "b", labels: [] }, commentaires: [] }),
    manager: async () => ({ message: PETIT }),
  });
  const issue = await amender(41, "livraison", { test: GELE, ancien: "Exprot", nouveau: "Export", pourquoi: "typo" });
  assert.ok("applique" in issue, JSON.stringify(issue));
  return dossier;
}

function commitDe(dossier: string, auteur: string, contenu: string) {
  writeFileSync(join(dossier, GELE), contenu);
  git(dossier, "add", "-A");
  const env = { ...ENV_GIT, GIT_AUTHOR_NAME: auteur, GIT_COMMITTER_NAME: auteur };
  execFileSync("git", ["commit", "-q", "-m", "touch", "-m", "Amendment: #41"], { cwd: dossier, env, stdio: "pipe" });
}

test("le garde du gel accepte le commit que signe le vrai code d amendement", async (t) => {
  const dossier = await brancheAmendee(t);
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});

test("le garde du gel accepte toujours les auteurs manager et manager[bot], avec l amendement", async (t) => {
  const dossier = await brancheAmendee(t);
  commitDe(dossier, "manager", "label: un\n");
  commitDe(dossier, "manager[bot]", "label: deux\n");
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});

for (const auteur of ["someone else", "evil manager"]) {
  test(`le garde du gel refuse l auteur ${auteur}, et seulement lui`, async (t) => {
    const dossier = await brancheAmendee(t);
    commitDe(dossier, auteur, "label: Autre\n");
    const autre = git(dossier, "rev-parse", "HEAD");
    const violations = violationsDuGel(dossier, "origin/main");
    assert.deepEqual(violations.map(({ commit, fichiers }) => ({ commit, fichiers })), [{ commit: autre, fichiers: [GELE] }]);
  });
}

test("le garde du gel accepte le nom d auteur que signe le vrai code d amendement, sans l appui du courriel", async (t) => {
  const dossier = await brancheAmendee(t);
  const auteur = git(dossier, "log", "-1", "--format=%an");
  const env = { ...ENV_GIT, GIT_AUTHOR_NAME: auteur, GIT_COMMITTER_NAME: auteur, GIT_AUTHOR_EMAIL: "autre@example.test", GIT_COMMITTER_EMAIL: "autre@example.test" };
  writeFileSync(join(dossier, GELE), "label: Exporter\n");
  git(dossier, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "touch", "-m", "Amendment: #41"], { cwd: dossier, env, stdio: "pipe" });
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});
