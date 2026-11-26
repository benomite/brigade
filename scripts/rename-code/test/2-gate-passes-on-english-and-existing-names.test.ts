// Acceptance #4411 (epic #4345): the naming gate is green on English names and on French names the base already has.
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

test("the gate passes on English names and on French names that already exist on the base", () => {
  const repo = fixture();
  try {
    // Nothing added: the French names of the base stay.
    assert.equal(gate(repo).code, 0, gate(repo).out);
    // English names added next to them.
    write(repo, "runtime/src/breaker.ts", "export const drift = 1;\n");
    write(repo, "runtime/src/output.json", '{"cap": 3}\n');
    write(repo, "app/src/guardrails.ts", "export const capOfCooks = 3;\n");
    commit(repo);
    const r = gate(repo);
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
