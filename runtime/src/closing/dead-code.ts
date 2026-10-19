// The dead code the closing spots: a named export of a TypeScript or
// JavaScript module that nothing else names. Text searched in text, and caution
// is on the side of the living: a name its own file reuses, or another file
// writes — even in a comment — is not declared dead. It spots, it does not
// judge: an export a framework reads by convention is named by nobody and
// lives all the same.
import type { Texte } from "./reading.ts";

// The modules whose exports are looked at. An ambient declaration (`.d.ts`)
// exports nothing that can be imported.
export const MODULE = /(?<!\.d)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
// What keeps nothing alive: being described is not being called.
const DOC = /\.(md|mdx|markdown|rst|txt)$/;
// A named export, declared at the start of a line. Neither the default export,
// nor an `export { … }` list, nor a destructuring: those are not judged.
const EXPORT = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|const\s+enum|const|let|var|class|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm;
const NOM = /[A-Za-z_$][\w$]*/g;

// `tests`: the test files that reference it, when only they do — empty:
// nothing references it.
export type Mort = { chemin: string; ligne: number; nom: string; tests: string[] };

// The dead exports, file by file.
export function repererCodeMort(textes: Texte[]): Mort[] {
  const exports = textes
    .filter(({ chemin }) => MODULE.test(chemin))
    .flatMap(({ chemin, texte }) => [...texte.matchAll(EXPORT)].map((trouve) => ({ chemin, nom: trouve[1] ?? "", ligne: texte.slice(0, trouve.index).split("\n").length })));
  // For each exported name, how many times each file writes it.
  const ecrits = new Map<string, Map<string, number>>(exports.map(({ nom }) => [nom, new Map()]));
  for (const { chemin, texte } of textes) {
    if (DOC.test(chemin)) continue;
    for (const [nom] of texte.matchAll(NOM)) {
      const fichiers = ecrits.get(nom);
      if (fichiers) fichiers.set(chemin, (fichiers.get(chemin) ?? 0) + 1);
    }
  }
  return exports
    .flatMap(({ chemin, ligne, nom }): Mort[] => {
      const fichiers = ecrits.get(nom) ?? new Map<string, number>();
      // Its declaration writes it once: beyond that, its own file uses it.
      if ((fichiers.get(chemin) ?? 0) > 1) return [];
      const ailleurs = [...fichiers.keys()].filter((autre) => autre !== chemin);
      if (ailleurs.length === 0) return [{ chemin, ligne, nom, tests: [] }];
      // A test helper lives off the tests; the rest does not.
      return TEST.test(chemin) || !ailleurs.every((autre) => TEST.test(autre)) ? [] : [{ chemin, ligne, nom, tests: ailleurs.sort() }];
    })
    .sort((a, b) => a.chemin.localeCompare(b.chemin) || a.ligne - b.ligne);
}
