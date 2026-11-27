// L'app ne lit plus rien de l'ancien runtime : un fichier de app/src ne nomme `runtime/src/` que
// sous `runtime/src/kitchen/`, ou un fichier que la cuisine importe elle-même. Les chargements
// dynamiques de main.ts (`ofRuntime("kitchen", …)`) aussi.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, test } from "node:test";

const APP_SRC = join(import.meta.dirname, "../src");
const RUNTIME_SRC = join(import.meta.dirname, "../../runtime/src");

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

const toPosix = (path: string) => path.split(sep).join("/");

// The kitchen's files, and the files of runtime/src they import directly. Not further: through
// porte-journal.ts and reseau.ts, the closure would take in the whole old runtime.
const allowedOfRuntime = (): Set<string> => {
  const kitchen = filesUnder(join(RUNTIME_SRC, "kitchen")).filter((path) => path.endsWith(".ts"));
  const imported = kitchen.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/(?:from|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)]
      .map(([, specifier]) => resolve(dirname(file), specifier as string))
      .filter((target) => existsSync(target)),
  );
  return new Set([...kitchen, ...imported].map((path) => toPosix(relative(RUNTIME_SRC, path))).filter((name) => !name.startsWith("..")));
};

// What a source names of runtime/src, in a path (import, comment) or an `ofRuntime(...)` call.
const forbiddenOfRuntime = (source: string, allowed: Set<string>): string[] => {
  const named = [
    ...[...source.matchAll(/runtime\/src\/([\w./-]*)/g)].map(([, path]) => path as string),
    ...[...source.matchAll(/ofRuntime(?:<[^>]*>)?\(((?:\s*"[^"]*"\s*,?)+)\)/g)].map(([, args]) =>
      [...(args as string).matchAll(/"([^"]*)"/g)].map(([, part]) => part).join("/"),
    ),
  ];
  return named.filter((path) => !(path === "kitchen" || path.startsWith("kitchen/") || allowed.has(path)));
};

describe("l'app n'importe rien de l'ancien runtime", () => {
  const allowed = allowedOfRuntime();

  test("la cuisine et ce qu'elle importe sont permis, le reste de runtime/src non", () => {
    assert.ok(allowed.has("kitchen/decide.ts") && allowed.has("porte-journal.ts") && !allowed.has("etat.ts"));
    assert.deepEqual(forbiddenOfRuntime(`import { LABELS } from "../../runtime/src/kitchen/decide.ts";`, allowed), []);
    assert.deepEqual(forbiddenOfRuntime(`// lu dans runtime/src/kitchen/), voir runtime/src/kitchen/projects.ts`, allowed), []);
    assert.deepEqual(forbiddenOfRuntime(`await ofRuntime<typeof import("x")>("kitchen", "projects.ts");`, allowed), []);
    assert.deepEqual(forbiddenOfRuntime(`import { lire } from "../../runtime/src/etat.ts";`, allowed), ["etat.ts"]);
    assert.deepEqual(forbiddenOfRuntime(`const m = await import("../../../runtime/src/claims/claims.ts");`, allowed), ["claims/claims.ts"]);
    assert.deepEqual(forbiddenOfRuntime(`await ofRuntime<M>("etat.ts");`, allowed), ["etat.ts"]);
  });

  test("aucun fichier de app/src ne nomme runtime/src hors de la cuisine", () => {
    const found = filesUnder(APP_SRC).flatMap((file) =>
      forbiddenOfRuntime(readFileSync(file, "utf8"), allowed).map((path) => `${toPosix(relative(APP_SRC, file))} → runtime/src/${path}`),
    );
    assert.deepEqual(found, []);
  });
});
