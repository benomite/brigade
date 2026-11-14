// Le premier motif de renvoi de la relecture (#2770) : un export du code que
// seuls ses tests importent. Un script le voit sans relecture : pour chaque
// export d'un fichier que le changement touche, qui l'importe. Des fonctions
// sans effet : les fichiers leur sont donnés (`controle.ts` les lit).
import { posix } from "node:path";

// Un export que des tests importent et que rien d'autre n'importe.
export type ExportDeTests = { fichier: string; nom: string; testeurs: string[] };

// Un fichier de test : son nom, ou un dossier `test` ou `test-*` de son chemin.
export const estUnTest = (chemin: string) => /\.test\.[cm]?[jt]s$/.test(chemin) || chemin.split("/").some((dossier) => dossier === "test" || dossier.startsWith("test-"));

const EXPORT_NOMME = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LISTE = /^export\s*(?:type\s*)?\{([^}]*)\}(?!\s*from\b)/gm;
const IMPORT_OU_REEXPORT = /\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
const IMPORT_DYNAMIQUE = /\bimport\s*\(\s*["']([^"']+)["']/g;

// Les noms qu'un fichier exporte.
export function exportsDe(source: string): string[] {
  const noms = new Set<string>();
  for (const [, nom] of source.matchAll(EXPORT_NOMME)) if (nom !== undefined) noms.add(nom);
  for (const [, liste] of source.matchAll(EXPORT_LISTE)) {
    for (const element of (liste ?? "").split(",")) {
      const nom = element.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (nom) noms.add(nom);
    }
  }
  return [...noms];
}

// Ce qu'un fichier importe d'un autre : les noms pris un à un, ou `tout` quand
// il prend le module entier (`* as m`, `export *`, `import()`), où rien ne dit
// quel nom il lit.
type Prise = { chemin: string; noms: Set<string> | "tout" };

function prises(chemin: string, source: string, fichiers: ReadonlyMap<string, string>): Prise[] {
  const trouvees: Prise[] = [];
  const cible = (specifieur: string) => {
    if (!specifieur.startsWith(".")) return undefined;
    const voulu = posix.join(posix.dirname(chemin), specifieur);
    return fichiers.has(voulu) ? voulu : undefined;
  };
  for (const [, clause = "", specifieur = ""] of source.matchAll(IMPORT_OU_REEXPORT)) {
    const chemin = cible(specifieur);
    if (chemin === undefined) continue;
    const accolades = /\{([^}]*)\}/.exec(clause)?.[1];
    if (accolades === undefined || clause.includes("*")) {
      trouvees.push({ chemin, noms: "tout" });
      continue;
    }
    const noms = accolades.split(",").map((element) => element.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim() ?? "").filter(Boolean);
    trouvees.push({ chemin, noms: new Set(noms) });
  }
  for (const [, specifieur = ""] of source.matchAll(IMPORT_DYNAMIQUE)) {
    const chemin = cible(specifieur);
    if (chemin !== undefined) trouvees.push({ chemin, noms: "tout" });
  }
  return trouvees;
}

// Les exports des `aVerifier` que des tests importent et que nul code ne
// charge. Un export que personne n'importe n'en fait pas partie : il peut être
// lancé tel quel (un point d'entrée), seul le cas d'un test qui le tient seul
// est celui du motif. `fichiers` : chemin → source, tests compris.
export function exportsQueSesTestsAppellent(fichiers: ReadonlyMap<string, string>, aVerifier: readonly string[]): ExportDeTests[] {
  const importeurs = new Map<string, { code: Set<string>; tests: Map<string, Set<string>> }>();
  for (const [chemin, source] of fichiers) {
    for (const prise of prises(chemin, source, fichiers)) {
      const entree = importeurs.get(prise.chemin) ?? { code: new Set<string>(), tests: new Map<string, Set<string>>() };
      importeurs.set(prise.chemin, entree);
      const noms = prise.noms === "tout" ? exportsDe(fichiers.get(prise.chemin) ?? "") : [...prise.noms];
      if (estUnTest(chemin)) for (const nom of noms) entree.tests.set(nom, (entree.tests.get(nom) ?? new Set()).add(chemin));
      else for (const nom of noms) entree.code.add(nom);
    }
  }
  const trouves: ExportDeTests[] = [];
  for (const fichier of aVerifier) {
    const source = fichiers.get(fichier);
    if (source === undefined || estUnTest(fichier)) continue;
    const entree = importeurs.get(fichier);
    for (const nom of exportsDe(source)) {
      const testeurs = entree?.tests.get(nom);
      if (testeurs !== undefined && !entree?.code.has(nom)) trouves.push({ fichier, nom, testeurs: [...testeurs].sort() });
    }
  }
  return trouves;
}
