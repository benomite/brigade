// The fixture repository of the naming gate's tests (#4411): a `main` that
// already holds French names, a `branch` checked out from it, and the gate run
// from inside it against `main`.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const GATE = join(import.meta.dirname, "..", "gate.ts");

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });

export const write = (repo: string, path: string, content: string): void => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};

export const commit = (repo: string): void => {
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "branch");
};

export const gate = (repo: string, base = "main", script = GATE) => {
  const r = spawnSync("node", [script, "--base", base], { cwd: repo, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

export function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "gate-naming-"));
  git(repo, "init", "-q", "-b", "main");
  write(repo, "runtime/src/garde-fous.ts", "export const plafondDeCooks = 3;\n");
  write(repo, "runtime/src/sortie-ancienne.json", '{"plafond": 3}\n');
  write(repo, "app/src/attente/vue.ts", "export function montrerAttente() {}\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "base");
  git(repo, "checkout", "-qb", "branch");
  return repo;
}
