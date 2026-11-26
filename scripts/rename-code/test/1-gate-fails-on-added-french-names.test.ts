// Acceptance #4411 (epic #4345): the naming gate is red on added French names, and its message names the rule.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const GATE = join(dirname(fileURLToPath(import.meta.url)), "..", "gate.ts");

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });

const write = (repo: string, path: string, content: string): void => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};

// The gate, run from inside the fixture repo against its `main` branch.
const gate = (repo: string) => {
  const r = spawnSync("node", [GATE, "--base", "main"], { cwd: repo, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

// A repo whose `main` already holds French names, and a `branch` checked out from it.
function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "gate-naming-"));
  git(repo, "init", "-q", "-b", "main");
  write(repo, "runtime/src/garde-fous.ts", "export const plafondDeCooks = 3;\n");
  write(repo, "runtime/src/sortie-ancienne.json", '{"plafond": 3}\n');
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "base");
  git(repo, "checkout", "-qb", "branch");
  return repo;
}

const commit = (repo: string): void => {
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "branch");
};

test("the gate fails on a French file name, an accented exported symbol and a French JSON key, and links the rule", () => {
  const repo = fixture();
  try {
    write(repo, "runtime/src/disjoncteur.ts", "export const dérive = 1;\n");
    write(repo, "runtime/src/sortie.json", '{"plafond": 3}\n');
    commit(repo);
    const { code, out } = gate(repo);
    assert.notEqual(code, 0, out);
    assert.match(out, /disjoncteur/);
    assert.match(out, /dérive/);
    assert.match(out, /plafond/);
    assert.match(out, /naming rule/i);
    assert.match(out, /docs\/naming-rule\.md/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
