// app/src stays under 30,000 lines (#4804): every file under it is counted like the kitchen's code (#4777),
// a trailing newline ends the last line instead of starting another. Binary assets (fonts, images) are excluded.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../src");
const LIMIT = 30_000;
const BINARY = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".webp"]);

function linesOf(dir: string): Map<string, number> {
  const counted = new Map<string, number>();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || BINARY.has(extname(entry.name).toLowerCase())) continue;
    const file = join(entry.parentPath, entry.name);
    const text = readFileSync(file, "utf8");
    counted.set(file, text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
  }
  return counted;
}

// Fails above the limit, printing the total and the biggest files.
function checkSize(dir: string, limit: number): void {
  const counted = linesOf(dir);
  const total = [...counted.values()].reduce((a, b) => a + b, 0);
  const biggest = [...counted].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([file, lines]) => `${lines} ${file.slice(dir.length + 1)}`);
  assert.ok(total <= limit, `app/src is ${total} lines, above ${limit}; the biggest files:\n${biggest.join("\n")}`);
}

test("app/src stays under 30,000 lines, binary assets excluded (#4804)", () => {
  checkSize(SRC, LIMIT);
});

test("the check fails, with the total and the biggest files, above the limit, and ignores binary assets", () => {
  const dir = mkdtempSync(join(tmpdir(), "taille-app-"));
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "sub", "a.ts"), "export const a = 1;\n".repeat(60));
  writeFileSync(join(dir, "font.woff2"), "x\n".repeat(500));
  checkSize(dir, 100);
  writeFileSync(join(dir, "b.css"), "a{}\n".repeat(41));
  assert.throws(() => checkSize(dir, 100), /is 101 lines, above 100[\s\S]*60 sub\/a\.ts/);
});
