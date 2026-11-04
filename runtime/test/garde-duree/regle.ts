// La règle des 2 s (#2129) : aucun test ne dure plus de 2 s, aucune garde (`jusqua` ou toute attente bornée)
// ne dépasse 2 s. Ce module juge ; `reporteur.ts` lui donne les durées mesurées, `garde-duree.test.ts` les
// gardes écrites. Les fautes d'aujourd'hui sont dans `exceptions.ts`, et une exception inutile est elle-même
// une faute : la liste ne peut pas rancir.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMITE_MS = 2000;
export type Exception = { file: string; test: string } | { file: string; garde: string };
export type Garde = { file: string; garde: string; ms: number; line: number };

// Le chemin d'un fichier depuis la racine du runtime, toujours en `/` (sous Windows le système écrit `\`).
export const chemin = (racine: string, fichier: string): string => relative(racine, fichier).split(sep).join("/");

const RACINE_RUNTIME = fileURLToPath(new URL("../..", import.meta.url));
const ICI = fileURLToPath(new URL(".", import.meta.url));

// `10_000`, `60 * 1000`, `2 * 60_000` : un produit de littéraux, rien d'autre.
export function valeur(texte: string): number | null {
  const facteurs = texte.trim().split("*").map((f) => f.trim());
  if (!facteurs.every((f) => /^\d[\d_]*(\.\d+)?$/.test(f))) return null;
  return facteurs.reduce((produit, f) => produit * Number(f.replaceAll("_", "")), 1);
}

export function fichiersDeTest(racine = RACINE_RUNTIME): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        if (chemin !== ICI.replace(/\/$/, "") && !chemin.startsWith(ICI)) parcourir(chemin);
      } else if (e.name.endsWith(".ts")) trouves.push(chemin);
    }
  };
  parcourir(join(racine, "test"));
  return trouves.sort();
}

// Le texte sans ses commentaires de ligne, longueurs conservées (les numéros de ligne restent justes).
function sansCommentaires(texte: string): string {
  return texte.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, avant) => avant + " ".repeat(m.length - avant.length));
}

const NOM_DE_GARDE = /\b([A-Za-z_]*(?:timeout|delai|plafond|garde)[A-Za-z_]*)\s*[:=]\s*([^;\n,{}]*\d[^;\n,{}]*)/gi;

// Le plus grand littéral d'une valeur (`60_000`, `cond ? 180_000 : 100_000`), avec son écriture.
function valeurMax(texte: string): { ms: number; ecrit: string } | null {
  const nombres = [...texte.matchAll(/(?<![\w.])\d[\d_]*(?![\w.])/g)].map((n) => ({ ms: valeur(n[0]) ?? 0, ecrit: n[0] }));
  return nombres.length > 0 ? nombres.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;
}

function ligneDe(texte: string, index: number): number {
  return texte.slice(0, index).split("\n").length;
}

// Les arguments de premier niveau d'un appel dont `ouvrante` est l'index de la parenthèse.
function arguments_(texte: string, ouvrante: number): string[] {
  const args: string[] = [];
  let profondeur = 0;
  let debut = ouvrante + 1;
  let guillemet: string | null = null;
  for (let i = ouvrante; i < texte.length; i++) {
    const c = texte[i]!;
    if (guillemet) {
      if (c === "\\") i++;
      else if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") guillemet = c;
    else if ("([{".includes(c)) profondeur++;
    else if (")]}".includes(c)) {
      profondeur--;
      if (profondeur === 0) {
        args.push(texte.slice(debut, i));
        return args;
      }
    } else if (c === "," && profondeur === 1) {
      args.push(texte.slice(debut, i));
      debut = i + 1;
    }
  }
  return args;
}

// Les gardes de plus de 2 s écrites dans un fichier : le délai de `jusqua(condition, délai)` et toute
// affectation d'un littéral à un nom de timeout, délai, plafond ou garde. Un délai qui n'est pas un littéral
// (la valeur par défaut de `jusqua`, une constante) n'est vu qu'à sa définition.
export function gardesDuFichier(texte: string, file: string): Garde[] {
  const code = sansCommentaires(texte);
  const trouvees = new Map<string, Garde>();
  const noter = (garde: string, ms: number, index: number): void => {
    if (ms > LIMITE_MS && !trouvees.has(garde)) trouvees.set(garde, { file, garde, ms, line: ligneDe(code, index) });
  };
  for (const m of code.matchAll(/\bjusqua\s*\(/g)) {
    const args = arguments_(code, m.index + m[0].length - 1);
    const delai = args[1];
    const ms = delai === undefined ? null : valeur(delai);
    if (delai !== undefined && ms !== null) noter(`jusqua(…, ${delai.trim()})`, ms, m.index);
  }
  for (const m of code.matchAll(NOM_DE_GARDE)) {
    const max = valeurMax(m[2] ?? "");
    if (max !== null) noter(`${m[1]}: ${max.ecrit}`, max.ms, m.index);
  }
  return [...trouvees.values()];
}

export function gardesDuDepot(racine = RACINE_RUNTIME): Garde[] {
  return fichiersDeTest(racine).flatMap((f) => gardesDuFichier(readFileSync(f, "utf8"), chemin(racine, f)));
}

const nomme = (e: Exception): string => ("test" in e ? `test « ${e.test} »` : `garde ${e.garde}`);

// Les gardes trouvées, moins celles que la liste excuse ; puis les excuses dont la garde n'existe plus.
export function jugerLesGardes(gardes: Garde[], exceptions: Exception[], fichiersLus: Set<string>): string[] {
  const excusees = new Set(exceptions.filter((e): e is { file: string; garde: string } => "garde" in e).map((e) => `${e.file}\0${e.garde}`));
  const vues = new Set(gardes.map((g) => `${g.file}\0${g.garde}`));
  const fautes = gardes
    .filter((g) => !excusees.has(`${g.file}\0${g.garde}`))
    .map((g) => `${g.file}:${g.line} : garde ${g.garde} = ${g.ms} ms, la limite est ${LIMITE_MS} ms`);
  for (const e of exceptions) {
    if (!("garde" in e)) continue;
    if (!fichiersLus.has(e.file)) fautes.push(`exception périmée : ${nomme(e)} dans ${e.file} — le fichier n'existe plus`);
    else if (!vues.has(`${e.file}\0${e.garde}`)) fautes.push(`exception périmée : ${nomme(e)} dans ${e.file} — plus de garde de ce genre au-delà de ${LIMITE_MS} ms ; retire-la de exceptions.ts`);
  }
  return fautes;
}

// Un test mesuré. Le garde de blocage crée les tests à la place des fichiers : le lanceur ne dit donc pas de
// quel fichier est un test. `fichiers` est celui, ou ceux, où son titre est écrit (`fichiersDuTitre`).
export type Mesure = { fichiers: string[]; test: string; ms: number };

const ecritures = (titre: string): string[] => [titre, titre.replaceAll("\\", "\\\\").replaceAll("'", "\\'"), titre.replaceAll('"', '\\"'), titre.replaceAll("`", "\\`")];

// Les fichiers de test où ce titre est écrit. Un titre bâti (`${…}`) n'y est pas en entier : on cherche alors
// son plus long bout continu, en tête ou en queue (la queue d'abord, à longueur égale). Rien trouvé : liste vide.
// Un bout écrit quelque part y laisse écrits tous ses bouts plus courts du même côté : le plus long se cherche
// par dichotomie, et non bout après bout — le reporter juge ainsi 1 400 titres en une seconde, et non en 40,
// que la suite attendait après son dernier test (#2085).
export function fichiersDuTitre(titre: string, sources: Map<string, string>): string[] {
  const { tout, debuts, noms } = indexDes(sources);
  // Les fichiers, dans l'ordre des sources, où l'une des écritures du bout paraît.
  const contenant = (bout: string): string[] => {
    const rangs = new Set<number>();
    for (const forme of new Set(ecritures(bout))) {
      for (let i = tout.indexOf(forme); i !== -1; ) {
        // Le fichier qui contient l'index `i` : le dernier qui commence avant lui.
        let bas = 0;
        let haut = debuts.length - 1;
        while (bas < haut) {
          const milieu = (bas + haut + 1) >> 1;
          if ((debuts[milieu] ?? 0) <= i) bas = milieu;
          else haut = milieu - 1;
        }
        rangs.add(bas);
        // La suite, à partir du fichier suivant : celui-ci est déjà compté.
        const suivant = debuts[bas + 1];
        i = suivant === undefined ? -1 : tout.indexOf(forme, suivant);
      }
    }
    return [...rangs].sort((a, b) => a - b).map((rang) => noms[rang] ?? "");
  };
  const entier = contenant(titre);
  if (entier.length > 0) return entier;
  // La plus petite coupe, de 1 à `titre.length - 20`, dont le bout est écrit ; aucune : Infinity.
  const coupeMin = (bout: (coupe: number) => string): number => {
    let bas = 1;
    let haut = titre.length - 20;
    let trouvee = Infinity;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1;
      if (contenant(bout(milieu)).length > 0) {
        trouvee = milieu;
        haut = milieu - 1;
      } else bas = milieu + 1;
    }
    return trouvee;
  };
  const queue = coupeMin((coupe) => titre.slice(coupe));
  const tete = coupeMin((coupe) => titre.slice(0, titre.length - coupe));
  if (queue === Infinity && tete === Infinity) return [];
  return queue <= tete ? contenant(titre.slice(queue)) : contenant(titre.slice(0, titre.length - tete));
}

// Les sources bout à bout, séparées d'un octet nul qu'aucun titre ne contient : une recherche les parcourt
// toutes d'un trait. Faites une fois par jeu de sources.
const index = new WeakMap<Map<string, string>, { tout: string; debuts: number[]; noms: string[] }>();
function indexDes(sources: Map<string, string>): { tout: string; debuts: number[]; noms: string[] } {
  let fait = index.get(sources);
  if (fait === undefined) {
    const debuts: number[] = [];
    let longueur = 0;
    for (const texte of sources.values()) {
      debuts.push(longueur);
      longueur += texte.length + 1;
    }
    fait = { tout: [...sources.values()].join("\0"), debuts, noms: [...sources.keys()] };
    index.set(sources, fait);
  }
  return fait;
}

export function sourcesDesTests(racine = RACINE_RUNTIME): Map<string, string> {
  const sources = new Map<string, string>();
  for (const f of [...fichiersDeTest(racine), ...fichiersDeTestsDuRepertoire(join(racine, "test-hang-guard"))]) sources.set(chemin(racine, f), readFileSync(f, "utf8"));
  return sources;
}

function fichiersDeTestsDuRepertoire(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".test.ts")).map((f) => join(dossier, f));
}

const sert = (m: Mesure, e: { file: string }): boolean => m.fichiers.includes(e.file);

// Les durées mesurées, moins les tests que la liste excuse ; puis les excuses d'un fichier qui a tourné et
// dont le test n'a pas paru. Un test redevenu rapide reste excusé : sa durée suit la charge de la machine, et
// une exception ne doit pas clignoter selon qu'elle est quiète ou chargée. Un fichier qui n'a pas tourné (suite partielle) ne juge rien.
// `ecrit(fichier, titre)` dit si ce titre est encore écrit dans ce fichier : un test sauté sur cette machine
// (Windows, pas de pwsh) ne paraît pas, sans avoir disparu du code.
export function jugerLesDurees(mesures: Mesure[], exceptions: Exception[], fichiersJoues: Set<string>, ecrit: (fichier: string, titre: string) => boolean = () => false): string[] {
  const excuses = exceptions.filter((e): e is { file: string; test: string } => "test" in e);
  const fautes = mesures
    .filter((m) => m.ms > LIMITE_MS && !excuses.some((e) => e.test === m.test && sert(m, e)))
    .map((m) => `${m.fichiers.join(" ou ") || "fichier inconnu"} : le test « ${m.test} » dure ${Math.round(m.ms)} ms, la limite est ${LIMITE_MS} ms`);
  for (const e of excuses) {
    if (!fichiersJoues.has(e.file)) continue;
    const vus = mesures.filter((m) => m.test === e.test && sert(m, e));
    if (vus.length === 0 && !ecrit(e.file, e.test)) fautes.push(`exception périmée : ${nomme(e)} dans ${e.file} — ce test n'existe plus ; retire-le de exceptions.ts`);
  }
  return fautes;
}

export const racineDuRuntime = RACINE_RUNTIME;
