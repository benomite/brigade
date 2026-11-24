// Les mutations attrapées (#3727) : la preuve que les tests d'une livraison
// voient le code qu'elle change. Après « Red on main, green on the branch »
// (`pass/rouge-sur-main.ts`), la pass mute une à une les seules lignes de code
// que la livraison ajoute ou change — jamais le reste du dépôt —, et rejoue
// contre chaque mutant les tests ajoutés verts sur la branche (les tests
// gelés). Un mutant est tué quand l'un d'eux échoue ; un mutant qui survit est
// une ligne que rien ne teste, et la livraison repart à son cook en la nommant.
//
// Les mutants se jouent en parallèle, chacun dans un checkout jetable de la
// base où la pass a copié ce que la livraison change, sous un budget de temps
// fixe : passé, ce qui court est arrêté et la pass le dit, sans attendre.
//
// Ce module ne lit ni GitHub ni le journal : le diff, les checkouts jetables
// et le lancement d'un fichier de test lui sont donnés. Il ne laisse rien
// derrière lui : les checkouts sont jetés, rien n'est commité.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argumentsDuRejeu, dossierDuTest, etatDuCritere, FICHIER_DE_TEST, passe, SOUS_LES_TESTS, type Couverture, type Passage, type Preuve, type Unite } from "../pass/rouge-sur-main.ts";

// Le budget de l'étape : au-delà, les mutants qui courent sont arrêtés.
export const BUDGET_DES_MUTATIONS_MS = 2 * 60_000;
// Combien de mutants se jouent à la fois, chacun dans son checkout.
export const MUTANTS_EN_PARALLELE = 4;
// Combien de fois, au plus, la station rend à son cook les mutations qui survivent avant sa PR (#3976).
export const RELANCES_DES_MUTATIONS = 2;

// Le code qui se mute : un module JavaScript ou TypeScript, hors des tests et
// de leurs aides, hors des déclarations de types.
const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// L'outillage du dépôt — scripts, fabrication de l'app, gates — ne se mute pas
// (décision du chef, 2026-11-24) : le tester ligne à ligne coûtait des essais
// aux cooks pour une preuve sans valeur produit (#4080, #4081).
const OUTILLAGE = /^(?:scripts|app\/packaging|\.claude)\//;
const estDuCode = (fichier: string) => CODE.test(fichier) && !fichier.endsWith(".d.ts") && !FICHIER_DE_TEST.test(fichier) && !SOUS_LES_TESTS.test(fichier) && !OUTILLAGE.test(fichier);

// Une ligne que la livraison ajoute ou change, sur sa branche (numérotée de 1).
type LigneChangee = { fichier: string; ligne: number };

// Les lignes que le diff unifié ajoute, par leur numéro dans le fichier tel
// que la branche le porte. Un fichier supprimé n'en a aucune.
function lignesAjoutees(diff: string): LigneChangee[] {
  const lignes: LigneChangee[] = [];
  let fichier: string | null = null;
  let numero = 0;
  let dansUnMorceau = false;
  for (const brute of diff.split("\n")) {
    if (brute.startsWith("diff --git ")) {
      fichier = null;
      dansUnMorceau = false;
      continue;
    }
    if (!dansUnMorceau && brute.startsWith("+++ ")) {
      const chemin = brute.slice(4);
      fichier = chemin.startsWith("b/") ? chemin.slice(2) : null;
      continue;
    }
    const morceau = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(brute);
    if (morceau) {
      dansUnMorceau = true;
      numero = Number(morceau[1]);
      continue;
    }
    if (!dansUnMorceau || fichier === null) continue;
    if (brute.startsWith("+")) lignes.push({ fichier, ligne: numero++ });
    else if (brute.startsWith(" ")) numero += 1;
  }
  return lignes;
}

// Ce qui se mute dans une ligne, dans l'ordre où la pass le cherche : la
// première mutation qui s'y applique fait le seul mutant de la ligne.
const OPERATEURS: Array<{ motif: RegExp; vers: (trouve: string) => string }> = [
  { motif: /===|!==/, vers: (trouve) => (trouve === "===" ? "!==" : "===") },
  { motif: /(?<![=!<>])==(?!=)|!=(?!=)/, vers: (trouve) => (trouve === "==" ? "!=" : "==") },
  { motif: /&&|\|\|/, vers: (trouve) => (trouve === "&&" ? "||" : "&&") },
  { motif: /<=|(?<!=)>=/, vers: (trouve) => (trouve === "<=" ? ">" : "<") },
  { motif: / < | > /, vers: (trouve) => (trouve === " < " ? " >= " : " <= ") },
  { motif: /\btrue\b|\bfalse\b/, vers: (trouve) => (trouve === "true" ? "false" : "true") },
  { motif: / \+ | - /, vers: (trouve) => (trouve === " + " ? " - " : " + ") },
  { motif: /(?<=[(\s])!(?![=!])/, vers: () => "" },
];

// Ce qui ne se mute pas : un commentaire, un import, une déclaration de type.
const SANS_LOGIQUE = /^\s*(?:$|\/\/|\/\*|\*|import\b|export\s+type\b|type\b|interface\b|export\s+interface\b)/;

// Les morceaux d'une ligne hors de ses chaînes et de son commentaire de fin :
// une chaîne ou un commentaire mutés ne changent pas la logique.
function horsDesChaines(ligne: string): Array<[number, number]> {
  const morceaux: Array<[number, number]> = [];
  let debut = 0;
  let i = 0;
  for (; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === "/" && ligne[i + 1] === "/") break;
    if (c !== '"' && c !== "'" && c !== "`") continue;
    morceaux.push([debut, i]);
    let j = i + 1;
    while (j < ligne.length && ligne[j] !== c) j += ligne[j] === "\\" ? 2 : 1;
    i = j;
    debut = j + 1;
  }
  morceaux.push([debut, Math.min(i, ligne.length)]);
  return morceaux.filter(([de, a]) => a > de);
}

// Une mutation d'une ligne : ce qui y était, ce qui le remplace, et la ligne mutée.
type Mutation = { avant: string; apres: string; texte: string };

// Le mutant d'une ligne de code, ou null si rien ne s'y mute.
function muterLaLigne(ligne: string): Mutation | null {
  if (SANS_LOGIQUE.test(ligne)) return null;
  const morceaux = horsDesChaines(ligne);
  for (const { motif, vers } of OPERATEURS) {
    for (const [de, a] of morceaux) {
      // Cherché dans le morceau, ce qui le précède lu par les motifs qui regardent en arrière.
      const trouve = new RegExp(motif.source, "g");
      trouve.lastIndex = de;
      const resultat = trouve.exec(ligne.slice(0, a));
      if (resultat === null) continue;
      const apres = vers(resultat[0]);
      return { avant: resultat[0].trim(), apres: apres.trim(), texte: ligne.slice(0, resultat.index) + apres + ligne.slice(resultat.index + resultat[0].length) };
    }
  }
  return null;
}

type Mutant = LigneChangee & Mutation;

// Les mutants d'une livraison : un au plus par ligne de code qu'elle ajoute
// ou change. `lire` rend un fichier tel que la branche le porte (null s'il n'y est pas).
function mutantsDuDiff(diff: string, lire: (fichier: string) => string | null): Mutant[] {
  const contenus = new Map<string, string[] | null>();
  const mutants: Mutant[] = [];
  for (const { fichier, ligne } of lignesAjoutees(diff)) {
    if (!estDuCode(fichier)) continue;
    if (!contenus.has(fichier)) contenus.set(fichier, lire(fichier)?.split("\n") ?? null);
    const texte = contenus.get(fichier)?.[ligne - 1];
    if (texte === undefined) continue;
    const mutation = muterLaLigne(texte);
    if (mutation !== null) mutants.push({ fichier, ligne, ...mutation });
  }
  return mutants;
}

// Les tests gelés : ceux que la livraison ajoute et qui passent sur sa branche.
const testsGeles = (preuve: Preuve): Unite[] => ("rejeux" in preuve ? preuve.rejeux.filter((rejeu) => rejeu.branche).map(({ fichier, nom }) => ({ fichier, nom })) : []);

const cle = ({ fichier, nom }: Unite) => `${fichier}\0${nom ?? ""}`;

// Un mutant joué : les tests gelés qui l'ont tué (vide : il a survécu), ou
// null s'il n'a pas été joué avant la fin du budget.
type MutantJoue = Mutant & { tuePar: string[] | null };

// Ce que l'étape a établi. `aucunMutant` : la livraison ne change aucune ligne
// de code qui se mute. `sansTest` : il y a des mutants, mais aucun test gelé
// contre qui les jouer. `injouable` : les mutants n'ont pas pu être joués, et
// pourquoi. `budgetMs` et `depasse` : le budget, et s'il a manqué.
export type Mutations =
  | { aucunMutant: true }
  | { sansTest: number }
  | { injouable: string }
  | { mutants: MutantJoue[]; budgetMs: number; depasse: boolean };

type OutilsDesMutations = {
  // Les fichiers que la livraison change, et son diff, par rapport à la base.
  fichiers: readonly string[];
  diff: string;
  // Le worktree de la branche livrée.
  branche: string;
  // Le checkout jetable de rang `rang`, et de quoi le jeter.
  checkout(rang: number): Promise<{ worktree: string; jeter(): void }>;
  // Joue `node <args>` dans `dossier` du worktree ; s'arrête quand `signal` tombe. Ne lève pas.
  jouer(worktree: string, dossier: string, args: string[], signal: AbortSignal): Promise<Passage>;
  budgetMs: number;
  enParallele: number;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const lireSiPresent = (chemin: string) => (existsSync(chemin) ? readFileSync(chemin, "utf8") : null);

// Mute les lignes que la livraison change et joue ses tests gelés contre
// chaque mutant, en parallèle, dans le budget.
export async function muter(preuve: Preuve, outils: OutilsDesMutations): Promise<Mutations> {
  const mutants = mutantsDuDiff(outils.diff, (fichier) => lireSiPresent(join(outils.branche, fichier)));
  if (mutants.length === 0) return { aucunMutant: true };
  const geles = testsGeles(preuve);
  if (geles.length === 0) return { sansTest: mutants.length };
  // Les fichiers de test à jouer, chacun réduit à ses tests gelés.
  const parFichier = new Map<string, Unite[]>();
  for (const unite of geles) parFichier.set(unite.fichier, [...(parFichier.get(unite.fichier) ?? []), unite]);
  const aJouer = [...parFichier].map(([fichier, unites]) => ({ fichier, neuf: unites.some(({ nom }) => nom === null), unites }));

  const joues: MutantJoue[] = mutants.map((mutant) => ({ ...mutant, tuePar: null }));
  const budget = new AbortController();
  const minuterie = setTimeout(() => budget.abort(), outils.budgetMs);
  let suivant = 0;
  const pannes: string[] = [];
  const ouvrier = async (rang: number) => {
    if (budget.signal.aborted) return;
    const checkout = await outils.checkout(rang);
    try {
      // Le checkout porte la livraison : ce qu'elle change, copié de sa branche.
      for (const fichier of outils.fichiers) {
        const cible = join(checkout.worktree, fichier);
        const sienne = join(outils.branche, fichier);
        if (!existsSync(sienne)) {
          rmSync(cible, { force: true });
          continue;
        }
        mkdirSync(dirname(cible), { recursive: true });
        writeFileSync(cible, readFileSync(sienne));
      }
      while (!budget.signal.aborted && suivant < joues.length) {
        const joue = joues[suivant++]!;
        const chemin = join(checkout.worktree, joue.fichier);
        const original = readFileSync(chemin, "utf8");
        const lignes = original.split("\n");
        lignes[joue.ligne - 1] = joue.texte;
        writeFileSync(chemin, lignes.join("\n"));
        try {
          const tuePar: string[] = [];
          for (const fichier of aJouer) {
            const dossier = dossierDuTest(checkout.worktree, fichier.fichier);
            const passage = await outils.jouer(checkout.worktree, dossier, argumentsDuRejeu(dossier, fichier), budget.signal);
            if (budget.signal.aborted) break;
            for (const unite of fichier.unites) if (!passe(unite, passage)) tuePar.push(cle(unite));
          }
          if (!budget.signal.aborted) joue.tuePar = tuePar;
        } finally {
          writeFileSync(chemin, original);
        }
      }
    } finally {
      checkout.jeter();
    }
  };
  try {
    const rangs = Array.from({ length: Math.max(1, Math.min(outils.enParallele, joues.length)) }, (_, rang) => rang);
    const fins = await Promise.allSettled(rangs.map(ouvrier));
    for (const fin of fins) if (fin.status === "rejected") pannes.push(message(fin.reason));
  } finally {
    clearTimeout(minuterie);
  }
  const depasse = budget.signal.aborted;
  // Aucun mutant joué faute de checkout : rien n'est établi.
  if (pannes.length > 0 && joues.every(({ tuePar }) => tuePar === null) && !depasse) return { injouable: pannes[0]! };
  return { mutants: joues, budgetMs: outils.budgetMs, depasse };
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n === 1 ? "" : "s"}`;
const REGLE_DES_MUTATIONS = "Mutation check";

// Les mutants joués, et ceux qui ont survécu à tous les tests gelés.
const joues = (mutations: Mutations): MutantJoue[] => ("mutants" in mutations ? mutations.mutants.filter(({ tuePar }) => tuePar !== null) : []);
const survivants = (mutations: Mutations): MutantJoue[] => joues(mutations).filter(({ tuePar }) => tuePar!.length === 0);

const ou = (mutant: Mutant) => `\`${mutant.fichier}:${mutant.ligne}\``;

// La ligne que la pass écrit des mutations : dans son verdict sur la PR, et à son journal.
export function ligneDesMutations(mutations: Mutations): string {
  if ("aucunMutant" in mutations) return `${REGLE_DES_MUTATIONS}: 0 of 0 mutations caught — the delivery changes no line of code to mutate.`;
  if ("sansTest" in mutations) return `${REGLE_DES_MUTATIONS}: ${pluriel(mutations.sansTest, "mutant")} on the changed lines, not run — the delivery adds no test green on the branch to run them against.`;
  if ("injouable" in mutations) return `${REGLE_DES_MUTATIONS}: the mutants could not be run — ${mutations.injouable}.`;
  const faits = joues(mutations);
  const tues = faits.length - survivants(mutations).length;
  const total = mutations.mutants.length;
  if (mutations.depasse) return `${REGLE_DES_MUTATIONS}: ${tues} of ${faits.length} mutations caught — the time budget of ${mutations.budgetMs / 1000} s ran out, ${total - faits.length} of the ${pluriel(total, "mutant")} of the changed lines not run.`;
  return `${REGLE_DES_MUTATIONS}: ${tues} of ${total} mutations caught — only the lines this delivery changes are mutated, each mutant run against the tests it adds.`;
}

// Le motif du renvoi : chaque mutation qui a survécu, par son fichier et sa ligne.
export function motifDesMutations(mutations: Mutations): string[] {
  return survivants(mutations).map((mutant) => `- **Blocking**: ${REGLE_DES_MUTATIONS} — the mutation of ${ou(mutant)} (\`${mutant.avant}\` → ${mutant.apres === "" ? "removed" : `\`${mutant.apres}\``}) survived: every test this delivery adds still passes with that line changed. Add or sharpen a test that fails when it changes.`);
}

// L'enregistrement d'un critère d'acceptation et d'un fichier de test qui le
// couvre. La pass y écrit ce que les mutations ont établi ; `redOnMain` et
// `greenOnBranch` sont à la preuve qui les établit.
type EnregistrementDuCritere = {
  criterion: number;
  testPath: string;
  redOnMain?: boolean;
  greenOnBranch?: boolean;
  mutationsCaught: number;
  mutationsTotal: number;
  survivingLines: string[];
};

// Un enregistrement par critère et par fichier de test prouvé que la relecture
// lui rattache : les mutants joués que ses tests tuent, et les lignes des autres.
function enregistrementsDesCriteres(criteres: number, couvertures: readonly Couverture[] | null, preuve: Preuve, mutations: Mutations): EnregistrementDuCritere[] {
  const faits = joues(mutations);
  if (faits.length === 0) return [];
  const enregistrements: EnregistrementDuCritere[] = [];
  for (let rang = 0; rang < criteres; rang += 1) {
    const etat = etatDuCritere(couvertures?.[rang], preuve);
    if (etat.etat !== "test") continue;
    for (const testPath of new Set(etat.tests.map(({ fichier }) => fichier))) {
      const siens = new Set(etat.tests.filter(({ fichier }) => fichier === testPath).map(cle));
      const tue = (mutant: MutantJoue) => mutant.tuePar!.some((par) => siens.has(par));
      enregistrements.push({ criterion: rang + 1, testPath, mutationsCaught: faits.filter(tue).length, mutationsTotal: faits.length, survivingLines: faits.filter((mutant) => !tue(mutant)).map(({ fichier, ligne }) => `${fichier}:${ligne}`) });
    }
  }
  return enregistrements;
}

// Le résumé que la pass ajoute à son verdict : la ligne des mutations, puis
// une ligne par enregistrement de critère.
export function resumeDesMutations(mutations: Mutations, criteres: number, couvertures: readonly Couverture[] | null, preuve: Preuve): string {
  const enregistrements = enregistrementsDesCriteres(criteres, couvertures, preuve, mutations);
  return [
    ligneDesMutations(mutations),
    ...enregistrements.map(({ criterion, testPath, mutationsCaught, mutationsTotal, survivingLines }) => `- Criterion ${criterion}, \`${testPath}\`: ${mutationsCaught} of ${mutationsTotal} mutations caught${survivingLines.length === 0 ? "" : ` (surviving: ${survivingLines.map((ligne) => `\`${ligne}\``).join(", ")})`}`),
  ].join("\n");
}

// Ce que la station rend au cook dont une mutation survit, avant la PR de sa
// livraison (#3970) : le motif même que la pass écrirait, ligne à ligne.
export function consigneDesMutations(motif: readonly string[]): string {
  return [
    "## Mutations your tests let through",
    "",
    `Your delivery is committed on this branch. Before its PR, the station ran the pass's ${REGLE_DES_MUTATIONS.toLowerCase()} on it, and these mutations of lines you changed survived: the pass would send the delivery back for each. Add or sharpen a test that fails on each of them — or remove a line nothing asks for —, run it on the mutant by hand, commit, and end with your report as before.`,
    "",
    ...motif,
  ].join("\n");
}
