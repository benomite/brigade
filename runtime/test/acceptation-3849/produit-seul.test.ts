// Critère 2 de #3849 : attente-longue-produit.test.ts passe seul sur la branche de #3764, et chacun de ses tests est rouge sur `main`.
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

const FICHIER = "runtime/test/attente-longue/attente-longue-produit.test.ts";

// Une fois les tests gelés, seul un commit portant `Amendment: #3764` peut changer le fichier.
function modificationsSansAmendement(fichier: string): string[] {
  const journal = git(DEPOT, "log", "--format=%h%x09%(trailers:key=Acceptance-Tests,valueonly,separator=%x2C)%x09%(trailers:key=Amendment,valueonly,separator=%x2C)", `${BASE}..${BRANCHE}`, "--", fichier);
  return journal.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string, string])
    .filter(([, gele, amendement]) => !gele.includes("frozen") && !amendement.includes("#3764"))
    .map(([sha]) => sha);
}

test("attente-longue-produit.test.ts passes on its own on the branch, and each of its tests fails on main", () => {
  const tmp = mkdtempSync(join(tmpdir(), "acc-3849-"));
  const branche = join(tmp, "branche");
  const base = join(tmp, "base");
  try {
    assert.deepEqual(modificationsSansAmendement(FICHIER), [], "commits that changed the frozen test with no `Amendment: #3764` trailer");
    git(DEPOT, "worktree", "add", "--detach", "-q", branche, BRANCHE);
    git(DEPOT, "worktree", "add", "--detach", "-q", base, BASE);
    const surBranche = jouer(branche, FICHIER);
    assert.ok(surBranche.size > 0, "no test reported on the branch");
    assert.deepEqual([...surBranche].filter(([, vert]) => !vert).map(([nom]) => nom), [], "red on the branch when run alone");
    mkdirSync(dirname(join(base, FICHIER)), { recursive: true });
    cpSync(join(branche, FICHIER), join(base, FICHIER));
    const surBase = jouer(base, FICHIER);
    assert.deepEqual([...surBase].filter(([, vert]) => vert).map(([nom]) => nom), [], "green on main: the test proves nothing about the ticket");
  } finally {
    for (const d of [branche, base]) {
      try { git(DEPOT, "worktree", "remove", "--force", d); } catch { /* absent */ }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
});
