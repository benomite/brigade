// Les tests que le cook joue (#4301) : ceux qui couvrent les fichiers de sa zone — ceux du dossier de tests
// qui reflète la zone (`runtime/src/a/` → `runtime/test/a/`) — et ceux qui importent ces fichiers. La suite
// entière tourne en CI et à la pass, jamais chez le cook. Sans test pour la zone, la sélection reste vide et
// la consigne dit au cook d'en écrire un : jamais de repli sur la suite entière. Lit le disque, n'écrit rien.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export type SelectionDesTests = { tests: string[]; aEcrire: boolean; consigne: string };

const TEST = /\.test\.ts$/;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.[^"']*)["']/g;

const normalise = (chemin: string) => chemin.replace(/^\.\//, "").replace(/\/+$/, "");

function fichiersDeTest(racine: string, dossier: string): string[] {
  let entrees;
  try {
    entrees = readdirSync(join(racine, dossier), { withFileTypes: true });
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
  return entrees.flatMap((entree) => {
    if (entree.name === "node_modules") return [];
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) return fichiersDeTest(racine, chemin);
    return TEST.test(entree.name) ? [chemin] : [];
  });
}

// Le dossier de tests qui reflète un chemin de la zone : le segment `src` devient `test`.
function reflet(chemin: string): string | null {
  const segments = chemin.split("/");
  const rang = segments.indexOf("src");
  if (rang === -1) return null;
  return [...segments.slice(0, rang), "test", ...segments.slice(rang + 1)].join("/");
}

const sous = (chemin: string, base: string) => chemin === base || chemin.startsWith(`${base}/`);

export function selectionnerTests(zone: string[], racine: string): SelectionDesTests {
  const chemins = [...new Set(zone.map(normalise).filter((chemin) => chemin !== ""))];
  const reflets = chemins.flatMap((chemin) => reflet(chemin) ?? []);
  const toutesLesRacines = [...new Set(chemins.map((chemin) => chemin.split("/")[0]!))];
  const candidats = [...new Set(toutesLesRacines.flatMap((dossier) => fichiersDeTest(racine, dossier)))];
  const choisis = candidats.filter((test) => {
    if (chemins.some((chemin) => sous(test, chemin))) return true;
    if (reflets.some((miroir) => sous(test, miroir) || test === miroir.replace(/(\.ts)?$/, ".test.ts"))) return true;
    const source = readFileSync(join(racine, test), "utf8");
    for (const [, specifieur] of source.matchAll(IMPORT)) {
      const cible = relative(racine, resolve(dirname(join(racine, test)), specifieur!)).split(sep).join("/");
      if (chemins.some((chemin) => sous(cible, chemin))) return true;
    }
    return false;
  }).sort();
  const aEcrire = choisis.length === 0;
  return { tests: choisis, aEcrire, consigne: consigneDesTestsDeLaZone(chemins, choisis) };
}

// Ce que le cook lit : les tests à jouer, ou l'ordre d'en écrire un ; dans les deux cas, la suite entière n'est pas à lui.
export function consigneDesTestsDeLaZone(zone: string[], tests: string[]): string {
  const suite = "The full test suite runs in CI and in the pass: do not run it yourself (not `npm test`, not a whole folder of tests).";
  if (zone.length === 0) return `Your ticket names no zone, so no test list is chosen for you: play only the test files that cover what you change. ${suite}`;
  if (tests.length === 0) return `No existing test covers your zone (${zone.map((chemin) => `\`${chemin}\``).join(", ")}): write a test for it and play that one. ${suite}`;
  return `Play only these tests, those of your zone and those that import it: ${tests.map((chemin) => `\`${chemin}\``).join(", ")}. ${suite}`;
}
