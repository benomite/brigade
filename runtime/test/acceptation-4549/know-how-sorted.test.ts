// #4549 : two lessons added to the same know-how file merge without a conflict, because the file is sorted and a lesson is
// inserted at its place; the gates' script refuses an entry added out of place.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const script = join(root, ".claude/brigade/know-how-ordre.py");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

const check = (file: string, base?: string) =>
  spawnSync("python3", ["-I", script, file, ...(base === undefined ? [] : [base])], { encoding: "utf8" });

test("the project's own know-how file is sorted", () => {
  assert.equal(check(join(root, ".brigade/know-how.md")).status, 0);
});

test("two branches that each insert a lesson at its place merge with no conflict", () => {
  const dir = mkdtempSync(join(tmpdir(), "kh-"));
  const file = join(dir, "know-how.md");
  writeFileSync(file, "- Alpha one (#1)\n- Delta four (#4)\n- Zulu last (#9)\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "base");
  for (const [branch, line] of [["a", "- Bravo two (#10)"], ["b", "- Yankee late (#11)"]] as const) {
    git(dir, "checkout", "-qb", branch, "main");
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    lines.push(line);
    lines.sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), "en"));
    writeFileSync(file, `${lines.join("\n")}\n`);
    git(dir, "commit", "-qam", branch);
  }
  git(dir, "checkout", "-q", "a");
  git(dir, "merge", "-q", "--no-edit", "b");
  assert.equal(check(file).status, 0);
  assert.equal(readFileSync(file, "utf8").split("\n").length, 6);
});

test("an entry added at the end, out of place, is refused with a FAIL line", () => {
  const dir = mkdtempSync(join(tmpdir(), "kh-"));
  const base = join(dir, "base.md");
  const file = join(dir, "know-how.md");
  writeFileSync(base, "- Alpha one (#1)\n- Zulu last (#9)\n");
  writeFileSync(file, "- Alpha one (#1)\n- Zulu last (#9)\n- Bravo two (#10)\n");
  const result = check(file, base);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^FAIL /);
});

test("an older unsorted remainder is not the change's own", () => {
  const dir = mkdtempSync(join(tmpdir(), "kh-"));
  const base = join(dir, "base.md");
  writeFileSync(base, "- Zulu last (#9)\n- Alpha one (#1)\n");
  assert.equal(check(base, base).status, 0);
});
