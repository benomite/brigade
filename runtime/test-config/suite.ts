// La suite du runtime, jouée vite (#2085) : les mêmes fichiers, les mêmes
// options que `npm test` (`--test-force-exit`, 120 s par test), mais
// ordonnancés. Le lanceur de `node --test` trie ses fichiers par nom et en joue
// cinq à la fois : un fichier de 40 s tiré en dernier tient la suite seul,
// pendant que les cœurs attendent. Ici :
//   - les fichiers partent du plus long au plus court, d'après `durees.tsv`
//     (ce qu'a duré chacun au dernier relevé) ; un fichier qu'il ne connaît pas
//     part en tête, son coût est inconnu ;
//   - autant de fichiers à la fois que la machine a de cœurs logiques : la
//     suite est bornée par le processeur, et au-delà l'horloge ne baisse plus
//     (100,8 s à 8, 100,9 et 101,3 s à 11, 102,9 s à 16 sur une box de 8) ;
//   - chaque fichier rend tout son relevé avant de sortir
//     (`sortie-bloquante.ts`) : sous `--test-force-exit`, un lanceur en retard
//     en perdait la fin, et des tests manquaient au compte ;
//   - le répertoire temporaire en mémoire quand le poste en a un (comme les
//     gates, #1915), le cache de compilation de Node, le `git` de `git
//     --exec-path` en tête du PATH (comme le script `test`).
// La sortie est celle du lanceur (`spec`) : les gates y lisent `ℹ tests` et
// `ℹ duration_ms`. Une ligne de plus, à la fin, dit le nombre de tests et
// l'horloge de toute la suite.
//
// Usage, depuis `runtime/` :
//   node test-config/suite.ts [<fichier ou motif>...]   (défaut : test/**/*.test.ts)
// Options :
//   --concurrence <n>   fichiers joués à la fois (défaut : BRIGADE_TESTS_CONCURRENCE,
//                       sinon le nombre de cœurs logiques)
//   --relever <tsv>     écrit l'horloge de chaque fichier joué, `secondes<TAB>fichier`,
//                       du plus long au plus court : de quoi refaire `durees.tsv`
//   --tap <fichier>     écrit aussi la sortie TAP du passage (pour releve-tap.py)
// Code de sortie : 0 si la suite est verte, 1 sinon, 2 sur un usage refusé.
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, globSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { run } from "node:test";
import { spec, tap } from "node:test/reporters";
import { pathToFileURL } from "node:url";

const RUNTIME = resolve(import.meta.dirname, "..");
const DUREES = join(import.meta.dirname, "durees.tsv");
const MOTIF = "test/**/*.test.ts";
// Le répertoire temporaire en mémoire ne se prend qu'avec cette place libre :
// un `/dev/shm` de conteneur, souvent 64 Mo, se remplirait en cours de suite.
const TEMPORAIRE_MIN_OCTETS = 2048 * 1024 * 1024;

function refuser(message: string): never {
  console.error(`suite: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const motifs: string[] = [];
let concurrence = Number(process.env.BRIGADE_TESTS_CONCURRENCE || availableParallelism());
let relever: string | undefined;
let sortieTap: string | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? "";
  const valeur = () => args[++i] ?? refuser(`${arg} attend une valeur`);
  if (arg === "--concurrence") concurrence = Number(valeur());
  else if (arg === "--relever") relever = resolve(valeur());
  else if (arg === "--tap") sortieTap = resolve(valeur());
  else if (arg.startsWith("--")) refuser(`option inconnue : ${arg}`);
  else motifs.push(arg);
}
if (!Number.isInteger(concurrence) || concurrence < 1) refuser(`concurrence illisible : ${concurrence}`);

// Les fichiers, relatifs à `runtime/` : un motif se développe, un fichier se
// prend tel quel. Chacun une fois.
const fichiers = [
  ...new Set(
    (motifs.length > 0 ? motifs : [MOTIF]).flatMap((motif) =>
      /[*?[{]/.test(motif) ? globSync(motif, { cwd: RUNTIME }) : [relative(RUNTIME, resolve(motif))],
    ),
  ),
];
if (fichiers.length === 0) refuser(`aucun fichier de test ne répond à : ${motifs.join(" ")}`);

// L'ordre : les inconnus d'abord, par nom ; puis du plus long au plus court.
const durees = new Map<string, number>();
if (existsSync(DUREES)) {
  for (const ligne of readFileSync(DUREES, "utf8").split("\n")) {
    const [secondes, fichier] = ligne.split("\t");
    if (fichier && !Number.isNaN(Number(secondes))) durees.set(fichier, Number(secondes));
  }
}
fichiers.sort((a, b) => (durees.get(b) ?? Infinity) - (durees.get(a) ?? Infinity) || a.localeCompare(b));

// L'environnement des fichiers de test, et de tout ce qu'ils lancent. Le cache
// de compilation reste où le script `test` le met : il sert d'un passage à
// l'autre.
process.env.NODE_COMPILE_CACHE ||= join(process.env.TMPDIR || "/tmp", "brigade-runtime-compile-cache");
let temporaire: string | undefined;
if (!process.env.TMPDIR) {
  try {
    const libre = statfsSync("/dev/shm");
    // 0x01021994 : TMPFS_MAGIC.
    if (libre.type === 0x01021994 && libre.bavail * libre.bsize >= TEMPORAIRE_MIN_OCTETS) {
      temporaire = mkdtempSync("/dev/shm/brigade-suite-");
      process.env.TMPDIR = temporaire;
    }
  } catch {
    // Pas de /dev/shm (macOS, Windows) : le répertoire temporaire du système.
  }
}
try {
  const gitCore = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  if (gitCore) process.env.PATH = `${gitCore}:${process.env.PATH ?? ""}`;
} catch {
  // Sans git, les tests qui en ont besoin le diront.
}
// L'état et le port d'un runtime lancé à la main ne parviennent à aucun test.
delete process.env.BRIGADE_STATE_DIR;
delete process.env.BRIGADE_PORT;

// Les petits fichiers, joués à plusieurs par process. Un fichier de moins
// de quelques secondes en paie une bonne part à démarrer : son Node, le lanceur
// de tests, et les modules du runtime qu'il charge — les mêmes que son voisin.
// Un lot les charge une fois, puis joue leurs tests l'un après l'autre, dans
// l'ordre des fichiers (#2085). N'entre dans un lot qu'un fichier dont la durée
// est connue et courte, et qui ne touche à rien de ce que ses voisins partagent
// : l'environnement du process, son répertoire, ses signaux, le compteur
// d'appels à GitHub du process (`installerLimite`), les doublures
// globales (`t.mock` se défait à la fin de son test). Un fichier écarté se joue
// seul, comme avant.
//
// `outils.ts` tient deux choses par process, que le lot partage :
//   - `temporaireDuFichier` pose le TMPDIR du process et vérifie, à son dernier
//     test, qu'il est vide, puis lâche tout ce que les fichiers gardaient
//     (`repertoireDuFichier`). Un tel fichier ouvre son lot, seul de son
//     espèce : ses tests passent avant ceux de ses voisins, et rien de ce qu'ils
//     sèment ne précède sa vérification ;
//   - un fichier qui garde des répertoires (`repertoireDuFichier`, `aides/box.ts`)
//     n'entre donc jamais dans le lot d'un fichier à temporaire.
const LOT_SECONDES_PAR_FICHIER = 4;
const LOT_SECONDES = 8;
const PARTAGE =
  /process\.env(\.\w+|\[[^\]]+\])\s*(=[^=]|\?\?=|\|\|=)|delete process\.env|Object\.assign\(process\.env|process\.chdir|process\.(on|once|exitCode|umask)\b|(?<![.\w])mock\.(timers|module|method)|globalThis\.\w+\s*=[^=]|setGlobalDispatcher|installerLimite|limiteDuProcess|^(before|after|beforeEach|afterEach)\(/m;
const GARDE = /repertoireDuFichier|aides\/box\.ts/;
type Espece = "seul" | "temporaire" | "garde" | "libre";
const espece = (fichier: string): Espece => {
  if (!((durees.get(fichier) ?? Infinity) < LOT_SECONDES_PAR_FICHIER)) return "seul";
  const source = readFileSync(join(RUNTIME, fichier), "utf8");
  if (PARTAGE.test(source)) return "seul";
  const temporaire = source.includes("temporaireDuFichier");
  const garde = GARDE.test(source);
  return temporaire && garde ? "seul" : temporaire ? "temporaire" : garde ? "garde" : "libre";
};
const especes = new Map(fichiers.map((fichier) => [fichier, espece(fichier)] as const));
const deLEspece = (nom: Espece) => fichiers.filter((fichier) => especes.get(fichier) === nom);
// Chaque fichier à temporaire ouvre un lot, que des fichiers libres remplissent ;
// puis les fichiers qui gardent et les libres qui restent, ensemble.
const lots: string[][] = [];
const libres = deLEspece("libre");
const remplir = (lot: string[], candidats: string[]) => {
  let duree = lot.reduce((somme, fichier) => somme + (durees.get(fichier) ?? 0), 0);
  while (candidats.length > 0 && duree + (durees.get(candidats[0] ?? "") ?? 0) <= LOT_SECONDES) {
    const fichier = candidats.shift() ?? "";
    lot.push(fichier);
    duree += durees.get(fichier) ?? 0;
  }
  lots.push(lot);
};
for (const fichier of deLEspece("temporaire")) remplir([fichier], libres);
const restants = [...deLEspece("garde"), ...libres].sort((a, b) => fichiers.indexOf(a) - fichiers.indexOf(b));
while (restants.length > 0) remplir([restants.shift() ?? ""], restants);
const seul = (fichier: string) => especes.get(fichier) === "seul";
const dossierDesLots = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "brigade-lots-"));
const membres = new Map<string, string[]>();
const joues = [
  ...fichiers.filter(seul).map((fichier) => join(RUNTIME, fichier)),
  ...lots.map((lot, rang) => {
    const chemin = join(dossierDesLots, `lot-${rang + 1}.mjs`);
    writeFileSync(chemin, lot.map((fichier) => `import ${JSON.stringify(pathToFileURL(join(RUNTIME, fichier)).href)};\n`).join(""));
    membres.set(chemin, lot);
    return chemin;
  }),
];

const debut = performance.now();
const flux = run({
  files: joues,
  cwd: RUNTIME,
  concurrency: concurrence,
  timeout: 120_000,
  forceExit: true,
  // Sans elle, `forceExit` perd la fin du relevé d'un fichier quand ce
  // lanceur lit en retard (`sortie-bloquante.ts`).
  execArgv: ["--import", pathToFileURL(join(import.meta.dirname, "sortie-bloquante.ts")).href],
});
const horloges: Array<[number, string]> = [];
let verte = false;
let tests = 0;
flux.on("test:complete", (donnee) => {
  // Le test de niveau 0 qui porte le chemin du fichier : le fichier entier.
  // Un lot : sa durée, partagée entre ses fichiers.
  if (donnee.nesting === 0 && donnee.file !== undefined && donnee.name === donnee.file) {
    const lot = membres.get(donnee.file);
    if (lot) for (const fichier of lot) horloges.push([donnee.details.duration_ms / 1000 / lot.length, fichier]);
    else horloges.push([donnee.details.duration_ms / 1000, relative(RUNTIME, donnee.file)]);
  }
});
flux.on("test:summary", (donnee) => {
  if (donnee.file !== undefined) return;
  verte = donnee.success;
  tests = donnee.counts.tests;
});
const fins: Array<Promise<unknown>> = [];
if (sortieTap) fins.push(finished(flux.compose(tap).pipe(createWriteStream(sortieTap))));
const lu = flux.compose(spec);
lu.pipe(process.stdout, { end: false });
fins.push(finished(lu));
void Promise.all(fins).then(() => {
  const secondes = (performance.now() - debut) / 1000;
  if (relever) {
    horloges.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
    writeFileSync(relever, horloges.map(([s, f]) => `${s.toFixed(1)}\t${f}\n`).join(""));
  }
  rmSync(dossierDesLots, { recursive: true, force: true });
  if (temporaire) rmSync(temporaire, { recursive: true, force: true });
  // Après le relevé du lanceur, que `spec` écrit à la fin du flux.
  process.stdout.write(`suite: ${tests} tests, ${fichiers.length} files (${lots.reduce((n, lot) => n + lot.length, 0)} in ${lots.length} batches), ${secondes.toFixed(1)} s wall-clock, concurrency ${concurrence}, ${verte ? "green" : "red"}\n`, () =>
    process.exit(verte ? 0 : 1),
  );
});
