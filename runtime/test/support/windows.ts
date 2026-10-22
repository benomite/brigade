// Joue la suite de tests du runtime là où `npm test` ne passe pas : son script est écrit pour un
// shell POSIX (`VAR=… node …`), que Windows n'a pas. Tous les fichiers sont joués ; un test propre à
// un système se saute lui-même, avec sa raison (plateforme.ts, posix.ts).
//
// Usage : node test/support/windows.ts   (depuis runtime/)
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const RACINE_TESTS = join(import.meta.dirname, "..");

if (import.meta.main) {
  const tous = globSync("test/**/*.test.ts", { cwd: join(RACINE_TESTS, "..") }).map((f) => f.replaceAll("\\", "/")).sort();
  console.log(`${tous.length} test files played`);
  // Comme `npm test` : les outils de git d'abord dans le PATH.
  const gitCore = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout?.trim();
  // Sous Windows la variable s'écrit `Path` : on garde sa casse, pour n'en poser qu'une.
  const cle = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ?? join(tmpdir(), "brigade-runtime-compile-cache") };
  if (gitCore) env[cle] = `${gitCore}${delimiter}${process.env[cle] ?? ""}`;
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=5", "--test-force-exit", "--test-timeout=120000", ...tous], {
    cwd: join(RACINE_TESTS, ".."),
    stdio: "inherit",
    env,
  });
  process.exit(r.status ?? 1);
}
