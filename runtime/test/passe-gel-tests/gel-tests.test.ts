import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { motifDuGel, violationsDuGel } from "../../src/passe-gel-tests/gel-tests.ts";
import { ENV_GIT, git } from "../outils.ts";

// Une branche : un commit de base, puis le commit gelé du cook.
function branche(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "gel-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  git(dossier, "init", "-q", "-b", "main");
  writeFileSync(join(dossier, "README.md"), "base\n");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "base");
  git(dossier, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dossier, "checkout", "-q", "-b", "livraison");
  mkdirSync(join(dossier, "test"));
  writeFileSync(join(dossier, "test", "a.test.ts"), "un\n");
  writeFileSync(join(dossier, "test", "b.test.ts"), "deux\n");
  valider(dossier, "acceptance tests", "cook", "Acceptance-Tests: frozen");
  return dossier;
}

function valider(dossier: string, sujet: string, auteur: string, trailer?: string) {
  git(dossier, "add", "-A");
  const env = { ...ENV_GIT, GIT_AUTHOR_NAME: auteur, GIT_COMMITTER_NAME: auteur };
  execFileSync("git", ["commit", "-q", "-m", sujet, ...(trailer === undefined ? [] : ["-m", trailer])], { cwd: dossier, env, stdio: "pipe" });
}

const verdict = (dossier: string) => motifDuGel(violationsDuGel(dossier, "origin/main"));

test("un test gelé modifié renvoie la livraison, avec la raison de la fiche", (t) => {
  const dossier = branche(t);
  writeFileSync(join(dossier, "test", "a.test.ts"), "changé\n");
  valider(dossier, "touch", "cook");
  const motif = verdict(dossier);
  assert.ok(motif !== null && motif.startsWith("a frozen acceptance test was modified"));
  assert.match(motif, /test\/a\.test\.ts/);
});

test("un test gelé supprimé ou renommé renvoie la livraison", (t) => {
  const supprime = branche(t);
  rmSync(join(supprime, "test", "a.test.ts"));
  valider(supprime, "rm", "cook");
  assert.match(verdict(supprime) ?? "", /test\/a\.test\.ts/);

  const renomme = branche(t);
  renameSync(join(renomme, "test", "b.test.ts"), join(renomme, "test", "c.test.ts"));
  valider(renomme, "mv", "cook");
  assert.match(verdict(renomme) ?? "", /test\/b\.test\.ts/);
});

test("des fichiers neufs ou non gelés passent", (t) => {
  const dossier = branche(t);
  writeFileSync(join(dossier, "test", "neuf.test.ts"), "neuf\n");
  writeFileSync(join(dossier, "README.md"), "autre\n");
  valider(dossier, "code", "cook");
  assert.equal(verdict(dossier), null);
});

test("un amendement du manager passe, le même changement d'un cook est refusé", (t) => {
  const manager = branche(t);
  writeFileSync(join(manager, "test", "a.test.ts"), "amendé\n");
  valider(manager, "amend", "manager", "Amendment: #42");
  assert.equal(verdict(manager), null);

  const cook = branche(t);
  writeFileSync(join(cook, "test", "a.test.ts"), "amendé\n");
  valider(cook, "amend", "cook", "Amendment: #42");
  assert.match(verdict(cook) ?? "", /test\/a\.test\.ts/);

  const sansTrailer = branche(t);
  writeFileSync(join(sansTrailer, "test", "a.test.ts"), "amendé\n");
  valider(sansTrailer, "amend", "manager");
  assert.match(verdict(sansTrailer) ?? "", /test\/a\.test\.ts/);
});

// Ticket 3835 : sur mirrorlab, le chef a corrigé lui-même un test gelé illisible, et la pass refusait chaque livraison.
test("un amendement du chef du projet passe, comme celui du manager ; un autre auteur reste refusé", (t) => {
  const chef = branche(t);
  writeFileSync(join(chef, "test", "a.test.ts"), "amendé\n");
  valider(chef, "amend", "benomite", "Amendment: #803");
  assert.equal(motifDuGel(violationsDuGel(chef, "origin/main", "benomite")), null);
  assert.match(motifDuGel(violationsDuGel(chef, "origin/main", null)) ?? "", /test\/a\.test\.ts/);
  assert.match(motifDuGel(violationsDuGel(chef, "origin/main", "quelqu-un")) ?? "", /test\/a\.test\.ts/);

  const sansTrailer = branche(t);
  writeFileSync(join(sansTrailer, "test", "a.test.ts"), "amendé\n");
  valider(sansTrailer, "amend", "benomite");
  assert.match(motifDuGel(violationsDuGel(sansTrailer, "origin/main", "benomite")) ?? "", /test\/a\.test\.ts/);
});
