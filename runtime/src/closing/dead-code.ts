// Le code mort que la fermeture repère : un export nommé d'un module
// TypeScript ou JavaScript que rien d'autre ne nomme. Du texte cherché dans du
// texte, et la prudence est du côté du vivant : un nom que son propre fichier
// réemploie, ou qu'un autre fichier écrit — fût-ce dans un commentaire —,
// n'est pas donné pour mort. Elle repère, elle ne juge pas : un export qu'un
// framework lit par convention n'est nommé par personne et vit pourtant.
import type { Texte } from "./reading.ts";

// Les modules dont les exports sont regardés. Une déclaration d'ambiance
// (`.d.ts`) n'exporte rien qui s'importe.
export const MODULE = /(?<!\.d)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
// Ce qui ne fait rien vivre : être décrit n'est pas être appelé.
const DOC = /\.(md|mdx|markdown|rst|txt)$/;
// Un export nommé, déclaré en tête de ligne. Ni l'export par défaut, ni une
// liste `export { … }`, ni une déstructuration : ceux-là ne sont pas jugés.
const EXPORT = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|const\s+enum|const|let|var|class|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm;
const NOM = /[A-Za-z_$][\w$]*/g;

// `tests` : les fichiers de test qui le référencent, quand eux seuls le font —
// vide : rien ne le référence.
export type Mort = { chemin: string; ligne: number; nom: string; tests: string[] };

// Les exports morts, fichier par fichier.
export function repererCodeMort(textes: Texte[]): Mort[] {
  const exports = textes
    .filter(({ chemin }) => MODULE.test(chemin))
    .flatMap(({ chemin, texte }) => [...texte.matchAll(EXPORT)].map((trouve) => ({ chemin, nom: trouve[1] ?? "", ligne: texte.slice(0, trouve.index).split("\n").length })));
  // Pour chaque nom exporté, combien de fois chaque fichier l'écrit.
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
      // Sa déclaration l'écrit une fois : au-delà, son fichier s'en sert.
      if ((fichiers.get(chemin) ?? 0) > 1) return [];
      const ailleurs = [...fichiers.keys()].filter((autre) => autre !== chemin);
      if (ailleurs.length === 0) return [{ chemin, ligne, nom, tests: [] }];
      // L'aide d'un test vit des tests ; le reste, non.
      return TEST.test(chemin) || !ailleurs.every((autre) => TEST.test(autre)) ? [] : [{ chemin, ligne, nom, tests: ailleurs.sort() }];
    })
    .sort((a, b) => a.chemin.localeCompare(b.chemin) || a.ligne - b.ligne);
}
