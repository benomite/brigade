// Joue la suite de tests du runtime là où `npm test` ne passe pas : son script est écrit pour un
// shell POSIX (`VAR=… node …`), que Windows n'a pas. Tous les fichiers sont joués ; un test propre à
// un système se saute lui-même, avec sa raison (plateforme.ts).
//
// Usage : node test/support/windows.ts   (depuis runtime/)
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const RACINE_TESTS = join(import.meta.dirname, "..");

// Tous les fichiers de test, chemins relatifs à runtime/ écrits avec `/`, triés : aucun n'est écarté.
export function fichiersDeTest(racine = join(RACINE_TESTS, "..")): string[] {
  return globSync("test/**/*.test.ts", { cwd: racine }).map((f) => f.replaceAll("\\", "/")).sort();
}

// L'environnement de la suite, comme `npm test` le pose : les outils de git d'abord dans le PATH.
// Sous Windows la variable s'écrit `Path` : on garde sa casse, pour n'en poser qu'une.
export function environnement(env: NodeJS.ProcessEnv, gitCore: string | undefined): NodeJS.ProcessEnv {
  const cle = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const pose: NodeJS.ProcessEnv = { ...env, NODE_COMPILE_CACHE: env.NODE_COMPILE_CACHE ?? join(tmpdir(), "brigade-runtime-compile-cache") };
  if (gitCore) pose[cle] = `${gitCore}${delimiter}${env[cle] ?? ""}`;
  return pose;
}

if (import.meta.main) {
  const tous = fichiersDeTest();
  console.log(`${tous.length} test files played`);
  const gitCore = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout?.trim();
  // Trois fichiers de front, pas cinq comme `npm test` : sous Windows chaque doublure en bash passe par
  // le bash de Git, et chaque process coûte cher. À cinq, sur les quatre cœurs du runner, des tests qui
  // passent d'ordinaire (une pass en 18 s, une passe de fermeture en 40 s) y dépassaient leur garde.
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=3", "--test-force-exit", "--test-timeout=120000", ...tous], {
    cwd: join(RACINE_TESTS, ".."),
    stdio: "inherit",
    env: environnement(process.env, gitCore),
  });
  process.exit(r.status ?? 1);
}
