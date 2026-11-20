// #3847 : l'amendement que la station écrit au nom du manager (`brigade manager
// <manager@brigade.localhost>`) tient le gel ; un cook qui rend un test gelé tel
// que l'a laissé son dernier commit autorisé ne le modifie pas. Sur #3833, le gel
// refusait l'amendement du manager, le cook remettait l'ancien titre, et la revue
// bloquait sur ce titre : la boucle.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { AUTEUR_DU_MANAGER, motifDuGel, violationsDuGel } from "../../src/passe-gel-tests/gel-tests.ts";
import { ENV_GIT, git } from "../outils.ts";

const COOK = "brigade (cook) <cook@example.invalid>";
const GELE = "a project far over the old limit\n";
const AMENDE = "a project with many calls in the last hour\n";

function branche(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "gel-amendement-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  git(dossier, "init", "-q", "-b", "main");
  writeFileSync(join(dossier, "README.md"), "base\n");
  git(dossier, "add", "-A");
  git(dossier, "commit", "-q", "-m", "base");
  git(dossier, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dossier, "checkout", "-q", "-b", "livraison");
  mkdirSync(join(dossier, "test"));
  writeFileSync(join(dossier, "test", "a.test.ts"), GELE);
  valider(dossier, "acceptance tests", "brigade <brigade@localhost>", "Acceptance-Tests: frozen");
  return dossier;
}

function ecrire(dossier: string, contenu: string, auteur: string, trailer?: string) {
  writeFileSync(join(dossier, "test", "a.test.ts"), contenu);
  valider(dossier, "change", auteur, trailer);
}

function valider(dossier: string, sujet: string, auteur: string, trailer?: string) {
  git(dossier, "add", "-A");
  const [, nom = "", courriel = ""] = /^(.*) <(.*)>$/.exec(auteur) ?? [];
  const env = { ...ENV_GIT, GIT_AUTHOR_NAME: nom, GIT_AUTHOR_EMAIL: courriel, GIT_COMMITTER_NAME: nom, GIT_COMMITTER_EMAIL: courriel };
  execFileSync("git", ["commit", "-q", "-m", sujet, ...(trailer === undefined ? [] : ["-m", trailer])], { cwd: dossier, env, stdio: "pipe" });
}

const tete = (dossier: string) => git(dossier, "rev-parse", "HEAD").trim();

test("the amendment the station commits as the manager holds the freeze", (t) => {
  const dossier = branche(t);
  ecrire(dossier, AMENDE, AUTEUR_DU_MANAGER, "Amendment: #3833");
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});

test("a cook that undoes the manager's amendment is refused, naming its commit", (t) => {
  const dossier = branche(t);
  ecrire(dossier, AMENDE, AUTEUR_DU_MANAGER, "Amendment: #3833");
  const amendement = tete(dossier);
  ecrire(dossier, GELE, COOK);
  const violations = violationsDuGel(dossier, "origin/main");
  assert.deepEqual(violations, [{ commit: tete(dossier), fichiers: ["test/a.test.ts"], retablir: { "test/a.test.ts": amendement } }]);
  // Le motif dit de rendre la version amendée, pas celle du commit gelé.
  assert.match(motifDuGel(violations) ?? "", new RegExp(`git checkout ${amendement.slice(0, 7)} -- test/a\\.test\\.ts`));
});

test("a cook that puts the amended test back, after undoing it, holds the freeze", (t) => {
  const dossier = branche(t);
  ecrire(dossier, AMENDE, AUTEUR_DU_MANAGER, "Amendment: #3833");
  ecrire(dossier, GELE, COOK);
  ecrire(dossier, AMENDE, COOK);
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});

test("a cook that changes a frozen test then restores it byte for byte holds the freeze", (t) => {
  const dossier = branche(t);
  ecrire(dossier, "changed\n", COOK);
  ecrire(dossier, GELE, COOK);
  assert.deepEqual(violationsDuGel(dossier, "origin/main"), []);
});
