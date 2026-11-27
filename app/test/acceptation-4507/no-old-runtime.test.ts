// #4507 — the board and the rail read nothing from the old runtime: in their files, every `runtime/src/` path — an import or
// a comment that cites one — is under `runtime/src/kitchen/`, what `grep -rE 'runtime/src/' <the files>` would show.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

const APP = resolve(import.meta.dirname, "..", "..");
const SCOPE = ["src/board", "src/board-actions", "src/slip.ts", "src/story.ts", "src/priority.ts", "src/vue/rail", "src/vue/kitchen-board", "src/vue/card-ticket", "src/vue/backlog"];

const files = (path: string): string[] => {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
};

test("in the board's and the rail's files, every `runtime/src/` path is under `runtime/src/kitchen/`", () => {
  const all = SCOPE.flatMap((path) => files(join(APP, path)));
  assert.ok(all.length > 10, "the files of the scope are found");
  const outside = all.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, rank) => (/runtime\/src\/(?!kitchen\/)/.test(line) ? [`${relative(APP, file)}:${rank + 1}: ${line.trim()}`] : [])),
  );
  assert.deepEqual(outside, []);
});
