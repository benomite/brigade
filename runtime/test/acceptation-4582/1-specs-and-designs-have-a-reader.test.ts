// #4582, critères 1 et 2 : chaque fichier de docs/superpowers/ et docs/design/ est lu par un test, un workflow ou une doc
// qui reste, et aucun lien relatif d'une doc ne pointe vers un fichier de ces dossiers qui n'existe plus.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const FOLDERS = ["docs/superpowers", "docs/design"];

function files(folder: string, keep: (path: string) => boolean): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "captures") return [];
    const path = join(folder, entry.name);
    return entry.isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
  });
}
const inFolders = (path: string): boolean => FOLDERS.some((folder) => relative(join(ROOT, folder), path).split(sep)[0] !== "..");

const held = FOLDERS.flatMap((folder) => files(join(ROOT, folder), () => true));
const docs = [...files(join(ROOT, "docs"), (path) => path.endsWith(".md") && !inFolders(path)), join(ROOT, "README.md"), join(ROOT, "CLAUDE.md")];
const readers = [
  ...docs,
  ...files(join(ROOT, ".github/workflows"), () => true),
  ...files(join(ROOT, "app/test"), (path) => path.endsWith(".ts")),
  ...files(join(ROOT, "runtime/test"), (path) => path.endsWith(".ts") && !path.includes("acceptation-4582")),
].map((path) => readFileSync(path, "utf8"));

test("every file left in docs/superpowers/ and docs/design/ is named by a doc, a workflow or a test that remains", () => {
  const unread = held.filter((path) => !readers.some((text) => text.includes(basename(path)))).map((path) => relative(ROOT, path));
  assert.deepEqual(unread, []);
});

test("no relative link of a doc points into docs/superpowers/ or docs/design/ at a file that is gone", () => {
  const broken = [...docs, ...held.filter((path) => path.endsWith(".md"))].flatMap((doc) =>
    [...readFileSync(doc, "utf8").matchAll(/\]\(\s*([^)\s#]+)[^)]*\)/g)]
      .map((match) => match[1]!)
      .filter((link) => !/^[a-z]+:/i.test(link))
      .map((link) => resolve(dirname(doc), link))
      .filter((target) => inFolders(target) && !existsSync(target))
      .map((target) => `${relative(ROOT, doc)} → ${relative(ROOT, target)}`),
  );
  assert.deepEqual(broken, []);
});
