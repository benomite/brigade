// Un test d'acceptation gelé faux (#3799) : un cas du commit des tests gelés
// qui passe déjà sur la base ne prouve rien du ticket, et un cas qui ne passe
// pas le contrôle de types du projet ne peut pas être vert ; le cook n'a pas le
// droit d'y toucher. Le renvoyer au cook le faisait tourner en boucle : il
// rendait la même livraison, la pass la renvoyait pour le même test.
//
// Les tests gelés sont ceux du tests cook (le manager, `tests-acceptation/`) :
// c'est en son nom que la station retire le cas faux, par un commit du manager
// qui porte `Amendment: #<issue>` — le gel l'accepte (`gel-tests.ts`). Le cas
// juste reste, la livraison se rejuge sans lui, et l'issue dit quel test, pourquoi,
// et ce qui en a été fait. Quand le retrait ne laisserait aucun cas à un fichier
// gelé — tout ce qu'il vérifie passe déjà sur la base, ses cas ne se lisent
// pas, ou son erreur de types tombe hors de tout cas —, rien ne prouve plus son
// critère : le ticket ne peut pas continuer, et il est mis de côté une fois, la
// raison en une ligne.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { AUTEUR_DU_MANAGER } from "./gel-tests.ts";
import { PIED } from "../amendement/proposition.ts";
import { CAS, nomDuTest, nomsDesCas, type Rejeu } from "../pass/rouge-sur-main.ts";

type LancerGit = (args: string[], worktree: string) => Promise<{ code: number; stdout: string; stderr: string }>;

// Un cas gelé faux : son fichier, son nom — null s'il ne se rattache à aucun
// cas, et le fichier se juge alors en entier —, pourquoi il est faux, et ce que
// cela fait au ticket.
export type Faux = { fichier: string; nom: string | null; pourquoi: string; donc: string };

// Les cas ajoutés déjà verts sur la base qui sont dans un fichier gelé.
export function casGelesFaux(verts: readonly Rejeu[], geles: readonly string[], base: string): Faux[] {
  const gele = new Set(geles);
  return verts.filter((rejeu) => gele.has(rejeu.fichier)).map(({ fichier, nom }) => ({ fichier, nom, pourquoi: `already passes on \`${base}\``, donc: "it proves nothing about this ticket" }));
}

// Une erreur de `tsc --pretty false` : `chemin(ligne,colonne): error TSnnnn: texte`.
export const ERREUR_TSC = /^(.+?)\((\d+),\d+\): error (TS\d+: .*)$/;

// Le contrôle de types d'un fichier gelé : le dossier de son `tsconfig.json`
// le plus proche, et le `tsc` du projet, cherché de ce dossier jusqu'à la
// racine du worktree (`tsc` à null s'il n'y est pas installé). Null pour un
// fichier qui n'est pas en TypeScript, ou qu'aucun `tsconfig.json` ne couvre.
export function controleDesTypes(worktree: string, fichier: string): { dossier: string; tsc: string | null } | null {
  if (!/\.[cm]?tsx?$/.test(fichier)) return null;
  const remonter = (depart: string, trouve: (dossier: string) => boolean): string | null => {
    for (let dossier = depart; ; dossier = dirname(dossier)) {
      if (trouve(dossier)) return dossier;
      if (dossier === dirname(dossier)) return null;
    }
  };
  const dossier = remonter(dirname(fichier), (d) => existsSync(join(worktree, d, "tsconfig.json")));
  if (dossier === null) return null;
  const avecTsc = remonter(dossier, (d) => existsSync(join(worktree, d, "node_modules", ".bin", "tsc")));
  return { dossier, tsc: avecTsc === null ? null : join(worktree, avecTsc, "node_modules", ".bin", "tsc") };
}

// Les cas gelés que le contrôle de types refuse, d'après les lignes d'erreur
// de `tsc` (chemins relatifs au worktree, ou absolus) : chaque cas où tombe
// une erreur, une fois, avec sa première erreur. Une erreur hors de tout cas
// (un import, une aide du fichier) rattache le fichier entier.
export function casQuiNeTypentPas(lignes: readonly string[], worktree: string, geles: readonly string[]): Faux[] {
  const gele = new Set(geles);
  const faux: Faux[] = [];
  for (const ligne of lignes) {
    const trouve = ERREUR_TSC.exec(ligne.trim());
    if (trouve === null) continue;
    const [, chemin = "", numero = "", erreur = ""] = trouve;
    const fichier = normalize(isAbsolute(chemin) ? relative(worktree, chemin) : chemin).split("\\").join("/");
    if (!gele.has(fichier)) continue;
    const nom = casDeLaLigne(readFileSync(join(worktree, fichier), "utf8"), Number(numero));
    if (faux.some((f) => f.fichier === fichier && f.nom === nom)) continue;
    faux.push({ fichier, nom, pourquoi: `does not type-check (\`${erreur.replace(/`/g, "'")}\`)`, donc: "it cannot go green, and the cook may not edit it" });
  }
  return faux;
}

// Le nom du cas dont l'appel couvre la ligne `numero` (à partir de 1), ou null.
function casDeLaLigne(source: string, numero: number): string | null {
  const ligneDe = (indice: number) => source.slice(0, indice).split("\n").length;
  for (const trouve of source.matchAll(CAS)) {
    const fin = finDeLAppel(source, source.indexOf("(", trouve.index));
    if (fin !== null && ligneDe(trouve.index) <= numero && numero <= ligneDe(fin)) return (trouve[2] ?? "").replace(/\\(.)/g, "$1");
  }
  return null;
}

// La fin de l'appel ouvert à `debut` (sa parenthèse) : l'indice après sa
// parenthèse fermante, sans compter celles des chaînes ni des commentaires.
// Null si elle ne se ferme pas.
function finDeLAppel(source: string, debut: number): number | null {
  let profondeur = 0;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const fin = source.indexOf("\n", i);
      if (fin === -1) return null;
      i = fin;
    } else if (c === "/" && source[i + 1] === "*") {
      const fin = source.indexOf("*/", i + 2);
      if (fin === -1) return null;
      i = fin + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      for (i += 1; i < source.length && source[i] !== c; i += 1) if (source[i] === "\\") i += 1;
      if (i >= source.length) return null;
    } else if (c === "(" || c === "{" || c === "[") profondeur += 1;
    else if (c === ")" || c === "}" || c === "]") {
      profondeur -= 1;
      if (profondeur === 0) return i + 1;
    }
  }
  return null;
}

// Le source sans le cas `nom` : de son début de ligne à la fin de son appel,
// son `;` et sa fin de ligne. Null si le cas ne s'y trouve pas, ou si son
// appel ne se lit pas jusqu'au bout.
function sansLeCas(source: string, nom: string): string | null {
  for (const trouve of source.matchAll(CAS)) {
    const brut = trouve[2];
    if (brut === undefined || brut.replace(/\\(.)/g, "$1") !== nom) continue;
    const ouvrante = source.indexOf("(", trouve.index);
    const fin = finDeLAppel(source, ouvrante);
    if (fin === null) return null;
    const ligne = source.lastIndexOf("\n", trouve.index) + 1;
    const debut = source.slice(ligne, trouve.index).trim() === "" ? ligne : trouve.index;
    const apres = /^[ \t]*;?[ \t]*\r?\n?/.exec(source.slice(fin))?.[0] ?? "";
    return source.slice(0, debut) + source.slice(fin + apres.length);
  }
  return null;
}

// La marque du commentaire de mise de côté d'un ticket que ses tests gelés faux arrêtent.
export const MARQUE_MISE_DE_COTE_GELE = "<!-- brigade:mise-de-cote-test-gele -->";

export type Correction =
  // Les cas faux retirés par un commit du manager : son hash.
  | { sha: string }
  // Rien ne prouve plus le critère d'un fichier gelé : la raison, en une ligne.
  | { ecarte: string }
  // La correction n'a pas pu se faire : rien n'est commité, la livraison se juge comme avant.
  | { echec: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// La raison, en une ligne, d'un ticket qui ne peut pas continuer.
const raisonDeLEcart = (siens: readonly Faux[], fichier: string) => {
  const dits = siens.map((f) => `${nomDuTest(f)} ${f.pourquoi}`);
  const coupe = siens.every(({ nom }) => nom !== null);
  return `the frozen acceptance test ${dits.join(", and ")}: ${coupe ? `dropping ${siens.length === 1 ? "it" : "them"} would leave \`${fichier}\` with no case to prove its criterion` : `it cannot be dropped case by case, and nothing else would prove its criterion`}`;
};

// Retire les cas faux de leurs fichiers gelés, dans le worktree de la branche,
// et les commite au nom du manager. Ne pousse pas.
export async function corrigerLesTestsGeles(faux: readonly Faux[], outils: { worktree: string; ticket: number; git: LancerGit }): Promise<Correction> {
  const parFichier = new Map<string, Faux[]>();
  for (const f of faux) parFichier.set(f.fichier, [...(parFichier.get(f.fichier) ?? []), f]);
  const ecrits = new Map<string, string>();
  for (const [fichier, siens] of parFichier) {
    let source: string;
    try {
      source = readFileSync(join(outils.worktree, fichier), "utf8");
    } catch (erreur) {
      return { echec: `the frozen test \`${fichier}\` cannot be read on the branch: ${message(erreur)}` };
    }
    // Un fichier gelé dont les cas ne se lisent pas se juge en entier : rien ne s'en retire.
    if (siens.some(({ nom }) => nom === null)) return { ecarte: raisonDeLEcart(siens, fichier) };
    let reste: string | null = source;
    for (const { nom } of siens) reste = reste === null ? null : sansLeCas(reste, nom ?? "");
    if (reste === null) return { echec: `a case of the frozen test \`${fichier}\` could not be cut out of it` };
    if (nomsDesCas(reste).length === 0) return { ecarte: raisonDeLEcart(siens, fichier) };
    ecrits.set(fichier, reste);
  }
  try {
    for (const [fichier, reste] of ecrits) writeFileSync(join(outils.worktree, fichier), reste);
  } catch (erreur) {
    await outils.git(["checkout", "--", ...ecrits.keys()], outils.worktree);
    return { echec: `the frozen test could not be written: ${message(erreur)}` };
  }
  const sujet = `test(#${outils.ticket}): drop the wrong frozen ${faux.length === 1 ? "case" : "cases"}`;
  // Le commit prend les fichiers écrits par leurs chemins : aucun `git add` à part.
  const fait = await outils.git(["commit", "--quiet", "--no-verify", `--author=${AUTEUR_DU_MANAGER}`, "-m", sujet, "-m", faux.map(({ nom, fichier, pourquoi }) => `- ${nom} (${fichier}): ${pourquoi}`).join("\n"), "-m", PIED(outils.ticket), "--", ...ecrits.keys()], outils.worktree);
  if (fait.code !== 0) {
    await outils.git(["reset", "--quiet", "--hard", "HEAD"], outils.worktree);
    return { echec: `the correction could not be committed: ${fait.stderr.trim() || `code ${fait.code}`}` };
  }
  const tete = await outils.git(["rev-parse", "HEAD"], outils.worktree);
  if (tete.code !== 0 || tete.stdout.trim() === "") return { echec: `the correction's commit could not be read: ${tete.stderr.trim()}` };
  return { sha: tete.stdout.trim() };
}

// Ce que l'issue dit de la correction : quel test, pourquoi il était faux, ce qui en a été fait.
export function corpsDeLaCorrection({ station, ticket, branche, sha, retires }: { station: string; ticket: number; branche: string; sha: string; retires: readonly Faux[] }): string {
  return [
    "<!-- brigade:test-gele-corrige -->",
    `**Wrong frozen acceptance test corrected** by station \`${station}\`, for the tests cook: the ticket goes on, the cook is not sent back for it.`,
    "",
    ...retires.map((f) => `- ${nomDuTest(f)} ${f.pourquoi}: ${f.donc}. Dropped from the frozen test; the file's other cases are kept.`),
    "",
    `Commit \`${sha.slice(0, 7)}\` on \`${branche}\`, by the manager, with the trailer \`${PIED(ticket)}\`.`,
  ].join("\n");
}
