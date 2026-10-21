// Joue la suite de tests du runtime là où `npm test` ne passe pas : son script est écrit pour un
// shell POSIX (`VAR=… node …`), que Windows n'a pas. Les fichiers listés dans
// `pas-encore-porte-sous-windows.json` ne sont pas joués, et chacun est nommé avec sa raison dans le
// journal du job. Chaque ticket de port retire de la liste les fichiers qu'il rend verts.
//
// Usage : node test/support/windows.ts   (depuis runtime/)
import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const RACINE_TESTS = join(import.meta.dirname, "..");

export type Liste = { raison: string; fichiers: string[] };

export function lireListe(chemin: string): Liste {
  const liste = JSON.parse(readFileSync(chemin, "utf8")) as Liste;
  if (typeof liste.raison !== "string" || !Array.isArray(liste.fichiers)) {
    throw new Error(`${chemin}: expected { "raison": string, "fichiers": string[] }`);
  }
  return liste;
}

// Les fichiers de test (chemins relatifs à runtime/, avec `/`) moins ceux de la liste. Un fichier de
// la liste qui n'existe plus est une erreur : la liste ne doit pas se périmer en silence.
export function partager(tous: string[], liste: Liste): { joues: string[]; sautes: string[] } {
  const inconnus = liste.fichiers.filter((f) => !tous.includes(f));
  if (inconnus.length > 0) throw new Error(`pending list names tests that do not exist: ${inconnus.join(", ")}`);
  return { joues: tous.filter((f) => !liste.fichiers.includes(f)), sautes: liste.fichiers };
}

if (import.meta.main) {
  const liste = lireListe(join(import.meta.dirname, "pas-encore-porte-sous-windows.json"));
  const tous = globSync("test/**/*.test.ts", { cwd: join(RACINE_TESTS, "..") }).map((f) => f.replaceAll("\\", "/")).sort();
  const { joues, sautes } = partager(tous, liste);
  for (const f of sautes) console.log(`skipped on ${process.platform}: ${liste.raison}: ${f}`);
  console.log(`${joues.length} test files played, ${sautes.length} skipped (${liste.raison})`);
  // Comme `npm test` : les outils de git d'abord dans le PATH.
  const gitCore = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout?.trim();
  // Sous Windows la variable s'écrit `Path` : on garde sa casse, pour n'en poser qu'une.
  const cle = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE ?? join(tmpdir(), "brigade-runtime-compile-cache") };
  if (gitCore) env[cle] = `${gitCore}${delimiter}${process.env[cle] ?? ""}`;
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=5", "--test-force-exit", "--test-timeout=120000", ...joues], {
    cwd: join(RACINE_TESTS, ".."),
    stdio: "inherit",
    env,
  });
  process.exit(r.status ?? 1);
}
