// Un rouge de CI qui n'est pas celui de la livraison (#1496) : chaque test en
// échec est hors de ce qu'elle change. Un test de bout en bout instable, un
// délai dépassé sur un runner Windows : la livraison n'y est pour rien, et le
// geste du chef était de relancer les jobs en échec. La pass le fait d'elle-même,
// une fois par livraison, au lieu de renvoyer un cook ou de remonter.
//
// Le rouge n'est mis hors de la livraison que si cela s'établit : chaque job
// rouge dit, dans son journal, les tests en échec, chacun se retrouve dans le
// dépôt, et aucun n'est touché par ce que la livraison change. Le doute le
// laisse à la livraison — le rouge reste un verdict, comme avant.
//
// « Touché » se lit comme les gates du dépôt de la brigade choisissent les
// tests qu'un changement touche (`.claude/brigade/tests-touches.mjs`), en plus
// large : un test est touché s'il est modifié, si un fichier modifié est dans
// ce qu'il importe ou nomme — lui ou ses helpers, de proche en proche, le code
// du produit qu'ils importent étant une feuille —, ou si la livraison change
// ce qui règle des suites entières (un manifest, une config de compilation, la
// CI, les gates).
import { posix } from "node:path";

// Ce qui règle des suites entières, ou la CI elle-même : changé, tout test est touché.
const GLOBAUX = [/(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json)$/, /^\.github\//, /^\.claude\/brigade\//];
const IMPORT = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["'`](\.{1,2}\/[^"'`]+)["'`]/g;
// Un import de type ne fait rien tourner.
const IMPORT_DE_TYPE = /^\s*import\s+type\b[^;]*;/gm;
const EXTENSIONS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"];
// Le répertoire des tests d'un fichier de test : ce qui est dessous est à lui
// (ses helpers), le reste est du produit.
const RACINE_DES_TESTS = /^(.*?(?:^|\/)(?:test|tests|__tests__))\//;

// La ligne du résumé du reporter `spec` de `node --test` qui situe un test en
// échec : `test at <fichier>:<ligne>:<colonne>`.
const TEST_EN_ECHEC = /(?:^|\s)test at (.+?):\d+:\d+\s*$/;
const COULEURS = /\x1b\[[0-9;]*m/g;

// Les fichiers de test qu'un journal de job dit en échec, tels qu'il les
// nomme — une fois chacun. null : il n'en nomme aucun. Le rouge n'est alors
// pas celui d'un test qui se lise ici — un contrôle de types, un lint, un job
// arrêté à son plafond, un autre reporter.
export function testsEnEchec(journal: string): string[] | null {
  const nommes = new Set<string>();
  for (const brute of journal.split(/\r?\n/)) {
    const lu = TEST_EN_ECHEC.exec(brute.replace(COULEURS, ""))?.[1];
    if (lu === undefined) continue;
    const chemin = lu
      .trim()
      .replace(/^file:\/\/\/?/, "")
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    if (chemin !== "") nommes.add(chemin);
  }
  return nommes.size === 0 ? null : [...nommes];
}

const HORODATAGE = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const TEST_EN_ECHEC_NOMME = /^✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?$/;
const MAX_TESTS = 8;
const MAX_LIGNES = 6;
const MAX_LARGEUR = 300;

// Les tests qu'un journal de job dit en échec, avec leurs lignes d'erreur —
// ce que le cook renvoyé lit au lieu de chercher le journal lui-même (#1867).
// Chaque test est cité une fois, ses lignes d'erreur sont celles, indentées,
// qui suivent son `✖` ; le plus informatif des deux passages du reporter est gardé.
// Vide : le journal ne nomme aucun test (un lint, un contrôle de types).
export function echecsDuJournal(journal: string): Array<{ test: string; lignes: string[] }> {
  const echecs = new Map<string, string[]>();
  let courant: string[] | null = null;
  for (const brute of journal.split(/\r?\n/)) {
    const ligne = brute.replace(COULEURS, "").replace(HORODATAGE, "").trimEnd();
    const nom = TEST_EN_ECHEC_NOMME.exec(ligne)?.[1];
    if (nom !== undefined) {
      courant = null;
      if (/^failing tests:?$/.test(nom)) continue;
      const lignes = echecs.get(nom) ?? [];
      echecs.set(nom, lignes);
      courant = lignes;
    } else if (courant !== null && /^\s+\S/.test(ligne)) {
      if (courant.length < MAX_LIGNES) courant.push(ligne.trim().slice(0, MAX_LARGEUR));
    } else {
      courant = null;
    }
  }
  return [...echecs].slice(0, MAX_TESTS).map(([test, lignes]) => ({ test, lignes }));
}

// Ce que la pass lit de la livraison pour attribuer un rouge.
export type Lecture = {
  // Les fichiers qu'elle change par rapport à la base.
  changes: string[];
  // Les fichiers du dépôt, tels qu'elle les porte.
  fichiers: string[];
  // Un fichier, tel qu'elle le porte ; null s'il n'y est pas.
  lire(chemin: string): string | null;
};

// `etranger` : chaque test en échec est hors de ce que la livraison change —
// `tests` les nomme, en chemins du dépôt. Sinon, `raison` dit pourquoi le
// rouge reste le sien.
export type Attribution = { etranger: true; tests: string[] } | { etranger: false; raison: string };

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Le fichier du dépôt qu'un journal nomme : son chemin y est relatif au
// répertoire où la suite tournait (`test/rail.test.ts` pour `runtime/`), ou
// absolu sur le runner. Un seul doit répondre — sinon, rien ne dit lequel.
function retrouver(nomme: string, fichiers: string[]): string | null {
  const candidats = fichiers.filter((fichier) => fichier === nomme || fichier.endsWith(`/${nomme}`) || nomme.endsWith(`/${fichier}`));
  return candidats.length === 1 ? candidats[0]! : null;
}

export function attribuer(nommes: string[], lecture: Lecture): Attribution {
  const { changes } = lecture;
  const global = changes.find((fichier) => GLOBAUX.some((motif) => motif.test(fichier)));
  if (global !== undefined) return { etranger: false, raison: `la livraison change \`${global}\`, qui règle des suites entières` };
  const connus = new Set([...lecture.fichiers, ...changes]);
  const changees = new Set(changes);
  // Un fichier changé se cite par son chemin, ou par son nom seul — pas comme
  // un morceau d'un autre nom (`rail.ts` n'est pas cité par `montrer-rail.ts`).
  const citations = changes.map((fichier) => ({ fichier, motif: new RegExp(`(?<![\\w.@-])${echapper(posix.basename(fichier))}(?![\\w])|${echapper(fichier)}`) }));
  const textes = new Map<string, string | null>();
  const texte = (fichier: string) => {
    if (!textes.has(fichier)) textes.set(fichier, lecture.lire(fichier));
    return textes.get(fichier) ?? null;
  };
  const resoudre = (depuis: string, cible: string): string | null => {
    const chemin = posix.normalize(posix.join(posix.dirname(depuis), cible));
    const essais = [chemin, ...EXTENSIONS.map((extension) => `${chemin}${extension}`), ...EXTENSIONS.map((extension) => `${chemin}/index${extension}`)];
    return essais.find((essai) => connus.has(essai)) ?? null;
  };

  const tests: string[] = [];
  for (const nomme of nommes) {
    const test = retrouver(nomme, [...connus]);
    if (test === null) return { etranger: false, raison: `le test en échec \`${nomme}\` ne se retrouve pas dans le dépôt, ou pas d'une seule façon` };
    if (changees.has(test)) return { etranger: false, raison: `la livraison change le test en échec \`${test}\`` };
    const racine = RACINE_DES_TESTS.exec(test)?.[1] ?? posix.dirname(test);
    const desTests = (fichier: string) => fichier.startsWith(`${racine}/`);
    // Le test et ses helpers, de proche en proche ; le produit qu'ils importent est une feuille.
    const vus = new Set([test]);
    const pile = [test];
    while (pile.length > 0) {
      const fichier = pile.pop()!;
      const lu = texte(fichier);
      if (lu === null) {
        if (fichier === test) return { etranger: false, raison: `le test en échec \`${test}\` ne se lit pas` };
        continue;
      }
      const par = fichier === test ? "" : `passe par \`${fichier}\`, qui `;
      const code = lu.replace(IMPORT_DE_TYPE, "");
      for (const [, cible] of code.matchAll(IMPORT)) {
        const importe = resoudre(fichier, cible!);
        if (importe === null || vus.has(importe)) continue;
        vus.add(importe);
        if (changees.has(importe)) return { etranger: false, raison: `le test en échec \`${test}\` ${par}importe \`${importe}\`, que la livraison change` };
        if (desTests(importe)) pile.push(importe);
      }
      const cite = citations.find(({ motif }) => motif.test(code));
      if (cite !== undefined) return { etranger: false, raison: `le test en échec \`${test}\` ${par}nomme \`${cite.fichier}\`, que la livraison change` };
    }
    tests.push(test);
  }
  return { etranger: true, tests };
}
