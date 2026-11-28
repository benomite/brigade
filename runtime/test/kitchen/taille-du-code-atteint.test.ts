// The code the kitchen reaches stays under 10,000 lines (#4777): from each entry point of the table of docs/runtime/README.md,
// the relative imports are followed with the rules of fermeture-des-imports.test.ts, and the lines of the reached files are summed.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../../src");
const README = resolve(import.meta.dirname, "../../../docs/runtime/README.md");
const LIMIT = 10_000;

// The first cell of each row of the "Entry point" table: every backticked path, under runtime/src.
function entryPointsOf(readme: string, src: string): string[] {
  const rows = readme.split("\n").filter((line) => line.startsWith("|"));
  const header = rows.findIndex((row) => /^\|\s*Entry point\s*\|/.test(row));
  const body = header < 0 ? [] : rows.slice(header + 2);
  return body.flatMap((row) => [...(row.split("|")[1] ?? "").matchAll(/`([^`]+\.ts)`/g)].map((m) => resolve(src, m[1] as string)));
}

function reachedFrom(entries: string[]): Map<string, number> {
  const seen = new Map<string, number>();
  const todo = [...entries];
  while (todo.length) {
    const file = todo.pop() as string;
    if (seen.has(file) || !file.endsWith(".ts")) continue;
    const text = readFileSync(file, "utf8");
    seen.set(file, text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
    for (const m of text.matchAll(/(?:from|import|new URL)\s*\(?\s*["'](\.[^"']+)["']|["']([\w.-]+\.ts)["']/g)) {
      const target = resolve(dirname(file), (m[1] ?? m[2]) as string);
      if (existsSync(target)) todo.push(target);
    }
  }
  return seen;
}

// Fails above the limit, printing the total and the biggest files.
function checkSize(entries: string[], src: string, limit: number): void {
  const reached = reachedFrom(entries);
  const total = [...reached.values()].reduce((a, b) => a + b, 0);
  const biggest = [...reached].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([file, lines]) => `${lines} ${file.slice(src.length + 1)}`);
  assert.ok(total <= limit, `the reached code is ${total} lines, above ${limit}; the biggest files:\n${biggest.join("\n")}`);
}

test("the code reached from the README's entry points stays under 10,000 lines (#4777)", () => {
  const entries = [join(SRC, "kitchen/main.ts"), ...entryPointsOf(readFileSync(README, "utf8"), SRC)];
  assert.ok(entries.length >= 6, "kitchen/main.ts and the table's entry points");
  assert.ok(entries.every((entry) => existsSync(entry)), "every entry point of the table is a file of runtime/src");
  checkSize(entries, SRC, LIMIT);
});

test("the check fails, with the total and the biggest files, when a file over the margin joins the reached set", () => {
  const dir = mkdtempSync(join(tmpdir(), "taille-"));
  mkdirSync(join(dir, "src"));
  const src = join(dir, "src");
  writeFileSync(join(src, "main.ts"), 'import "./small.ts";\n');
  writeFileSync(join(src, "small.ts"), "export const a = 1;\n");
  checkSize([join(src, "main.ts")], src, 100);
  writeFileSync(join(src, "small.ts"), 'import "./big.ts";\nexport const a = 1;\n');
  writeFileSync(join(src, "big.ts"), "export const b = 1;\n".repeat(101));
  assert.throws(() => checkSize([join(src, "main.ts")], src, 100), /is 104 lines, above 100[\s\S]*101 big\.ts/);
});

test("the entry points are read from the table's first column only", () => {
  const readme = "| Page | x |\n|---|---|\n| `no.ts` | y |\n\n| Entry point | Launched by |\n|---|---|\n| `a.ts`, `b/c.ts` | the kitchen `d.ts` |\n";
  assert.deepEqual(entryPointsOf(readme, "/s"), ["/s/a.ts", "/s/b/c.ts"]);
});
