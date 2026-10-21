// Les lignes d'un fichier qu'un relevé de couverture de V8 dit exécutées.
//
// V8 rend, pour chaque script, ses fonctions, et pour chacune des plages
// imbriquées — la fonction entière, puis ses blocs — avec le nombre de fois où
// chacune a tourné. Ce qui compte en un point du source est la plage la plus
// intérieure qui le contient : une branche jamais prise est un bloc à zéro dans
// une fonction appelée, une fonction appelée une plage non nulle dans un module
// qui, lui, ne l'est plus. Une ligne est couverte quand un de ses caractères
// non blancs l'est ; une branche prise ou non se lit donc ligne à ligne.
//
// Les positions de V8 se comptent dans le source qu'il a compilé : pour un
// fichier TypeScript, le source dépouillé de ses types par Node, où chaque type
// devient autant d'espaces qu'il avait d'octets — pas de caractères.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { isAbsolute, relative } from "node:path";

export type PlageV8 = { startOffset: number; endOffset: number; count: number };
export type FonctionV8 = { functionName: string; ranges: PlageV8[]; isBlockCoverage?: boolean };
export type ScriptV8 = { scriptId?: string; url: string; functions: FonctionV8[] };

// Des lignes, par intervalles fermés, croissants et disjoints : [[1, 3], [7, 7]].
export type Intervalles = Array<[number, number]>;

// Le chemin du fichier relatif à la racine, en `/` — ou null s'il n'est pas du
// code que les tests vérifient : hors de la racine, sous `node_modules`, ou
// sous un répertoire `test` ou `tests` — les tests, leurs aides et leurs
// exemples.
export function cheminDuCode(fichier: string, racine: string): string | null {
  const chemin = relative(racine, fichier);
  if (chemin === "" || chemin.startsWith("..") || isAbsolute(chemin)) return null;
  const segments = chemin.split(/[\\/]/);
  if (segments.some((segment) => segment === "node_modules" || segment === "test" || segment === "tests")) return null;
  return segments.join("/");
}

// Le source tel que V8 l'a compilé.
export function sourceCompile(fichier: string): string {
  const source = readFileSync(fichier, "utf8");
  if (!/\.[cm]?ts$/.test(fichier)) return source;
  // Node le dit expérimental une fois par process : dans un fichier de tests,
  // l'avertissement s'afficherait au milieu de son rapport.
  const avertir = process.emitWarning;
  process.emitWarning = (() => {}) as typeof process.emitWarning;
  try {
    return stripTypeScriptTypes(source);
  } catch {
    // Ce que le dépouillement refuse, Node ne l'a pas chargé non plus.
    return source;
  } finally {
    process.emitWarning = avertir;
  }
}

// Ce qu'il faut d'un source pour y situer une position : où commence chaque
// ligne, et où commence et finit ce qu'elle a de non blanc.
export type Lignes = { debuts: number[]; premiers: number[]; derniers: number[] };

export function decouper(source: string): Lignes {
  const debuts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) debuts.push(i + 1);
  const premiers: number[] = [];
  const derniers: number[] = [];
  for (let l = 0; l < debuts.length; l++) {
    const debut = debuts[l] ?? 0;
    const fin = l + 1 < debuts.length ? (debuts[l + 1] ?? 0) - 1 : source.length;
    let premier = debut;
    while (premier < fin && /\s/.test(source[premier] ?? "")) premier++;
    let dernier = fin - 1;
    while (dernier >= premier && /\s/.test(source[dernier] ?? "")) dernier--;
    // Une ligne blanche : premier > dernier, aucune plage ne la touche.
    premiers.push(premier);
    derniers.push(dernier);
  }
  return { debuts, premiers, derniers };
}

// L'indice (à partir de 0) de la ligne qui contient la position.
function ligneDe(lignes: Lignes, position: number): number {
  let [bas, haut] = [0, lignes.debuts.length - 1];
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if ((lignes.debuts[milieu] ?? 0) <= position) bas = milieu;
    else haut = milieu - 1;
  }
  return bas;
}

// Les morceaux du source où la plage la plus intérieure a tourné, en [début,
// fin[, croissants et disjoints.
export function morceauxExecutes(fonctions: FonctionV8[]): Array<[number, number]> {
  const plages = fonctions.flatMap((f) => f.ranges);
  if (!plages.some((p) => p.count > 0)) return [];
  // L'englobante avant l'englobée : par début croissant, puis fin décroissante.
  // À plage égale, la dernière rendue l'emporte.
  const triees = plages.map((p, rang) => ({ ...p, rang })).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset || a.rang - b.rang);
  const morceaux: Array<[number, number]> = [];
  const poser = (debut: number, fin: number, compte: number) => {
    if (compte <= 0 || fin <= debut) return;
    const dernier = morceaux.at(-1);
    if (dernier !== undefined && dernier[1] === debut) dernier[1] = fin;
    else morceaux.push([debut, fin]);
  };
  const pile: PlageV8[] = [];
  let position = 0;
  const fermerJusqua = (limite: number) => {
    for (let ouverte = pile.at(-1); ouverte !== undefined && ouverte.endOffset <= limite; ouverte = pile.at(-1)) {
      poser(position, ouverte.endOffset, ouverte.count);
      position = Math.max(position, ouverte.endOffset);
      pile.pop();
    }
  };
  for (const plage of triees) {
    fermerJusqua(plage.startOffset);
    const englobante = pile.at(-1);
    if (englobante !== undefined) poser(position, plage.startOffset, englobante.count);
    position = Math.max(position, plage.startOffset);
    pile.push(plage);
  }
  fermerJusqua(Number.POSITIVE_INFINITY);
  return morceaux;
}

// Les lignes (à partir de 1) qu'un relevé dit exécutées, en intervalles.
export function lignesExecutees(fonctions: FonctionV8[], lignes: Lignes): Intervalles {
  const intervalles: Intervalles = [];
  const ajouter = (ligne: number) => {
    const dernier = intervalles.at(-1);
    if (dernier !== undefined && dernier[1] >= ligne) return;
    if (dernier !== undefined && dernier[1] === ligne - 1) dernier[1] = ligne;
    else intervalles.push([ligne, ligne]);
  };
  for (const [debut, fin] of morceauxExecutes(fonctions)) {
    const derniere = ligneDe(lignes, fin - 1);
    for (let l = ligneDe(lignes, debut); l <= derniere; l++) {
      const premier = Math.max(debut, lignes.premiers[l] ?? 0);
      const dernierCaractere = Math.min(fin - 1, lignes.derniers[l] ?? -1);
      if (premier <= dernierCaractere) ajouter(l + 1);
    }
  }
  return intervalles;
}

// La réunion de deux suites d'intervalles.
export function reunir(a: Intervalles, b: Intervalles): Intervalles {
  const tous = [...a, ...b].sort((x, y) => x[0] - y[0]);
  const reunis: Intervalles = [];
  for (const [debut, fin] of tous) {
    const dernier = reunis.at(-1);
    if (dernier !== undefined && debut <= dernier[1] + 1) dernier[1] = Math.max(dernier[1], fin);
    else reunis.push([debut, fin]);
  }
  return reunis;
}
