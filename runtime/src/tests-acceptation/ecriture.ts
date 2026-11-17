// L'écriture des tests d'acceptation d'un ticket, à l'étape « tests written »
// du rail (#3725). La station prépare la branche du ticket sur la base, le
// manager y écrit un test par critère, sans commiter, et dit où ; la station
// vérifie que l'arbre ne porte que ces fichiers-là, les commite en premier
// commit de la branche, avec le trailer `Acceptance-Tests: frozen`, pousse la
// branche, poste les fiches des critères et pose `tests-written`.
//
// Rien n'est à moitié fait : un échec à une étape défait le worktree et la
// branche locale, rien n'est poussé ni labellisé, et le ticket reste `queued`.
import { corpsDesFiches, criteresDuTicket, ficheNeuve, ficheSansTest, type FicheDeCritere } from "./fiche.ts";
import { LABEL_TESTS_ECRITS, sujetDuCommitDesTests, TRAILER } from "./etape.ts";

const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";

export type Git = (args: string[], worktree: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export type OutilsDeLEcriture = {
  // L'issue du ticket ; null si elle n'existe plus.
  issue(numero: number): Promise<{ title: string; body?: string | null } | null>;
  commenter(numero: number, corps: string): Promise<void>;
  labelliser(numero: number, labels: string[]): Promise<void>;
  // Le worktree de la branche du ticket, neuve, partie de la base.
  preparer(): Promise<{ worktree: string; branche: string }>;
  // Le manager lancé dans le worktree sur la consigne : son dernier message,
  // ou pourquoi il n'en a pas.
  manager(consigne: string, worktree: string): Promise<{ message: string } | { illisible: string }>;
  git: Git;
  pousser(branche: string): void;
  retirer(worktree: string, branche?: string): void;
  base: string;
  depot: string;
};

// `sansCriteres` : le ticket n'a aucun critère d'acceptation, il n'y a rien à geler.
// `sansTestable` : aucun de ses critères n'est testable (#3740), l'étape n'a pas
// été lancée, et sa fiche dit les preuves dues.
export type Ecriture = { fiches: FicheDeCritere[] } | { sansCriteres: true } | { sansTestable: FicheDeCritere[] } | { echec: string };

// La classe d'un critère, que le manager a donnée à la qualification (#3740).
export type ClasseDuCritere = { class: "testable" } | { class: "not-testable"; proof: string };

export function consigneDesTests(mission: { depot: string; ticket: number; titre: string; corps: string; criteres: readonly string[] }): string {
  const { depot, ticket, titre, corps, criteres } = mission;
  return [
    MARQUE_DE_LA_CONSIGNE,
    `Tu es le manager du dépôt ${depot}. Le ticket #${ticket} — « ${titre} » — est qualifié ; avant qu'un cook le prenne, tu écris ses tests d'acceptation.`,
    "",
    "Tu es dans un worktree de la branche du ticket, partie de la branche d'intégration. Lis le `CLAUDE.md` du dépôt et ses tests voisins pour en suivre les conventions (dossier, nommage, framework).",
    "",
    `Écris exactement ${criteres.length} test${criteres.length === 1 ? "" : "s"} d'acceptation, un fichier par critère ci-dessous, dans l'ordre. Chaque test vérifie son critère tel qu'il est écrit, et doit échouer tant que le ticket n'est pas fait. N'écris, ne modifie ni ne supprime aucun autre fichier. Ne commite rien : la station commite tes fichiers, et eux seuls.`,
    "",
    "## Le ticket",
    "",
    corps.trim(),
    "",
    "## Les critères",
    "",
    ...criteres.map((critere, rang) => `${rang + 1}. ${critere}`),
    "",
    "## Ta réponse",
    "",
    `Termine par un seul objet JSON, rien autour : {"tests": ["chemin/du/test/du/critere/1", "…"]} — ${criteres.length} chemin${criteres.length === 1 ? "" : "s"} relatifs à la racine du dépôt, distincts, dans l'ordre des critères.`,
  ].join("\n");
}

// Les chemins que le manager donne, un par critère, ou pourquoi ils ne se lisent pas.
export function lireLesChemins(message: string, attendus: number): { chemins: string[] } | { illisible: string } {
  const json = /\{[\s\S]*\}/.exec(message)?.[0];
  if (json === undefined) return { illisible: "the manager's answer carries no JSON object" };
  let lu: unknown;
  try {
    lu = JSON.parse(json);
  } catch (erreur) {
    return { illisible: `the manager's answer is not JSON: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  const tests = (lu as { tests?: unknown }).tests;
  if (!Array.isArray(tests) || !tests.every((t) => typeof t === "string" && t.trim() !== "")) return { illisible: "the manager's answer has no `tests` list of paths" };
  const chemins = tests.map((t: string) => t.trim().replace(/^\.\//, ""));
  if (chemins.length !== attendus) return { illisible: `the manager named ${chemins.length} test${chemins.length === 1 ? "" : "s"} for ${attendus} criteria` };
  const horsDuDepot = chemins.find((c) => c.startsWith("/") || /^[A-Za-z]:/.test(c) || c.split(/[\\/]/).includes(".."));
  if (horsDuDepot !== undefined) return { illisible: `the test path \`${horsDuDepot}\` is not inside the repository` };
  if (new Set(chemins).size !== chemins.length) return { illisible: "two criteria share the same test file" };
  return { chemins };
}

const egaux = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

// Écrit les tests du ticket, de la consigne au label. Rend les fiches des
// critères, ou ce qui a manqué. `classes`, une par critère : seuls les critères
// `testable` reçoivent un test ; sans elles, tous en reçoivent un.
export async function ecrireLesTests(ticket: number, outils: OutilsDeLEcriture, classes?: readonly ClasseDuCritere[]): Promise<Ecriture> {
  const issue = await outils.issue(ticket);
  if (issue === null) return { echec: "the issue no longer exists" };
  const tous = criteresDuTicket(issue.body ?? "");
  if (tous.length === 0) return { sansCriteres: true };
  if (classes !== undefined && classes.length !== tous.length) return { echec: `the ticket has ${tous.length} criteria, ${classes.length} were classed: its criteria changed while they were classed` };
  const classeDe = (rang: number): ClasseDuCritere => classes?.[rang] ?? { class: "testable" };
  const criteres = tous.filter((_, rang) => classeDe(rang).class === "testable");
  const { worktree, branche } = await outils.preparer();
  let poussee = false;
  try {
    const repondu = await outils.manager(consigneDesTests({ depot: outils.depot, ticket, titre: issue.title, corps: issue.body ?? "", criteres }), worktree);
    if ("illisible" in repondu) return { echec: repondu.illisible };
    const lu = lireLesChemins(repondu.message, criteres.length);
    if ("illisible" in lu) return { echec: lu.illisible };
    const statut = await outils.git(["status", "--porcelain", "-z", "--untracked-files=all"], worktree);
    if (statut.code !== 0) return { echec: `git status failed: ${statut.stderr.trim()}` };
    const touches = statut.stdout.split("\0").filter((entree) => entree.length > 3).map((entree) => entree.slice(3));
    const manquants = lu.chemins.filter((chemin) => !touches.includes(chemin));
    if (manquants.length > 0) return { echec: `the manager did not write ${manquants.map((c) => `\`${c}\``).join(", ")}` };
    const autres = touches.filter((chemin) => !lu.chemins.includes(chemin));
    if (autres.length > 0) return { echec: `the manager changed files that are not its tests: ${autres.map((c) => `\`${c}\``).join(", ")}` };
    const message = [sujetDuCommitDesTests(ticket), "", ...criteres.map((critere, rang) => `- ${lu.chemins[rang]}: ${critere}`), "", TRAILER].join("\n");
    for (const args of [["add", "--", ...lu.chemins], ["commit", "--quiet", "--no-verify", "-m", message]]) {
      const fait = await outils.git(args, worktree);
      if (fait.code !== 0) return { echec: `git ${args[0]} failed: ${fait.stderr.trim()}` };
    }
    // Le commit tel que git le porte : le premier de la branche, ces fichiers seuls.
    const [compte, fichiers] = await Promise.all([outils.git(["rev-list", "--count", `origin/${outils.base}..HEAD`], worktree), outils.git(["show", "--name-only", "--format=", "-z", "HEAD"], worktree)]);
    if (compte.stdout.trim() !== "1" || !egaux(fichiers.stdout.split("\0").filter(Boolean), lu.chemins)) return { echec: "the commit of the tests is not the branch's only commit, or carries other files" };
    outils.pousser(branche);
    poussee = true;
    let teste = 0;
    const fiches = tous.map((critere, rang) => {
      const classe = classeDe(rang);
      return classe.class === "testable" ? ficheNeuve(critere, lu.chemins[teste++] as string) : ficheSansTest(critere, classe.proof);
    });
    await outils.commenter(ticket, corpsDesFiches(ticket, branche, fiches));
    await outils.labelliser(ticket, [LABEL_TESTS_ECRITS]);
    return { fiches };
  } catch (erreur) {
    return { echec: erreur instanceof Error ? erreur.message : String(erreur) };
  } finally {
    // Poussée, la branche reste : le cook en part. Sinon elle part avec le worktree.
    outils.retirer(worktree, poussee ? undefined : branche);
  }
}
