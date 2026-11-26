// The naming gate (#4411): identifiers are English (docs/naming-rule.md). It
// reads the names that a branch adds or renames against its base, and fails on
// any that has an accent or holds a word of the French side of `mapping.json`
// — the same mapping the rename applies (table.ts).
//
//   node scripts/rename-code/gate.ts --base <ref>
//
// Checked, against the merge base of `<ref>` and HEAD (committed work only):
//   - file and directory names under runtime/src and app/src: a file added or
//     renamed to a new name, a directory the base does not have;
//   - exported symbols of the code files of runtime/src and app/src: a name
//     the file did not export on the base;
//   - keys of the JSON files under runtime/{src,test} and app/{src,test}: a
//     key the file did not have on the base.
// A French name that is already on the base passes: the rename tickets remove
// those. Comments, strings and docs are never read: the dialogue with the
// agents stays French.
//
// Exit 0: no new French identifier. Exit 1: some, each named with its file,
// and the rule. Exit 2: the gate could not run (no base, not a repository).
import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { WORDS } from "./table.ts";
import { frenchIn } from "./words.ts";

export const RULE = "docs/naming-rule.md";
const NAME_SCOPE = ["runtime/src", "app/src"];
const JSON_SCOPE = ["runtime/src", "runtime/test", "app/src", "app/test"];
const CODE = /\.(?:ts|mts|cts|js|mjs|cjs)$/;

type Finding = { file: string; kind: string; name: string; why: string };

const translator = { words: WORDS };
const under = (file: string, roots: string[]) => roots.some((root) => file.startsWith(root + "/"));

// What makes a name French, if anything: an accent, or words of the mapping
// (looked up without their accents, as the mapping writes them).
export function frenchReasons(name: string): string[] {
  const why: string[] = [];
  if (/[^\x00-\x7f]/.test(name)) why.push("has an accent");
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const words of frenchIn(plain, translator)) why.push(`French word \`${words}\` (English: \`${WORDS[words]}\`)`);
  return why;
}

// The names a code file exports, read from its text: declarations
// (`export const a`, `export function a`, `export default class A`…) and
// export lists (`export { a, b as c }`). Comments are left out.
export function exportedNames(source: string): Set<string> {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const names = new Set<string>();
  const declaration =
    /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const\s+enum|function\s*\*?|class|const|let|var|interface|type|enum|namespace)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu;
  for (const match of text.matchAll(declaration)) names.add(match[1]!);
  for (const match of text.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of match[1]!.split(",")) {
      const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim();
      if (name !== "" && name !== "default") names.add(name);
    }
  }
  return names;
}

// Every object key of a JSON document, at any depth.
export function jsonKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) jsonKeys(item, keys);
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      jsonKeys(item, keys);
    }
  }
  return keys;
}

type Change = { status: string; path: string; old?: string };

export function gate(base: string, cwd: string = process.cwd()): Finding[] {
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const root = git("rev-parse", "--show-toplevel").trim();
  const run = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const mergeBase = run("merge-base", base, "HEAD").trim();
  const show = (commit: string, path: string) => run("show", `${commit}:${path}`);

  // The directories the base has, under the scope of names.
  const baseDirs = new Set<string>();
  for (const file of run("ls-tree", "-r", "-z", "--name-only", mergeBase, "--", ...NAME_SCOPE).split("\0").filter(Boolean)) {
    for (let dir = dirname(file); dir !== "." && !baseDirs.has(dir); dir = dirname(dir)) baseDirs.add(dir);
  }

  // Added (A), copied (C), renamed (R) and modified (M) files, with their old path.
  const fields = run("diff", "--name-status", "-z", "-M", "--diff-filter=ACMR", mergeBase, "HEAD", "--", ...JSON_SCOPE).split("\0");
  const changes: Change[] = [];
  for (let at = 0; at < fields.length - 1; ) {
    const status = fields[at]!.charAt(0);
    if (status === "R" || status === "C") {
      changes.push({ status, old: fields[at + 1]!, path: fields[at + 2]! });
      at += 3;
    } else {
      changes.push({ status, old: status === "M" ? fields[at + 1]! : undefined, path: fields[at + 1]! });
      at += 2;
    }
  }

  const findings: Finding[] = [];
  const flag = (file: string, kind: string, name: string) => {
    for (const why of frenchReasons(name)) findings.push({ file, kind, name, why });
  };
  const seenDirs = new Set<string>();
  for (const change of changes) {
    const { path, old } = change;
    if (under(path, NAME_SCOPE)) {
      for (let dir = dirname(path); under(dir, NAME_SCOPE) && !baseDirs.has(dir) && !seenDirs.has(dir); dir = dirname(dir)) {
        seenDirs.add(dir);
        flag(dir, "directory name", basename(dir));
      }
      const name = basename(path);
      // A file name is read without its extensions: `garde-fous.test.ts` → `garde-fous`.
      if (old === undefined || basename(old) !== name) flag(path, "file name", name.split(".")[0] || name);
      if (CODE.test(path)) {
        const before = old === undefined ? new Set<string>() : exportedNames(show(mergeBase, old));
        for (const symbol of exportedNames(show("HEAD", path))) if (!before.has(symbol)) flag(path, "exported symbol", symbol);
      }
    }
    if (path.endsWith(".json") && under(path, JSON_SCOPE)) {
      let now: Set<string>;
      try {
        now = jsonKeys(JSON.parse(show("HEAD", path)));
      } catch (error) {
        findings.push({ file: path, kind: "JSON file", name: basename(path), why: `cannot be read as JSON, its keys are not checked: ${(error as Error).message}` });
        continue;
      }
      let before = new Set<string>();
      if (old !== undefined) {
        // A base version that does not parse has no key to excuse: every key is checked.
        try {
          before = jsonKeys(JSON.parse(show(mergeBase, old)));
        } catch {}
      }
      for (const key of now) if (!before.has(key)) flag(path, "JSON key", key);
    }
  }
  return findings;
}

if (import.meta.main) {
  const at = process.argv.indexOf("--base");
  const base = at === -1 ? undefined : process.argv[at + 1];
  if (base === undefined || base.startsWith("--")) {
    console.error("usage: node scripts/rename-code/gate.ts --base <ref>");
    process.exit(2);
  }
  let findings: Finding[];
  try {
    findings = gate(base);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    console.error(`naming gate: cannot compare with the base \`${base}\`: ${(stderr || (error as Error).message).trim()}`);
    process.exit(2);
  }
  if (findings.length === 0) {
    console.log(`naming gate: no new French identifier against \`${base}\` (naming rule: ${RULE})`);
    process.exit(0);
  }
  console.error(`naming gate: ${findings.length} new French identifier(s) against \`${base}\`:`);
  for (const f of findings) console.error(`  ${f.file}: ${f.kind} \`${f.name}\` ${f.why}`);
  console.error(
    `\nNaming rule: identifiers are English — file and directory names, exported symbols, JSON contract keys. See ${RULE} for the rule and the French → English table (scripts/rename-code/mapping.json).` +
      `\nFrench names already on the base pass: the rename tickets remove them.`,
  );
  process.exit(1);
}
