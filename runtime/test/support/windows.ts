// Joue la suite de tests du runtime là où `npm test` ne passe pas : son script est écrit pour un
// shell POSIX (`VAR=… node …`), que Windows n'a pas. Tous les fichiers sont joués ; un test propre à
// un système se saute lui-même, avec sa raison (plateforme.ts). Entière, la suite dépasse sous Windows
// l'heure que le job lui donne : le job la joue en parts, une par runner, que `--part <i>/<n>` choisit.
//
// Usage : node test/support/windows.ts [--part <i>/<n>]   (depuis runtime/)
import { spawn, spawnSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

const RACINE_TESTS = join(import.meta.dirname, "..");

// Le garde d'une part : il tombe avant le plafond du job (`timeout-minutes` de runtime-windows.yml),
// qui coupe sans laisser d'annotation (#2406).
export const GARDE_MS = 12 * 60_000;

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

// Les process du poste, comptés par image, d'après `tasklist /FO CSV /NH` : `"bash.exe","1234",…`.
export function compterLesImages(csv: string): Map<string, number> {
  const comptes = new Map<string, number>();
  for (const ligne of csv.split(/\r?\n/)) {
    const image = /^"([^"]+)"/.exec(ligne)?.[1]?.toLowerCase();
    if (image) comptes.set(image, (comptes.get(image) ?? 0) + 1);
  }
  return comptes;
}

// Ce qui vit en plus de l'état de départ : les images dont le compte a grandi, la plus nombreuse d'abord.
export function enPlus(avant: Map<string, number>, apres: Map<string, number>): string[] {
  return [...apres]
    .map(([image, n]) => [image, n - (avant.get(image) ?? 0)] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([image, n]) => `${image} ×${n}`);
}

const images = () => compterLesImages(process.platform === "win32" ? (spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", timeout: 60_000 }).stdout ?? "") : "");

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
  // Le garde : une part sur huit dure d'ordinaire 4 à 7 minutes. Si un runner cale (un test qui bloque la
  // boucle ou gonfle sans fin), le job meurt sans journal ni annotation (« lost communication », #2080) ;
  // coupé par son plafond de 15 min (runtime-windows.yml), il n'en laisse pas davantage : à 25 min, le
  // garde ne tombait jamais, et deux parts de b1d0e1d sont mortes muettes (#2406). À GARDE_MS, avant le
  // plafond, le garde nomme les tests en cours et les process laissés, tue l'arbre des process et sort en
  // échec : le check dit alors où ça cale.
  // Les process laissés : sous Windows, tuer un process ne tue pas ses enfants, et une doublure qui
  // survit à son test charge le runner jusqu'à la fin de la part. Comptés contre l'état de départ, à la
  // fin de la part comme au garde.
  const auDepart = images();
  const laisses = () => enPlus(auDepart, images()).join(", ") || "none";
  const suivi = join(rapport, "en-cours.txt");
  const garde = Number(process.env.BRIGADE_PART_MAX_MS ?? GARDE_MS);
  const enfant = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-force-exit", "--test-timeout=300000", ...reporters, `--test-reporter=${pathToFileURL(join(import.meta.dirname, "en-cours.ts")).href}`, `--test-reporter-destination=${join(rapport, "ignore.txt")}`, ...joues], {
    cwd: join(RACINE_TESTS, ".."),
    stdio: "inherit",
    env: { ...environnement(process.env, gitCore), BRIGADE_SUIVI_DES_TESTS: suivi },
  });
  let cale = false;
  const minuteur = setTimeout(() => {
    cale = true;
    let coinces = "(none recorded)";
    try {
      coinces = readFileSync(suivi, "utf8") || coinces;
    } catch {}
    console.log(`::error title=${"part stalled".replaceAll(" ", "%20")}::${`the part ran over ${garde / 60_000} min; tests running now:\n${coinces}\nprocesses left: ${laisses()}`.replaceAll("%", "%25").replaceAll("\n", "%0A")}`);
    if (process.platform === "win32" && enfant.pid !== undefined) spawnSync("taskkill", ["/pid", String(enfant.pid), "/T", "/F"]);
    else enfant.kill("SIGKILL");
  }, garde);
  const statut = await new Promise<number | null>((fini) => enfant.on("exit", (code) => fini(code)));
  clearTimeout(minuteur);
  if (process.platform === "win32" && !cale) console.log(`::notice title=${"processes left".replaceAll(" ", "%20")}::${laisses()}`);
  const r = { status: cale ? 1 : statut };
  try {
    process.stdout.write(readFileSync(annotations, "utf8"));
  } catch {
    console.log("no annotations: the test runner wrote no report");
  }
  rmSync(rapport, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}
