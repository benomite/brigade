// Critère 1 de #3849 : la revue de la PR #3766 est levée quand aucun test que #3764 ajoute n'est déjà vert sur `main`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { ENV_GIT } from "../outils.ts";

const DEPOT = join(import.meta.dirname, "..", "..", "..");
const BRANCHE = "origin/cook/3764-github";
const BASE = "origin/main";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: { ...process.env, ...ENV_GIT }, encoding: "utf8" });
}

// Les tests de premier niveau que `node --test` rapporte pour un fichier, vert ou rouge.
// Un fichier qui ne se charge pas ne rapporte aucun test vert.
function jouer(racine: string, fichier: string): Map<string, boolean> {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fichier.replace(/^runtime\//, "")], {
    cwd: join(racine, "runtime"),
    env: { ...env, ...ENV_GIT },
    encoding: "utf8",
  });
  const vus = new Map<string, boolean>();
  for (const l of r.stdout.split("\n")) {
    const m = /^(not )?ok \d+ - (.*?)(?: # .*)?$/.exec(l);
    if (m) vus.set(m[2]!, !m[1]);
  }
  return vus;
}

// Une fois les tests gelés, la tête de la branche doit porter le fichier tel que l'a laissé son dernier commit portant `Acceptance-Tests: frozen` ou `Amendment: #3764` (la version de main si aucun n'y a touché).
function modificationsSansAmendement(fichier: string): string[] {
  const journal = git(DEPOT, "log", "--full-history", "--format=%h%x09%(trailers:key=Acceptance-Tests,valueonly,separator=%x2C)%x09%(trailers:key=Amendment,valueonly,separator=%x2C)", `${BASE}..${BRANCHE}`, "--", fichier);
  const autorise = journal.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string, string])
    .find(([, gele, amendement]) => gele.includes("frozen") || amendement.includes("#3764"));
  const blob = (rev: string): string => {
    try { return git(DEPOT, "rev-parse", `${rev}:${fichier}`).trim(); } catch { return "absent"; }
  };
  return blob(BRANCHE) === blob(autorise ? autorise[0] : BASE) ? [] : [BRANCHE];
}

// La CI ne récupère pas la branche de #3764, et elle disparaît une fois #3764 fusionnée : sans elle, le test est sauté ; tant qu'elle existe, il reste actif.
function brancheAbsente(): boolean {
  try { git(DEPOT, "rev-parse", "--verify", BRANCHE); return false; } catch { return true; }
}

test("every test the #3764 branch adds under attente-longue is red on main and green on the branch", { skip: brancheAbsente() }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "acc-3849-"));
  const sur = (ref: string) => {
    const dossier = join(tmp, ref.replace(/\W/g, "_"));
    git(DEPOT, "worktree", "add", "--detach", "-q", dossier, ref);
    return dossier;
  };
  try {
    assert.deepEqual(modificationsSansAmendement("runtime/test/attente-longue/attente-longue-produit.test.ts"), [], "commits that changed a frozen test with no `Amendment: #3764` trailer");
    const ajoutes = git(DEPOT, "diff", "--name-only", "--diff-filter=A", BASE, BRANCHE, "--", "runtime/test/attente-longue/")
      .split("\n").filter((f) => f.endsWith(".test.ts"));
    assert.ok(ajoutes.length > 0, "the branch adds no test under runtime/test/attente-longue/");
    const branche = sur(BRANCHE);
    const base = sur(BASE);
    const verts: string[] = [];
    const rougesSurBranche: string[] = [];
    for (const f of ajoutes) {
      mkdirSync(dirname(join(base, f)), { recursive: true });
      cpSync(join(branche, f), join(base, f));
      const surBranche = jouer(branche, f);
      assert.ok(surBranche.size > 0, `no test reported on the branch for ${f}`);
      for (const [nom, vert] of surBranche) if (!vert) rougesSurBranche.push(`${f}: ${nom}`);
      for (const [nom, vert] of jouer(base, f)) if (vert) verts.push(`${f}: ${nom}`);
    }
    assert.deepEqual(verts, [], "added tests already green on main: they prove nothing about the ticket");
    assert.deepEqual(rougesSurBranche, [], "added tests red on the branch");
  } finally {
    for (const d of [BRANCHE, BASE]) {
      try { git(DEPOT, "worktree", "remove", "--force", join(tmp, d.replace(/\W/g, "_"))); } catch { /* absent */ }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
});
