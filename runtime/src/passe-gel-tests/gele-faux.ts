// Un test d'acceptation gelé faux (#3799) : un cas du commit des tests gelés
// qui passe déjà sur la base ne prouve rien du ticket, et le cook n'a pas le
// droit d'y toucher. Le renvoyer au cook le faisait tourner en boucle : il
// rendait la même livraison, la pass la renvoyait pour le même test.
//
// Les tests gelés sont ceux du tests cook (le manager, `tests-acceptation/`) :
// c'est en son nom que la station retire le cas faux, par un commit du manager
// qui porte `Amendment: #<issue>` — le gel l'accepte (`gel-tests.ts`). Le cas
// juste reste, la livraison se rejuge sans lui, et l'issue dit quel test, pourquoi,
// et ce qui en a été fait. Quand le retrait ne laisserait aucun cas à un fichier
// gelé — tout ce qu'il vérifie passe déjà sur la base, ou ses cas ne se lisent
// pas —, rien ne prouve plus son critère : le ticket ne peut pas continuer, et
// il est mis de côté une fois, la raison en une ligne.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUTEUR_DU_MANAGER } from "./gel-tests.ts";
import { PIED } from "../amendement/proposition.ts";
import { CAS, nomDuTest, nomsDesCas, type Rejeu } from "../pass/rouge-sur-main.ts";

type LancerGit = (args: string[], worktree: string) => Promise<{ code: number; stdout: string; stderr: string }>;

// Les cas ajoutés déjà verts sur la base qui sont dans un fichier gelé.
export function casGelesFaux(verts: readonly Rejeu[], geles: readonly string[]): Rejeu[] {
  const gele = new Set(geles);
  return verts.filter((rejeu) => gele.has(rejeu.fichier));
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
    const ligne = source.lastIndexOf("\n", trouve.index - 1) + 1;
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
  | { retires: Rejeu[]; sha: string }
  // Rien ne prouve plus le critère d'un fichier gelé : la raison, en une ligne.
  | { ecarte: string }
  // La correction n'a pas pu se faire : rien n'est commité, la livraison se juge comme avant.
  | { echec: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// La raison, en une ligne, d'un ticket qui ne peut pas continuer.
const raisonDeLEcart = ([premier, ...autres]: readonly Rejeu[], fichier: string, base: string) =>
  `the frozen acceptance test ${premier === undefined ? `\`${fichier}\`` : nomDuTest(premier)} already passes on \`${base}\`${autres.map((rejeu) => `, and so does ${nomDuTest(rejeu)}`).join("")}: dropping ${autres.length === 0 ? "it" : "them"} would leave \`${fichier}\` with no case to prove its criterion`;

// Retire les cas faux de leurs fichiers gelés, dans le worktree de la branche,
// et les commite au nom du manager. Ne pousse pas.
export async function corrigerLesTestsGeles(faux: readonly Rejeu[], outils: { worktree: string; ticket: number; base: string; git: LancerGit }): Promise<Correction> {
  const parFichier = new Map<string, Rejeu[]>();
  for (const rejeu of faux) parFichier.set(rejeu.fichier, [...(parFichier.get(rejeu.fichier) ?? []), rejeu]);
  const ecrits = new Map<string, string>();
  for (const [fichier, siens] of parFichier) {
    let source: string;
    try {
      source = readFileSync(join(outils.worktree, fichier), "utf8");
    } catch (erreur) {
      return { echec: `the frozen test \`${fichier}\` cannot be read on the branch: ${message(erreur)}` };
    }
    // Un fichier gelé dont les cas ne se lisent pas se juge en entier : rien ne s'en retire.
    if (siens.some(({ nom }) => nom === null)) return { ecarte: raisonDeLEcart(siens, fichier, outils.base) };
    let reste: string | null = source;
    for (const { nom } of siens) reste = reste === null ? null : sansLeCas(reste, nom ?? "");
    if (reste === null) return { echec: `a case of the frozen test \`${fichier}\` could not be cut out of it` };
    if (nomsDesCas(reste).length === 0) return { ecarte: raisonDeLEcart(siens, fichier, outils.base) };
    ecrits.set(fichier, reste);
  }
  try {
    for (const [fichier, reste] of ecrits) writeFileSync(join(outils.worktree, fichier), reste);
  } catch (erreur) {
    await outils.git(["checkout", "--", ...ecrits.keys()], outils.worktree);
    return { echec: `the frozen test could not be written: ${message(erreur)}` };
  }
  const sujet = `test(#${outils.ticket}): drop ${faux.length === 1 ? "the frozen case" : "the frozen cases"} that already ${faux.length === 1 ? "passes" : "pass"} on ${outils.base}`;
  for (const args of [
    ["add", "--", ...ecrits.keys()],
    ["commit", "--quiet", "--no-verify", `--author=${AUTEUR_DU_MANAGER}`, "-m", sujet, "-m", faux.map((rejeu) => `- ${rejeu.nom} (${rejeu.fichier})`).join("\n"), "-m", PIED(outils.ticket)],
  ]) {
    const fait = await outils.git(args, outils.worktree);
    if (fait.code !== 0) {
      await outils.git(["reset", "--quiet", "--hard", "HEAD"], outils.worktree);
      return { echec: `the correction could not be committed (git ${args[0]}): ${fait.stderr.trim() || `code ${fait.code}`}` };
    }
  }
  const tete = await outils.git(["rev-parse", "HEAD"], outils.worktree);
  if (tete.code !== 0 || tete.stdout.trim() === "") return { echec: `the correction's commit could not be read: ${tete.stderr.trim()}` };
  return { retires: [...faux], sha: tete.stdout.trim() };
}

// Ce que l'issue dit de la correction : quel test, pourquoi il était faux, ce qui en a été fait.
export function corpsDeLaCorrection({ station, ticket, branche, sha, retires, base }: { station: string; ticket: number; branche: string; sha: string; retires: readonly Rejeu[]; base: string }): string {
  return [
    "<!-- brigade:test-gele-corrige -->",
    `**Wrong frozen acceptance test corrected** by station \`${station}\`, for the tests cook: the ticket goes on, the cook is not sent back for it.`,
    "",
    ...retires.map((rejeu) => `- ${nomDuTest(rejeu)} already passes on \`${base}\`: it proves nothing about this ticket. Dropped from the frozen test; the file's other cases are kept.`),
    "",
    `Commit \`${sha.slice(0, 7)}\` on \`${branche}\`, by the manager, with the trailer \`${PIED(ticket)}\`.`,
  ].join("\n");
}
