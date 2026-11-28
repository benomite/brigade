// Every file under runtime/src is reachable from kitchen/main.ts or from what the package launches (an ExecStart of its systemd units, the installer's Max connection) (#4712): what neither loads is dead.
// A file is reached by an import, by `new URL("./x.ts", import.meta.url)` (hooks the sandbox launches) or by a quoted sibling name ("x.ts").
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(import.meta.dirname, "../../src");
const UNITES = resolve(import.meta.dirname, "../../paquet/systemd");
const INSTALLATEUR = resolve(import.meta.dirname, "../../deploy/installer-station.sh");

// The programs the units launch, beside the kitchen: `ExecStart=<node> src/<file>.ts`.
function racinesDesUnites(): string[] {
  return readdirSync(UNITES)
    .filter((unite) => unite.endsWith(".service"))
    .flatMap((unite) => [...readFileSync(join(UNITES, unite), "utf8").matchAll(/^ExecStart=\S+\s+(src\/\S+\.ts)/gm)].map((m) => resolve(SRC, "..", m[1] as string)));
}

// The step installer-station.sh runs from the package, under Linux: `CONNEXION="$LIB/runtime/src/<file>.ts"`.
function racinesDeLInstallateur(): string[] {
  return [...readFileSync(INSTALLATEUR, "utf8").matchAll(/\$LIB\/runtime\/(src\/\S+\.ts)/g)].map((m) => resolve(SRC, "..", m[1] as string));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]));
}

function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop() as string;
    if (seen.has(file) || !file.endsWith(".ts")) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from|import|new URL)\s*\(?\s*["'](\.[^"']+)["']|["']([\w.-]+\.ts)["']/g)) {
      const target = resolve(dirname(file), (m[1] ?? m[2]) as string);
      if (existsSync(target)) todo.push(target);
    }
  }
  return seen;
}

test("every file under runtime/src is in the import closure of kitchen/main.ts or of what the package launches (#4712)", () => {
  const roots = [join(SRC, "kitchen/main.ts"), ...racinesDesUnites(), ...racinesDeLInstallateur()];
  assert.ok(roots.length >= 5, "the kitchen, the three programs the units launch and the installer's Max connection");
  assert.ok(roots.every((root) => existsSync(root)), "every ExecStart names a file of runtime/src");
  const reached = new Set(roots.flatMap((root) => [...closureOf(root)]));
  const orphans = filesUnder(SRC).filter((file) => !reached.has(file)).map((file) => file.slice(SRC.length + 1));
  assert.deepEqual(orphans, [], "files nothing in the kitchen loads: delete them, with their tests and docs");
});
