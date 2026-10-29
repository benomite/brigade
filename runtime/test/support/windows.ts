// Joue la suite de tests du runtime là où `npm test` ne passe pas : son script est écrit pour un
// shell POSIX (`VAR=… node …`), que Windows n'a pas. Tous les fichiers sont joués ; un test propre à
// un système se saute lui-même, avec sa raison (plateforme.ts). Entière, la suite dépasse sous Windows
// l'heure que le job lui donne : le job la joue en parts, une par runner, que `--part <i>/<n>` choisit.
//
// Usage : node test/support/windows.ts [--part <i>/<n>]   (depuis runtime/)
import { spawnSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

const RACINE_TESTS = join(import.meta.dirname, "..");

// Tous les fichiers de test, chemins relatifs à runtime/ écrits avec `/`, triés : aucun n'est écarté.
export function fichiersDeTest(racine = join(RACINE_TESTS, "..")): string[] {
  return globSync("test/**/*.test.ts", { cwd: racine }).map((f) => f.replaceAll("\\", "/")).sort();
}

// La part `<i>/<n>` des fichiers : un sur n, à partir du i-ième. Les n parts couvrent tous les fichiers,
// chacun une fois, et la part de chacun ne bouge que si la liste change.
export function part(tous: string[], demande: string): string[] {
  const lue = /^([1-9]\d*)\/([1-9]\d*)$/.exec(demande);
  const [i, n] = [Number(lue?.[1]), Number(lue?.[2])];
  if (lue === null || i > n) throw new Error(`--part ${demande}: expected <i>/<n>, with 1 <= i <= n`);
  return tous.filter((_, rang) => rang % n === i - 1);
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
  const demande = process.argv.indexOf("--part");
  const joues = demande === -1 ? tous : part(tous, process.argv[demande + 1] ?? "");
  console.log(demande === -1 ? `${tous.length} test files played` : `part ${process.argv[demande + 1]}: ${joues.length} of the ${tous.length} test files played`);
  const gitCore = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout?.trim();
  // Un fichier à la fois, pas cinq comme `npm test` : sous Windows chaque doublure en bash passe par
  // le bash de Git, et chaque process coûte cher. À cinq, sur les quatre cœurs du runner, des tests qui
  // passent d'ordinaire (une pass en 18 s, une passe de fermeture en 40 s) y dépassaient leur garde.
  // À trois, le rouge restait : d'un run à l'autre, sur la base comme sur les PR (#1884), d'autres tests
  // de pass.test.ts, fusion.test.ts ou station.test.ts attendaient en vain (« condition jamais remplie »,
  // 120 s), jamais les mêmes, et le même commit repassait vert. La charge, pas un test, était la cause.
  // À deux, la part 1 restait rouge sur la base (#1886, run 40797528694 sur d7e0131 : six tests de
  // station.test.ts et d'enregistrement-station attendent 60 s en vain, le bash de Git écrit « could not
  // find /tmp » dans la sortie d'un setup) alors que le diff de ce commit ne touche aucun de ces fichiers,
  // et que le run de son parent, en trois minutes, était vert : un runner qui cale, pas un test cassé.
  // Un seul fichier à la fois ne laisse plus deux fichiers de process se disputer le runner.
  // Le rapport lisible par le journal, et ses échecs, ses sauts et ses comptes en annotations du check
  // (annotations.ts), écrites une fois la suite finie.
  const rapport = mkdtempSync(join(tmpdir(), "brigade-annotations-"));
  const annotations = join(rapport, "annotations.txt");
  const reporters = ["--test-reporter=spec", "--test-reporter-destination=stdout", `--test-reporter=${pathToFileURL(join(import.meta.dirname, "annotations.ts")).href}`, `--test-reporter-destination=${annotations}`];
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-force-exit", "--test-timeout=120000", ...reporters, ...joues], {
    cwd: join(RACINE_TESTS, ".."),
    stdio: "inherit",
    env: environnement(process.env, gitCore),
  });
  try {
    process.stdout.write(readFileSync(annotations, "utf8"));
  } catch {
    console.log("no annotations: the test runner wrote no report");
  }
  rmSync(rapport, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}
