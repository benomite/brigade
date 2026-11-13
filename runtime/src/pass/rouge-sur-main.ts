// Rouge sur main, vert sur la branche (#3466) : la preuve qu'un test ajouté
// teste ce que le ticket demande. Pour la livraison d'un ticket qui n'est pas
// `tech`, la pass repère les tests qu'elle ajoute — un fichier de test neuf, ou
// un cas neuf dans un fichier de test qui existait —, les rejoue seuls sur un
// checkout jetable de la base où ses fichiers de test sont copiés, et les
// rejoue sur la branche. Chacun doit échouer sur la base et passer sur la
// branche : un test qui passe déjà sur la base ne prouve rien, et la livraison
// repart à son cook en le nommant. La suite n'est jamais jouée : seuls les
// tests ajoutés, par le lanceur de tests de Node, sans installation ni build.
//
// Ce module ne lit ni GitHub ni le journal : le checkout de la base et le
// lancement d'un fichier de test lui sont donnés. Il ne laisse rien derrière
// lui : le checkout est jeté, rien n'est commité.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// Le label d'un ticket technique — refactor, ménage, sans changement de
// comportement (`etiquettes.ts`) : il est exempté.
export const TECH = "tech";

// Un fichier de test que le lanceur de Node sait jouer.
const FICHIER_DE_TEST = /\.test\.[cm]?[jt]s$/;
// Ce qui sert les tests sans en être un : une aide, une doublure sous un dossier
// de tests. La branche les apporte avec ses tests sur le checkout de la base.
const SOUS_LES_TESTS = /(^|\/)(test|tests|__tests__)\//;
// Un cas : `test("…")`, `it("…")`, et leurs `.only` / `.skip` / `.todo`.
const CAS = /\b(?:test|it)(?:\.(?:only|skip|todo))?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
// Une ligne de résultat du reporteur TAP de Node, à toute profondeur.
const LIGNE_TAP = /^\s*(not )?ok \d+ - (.*?)(\s+# (?:SKIP|TODO)\b.*)?$/;
export const RESULTAT_TAP = /^\s*(?:not )?ok \d+ - /;

// Les noms des cas qu'un fichier de test déclare en toutes lettres. Un nom
// construit (`${…}`) ne se lit pas : il n'en est pas.
export function nomsDesCas(source: string): string[] {
  const noms = new Set<string>();
  for (const [, guillemet, brut] of source.matchAll(CAS)) {
    if (brut === undefined || (guillemet === "`" && brut.includes("${"))) continue;
    noms.add(brut.replace(/\\(.)/g, "$1"));
  }
  return [...noms];
}

// Ce qui se rejoue : un cas d'un fichier, ou tout le fichier quand il est neuf
// et que ses cas ne se lisent pas (`nom` nul) — il se juge alors à son code de sortie.
export type Unite = { fichier: string; nom: string | null };
export type Ajoutes = { fichiers: Array<{ fichier: string; neuf: boolean; unites: Unite[] }>; aCopier: string[] };

// Les tests que la livraison ajoute, parmi les fichiers qu'elle change :
// `base` et `branche` lisent un fichier tel que chacune le porte (null s'il n'y
// est pas). Un fichier de test neuf apporte tous ses cas ; un fichier qui
// existait, ceux que la base n'a pas. `aCopier` : ce que la branche porte sous
// ses tests et que la base doit recevoir pour les jouer — les fichiers de test
// et leurs aides changés.
export function testsAjoutes(fichiers: readonly string[], lire: { base(fichier: string): string | null; branche(fichier: string): string | null }): Ajoutes {
  const ajoutes: Ajoutes = { fichiers: [], aCopier: [] };
  for (const fichier of fichiers) {
    const sienne = FICHIER_DE_TEST.test(fichier) || SOUS_LES_TESTS.test(fichier) ? lire.branche(fichier) : null;
    if (sienne === null) continue;
    ajoutes.aCopier.push(fichier);
    if (!FICHIER_DE_TEST.test(fichier)) continue;
    const avant = lire.base(fichier);
    const noms = nomsDesCas(sienne);
    if (avant === null) {
      ajoutes.fichiers.push({ fichier, neuf: true, unites: noms.length === 0 ? [{ fichier, nom: null }] : noms.map((nom) => ({ fichier, nom })) });
      continue;
    }
    const deja = new Set(nomsDesCas(avant));
    const neufs = noms.filter((nom) => !deja.has(nom));
    if (neufs.length > 0) ajoutes.fichiers.push({ fichier, neuf: false, unites: neufs.map((nom) => ({ fichier, nom })) });
  }
  return ajoutes;
}

// Ce que le reporteur TAP dit de chaque cas : passé ou non. Un nom qui revient
// n'est passé que s'il passe partout ; un cas sauté ou à faire n'a rien dit.
export function resultatsTap(lignes: readonly string[]): Map<string, boolean> {
  const resultats = new Map<string, boolean>();
  for (const ligne of lignes) {
    const [, rate, brut, saute] = LIGNE_TAP.exec(ligne) ?? [];
    if (brut === undefined || saute !== undefined) continue;
    const nom = brut.replace(/\\(.)/g, "$1");
    resultats.set(nom, rate === undefined && resultats.get(nom) !== false);
  }
  return resultats;
}

// Un fichier de test joué : son code de sortie (null : arrêté) et ses lignes de résultat.
export type Passage = { code: number | null; lignes: string[] };
// Un cas absent de la sortie — le fichier n'a pas pu se charger, un import que
// la base n'a pas — n'a pas passé.
const passe = (unite: Unite, passage: Passage) => (unite.nom === null ? passage.code === 0 : resultatsTap(passage.lignes).get(unite.nom) === true);

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Les arguments de `node` qui jouent, dans `dossier`, les seules unités du
// fichier : tout le fichier s'il est neuf, ses cas neufs sinon.
export function argumentsDuRejeu(dossier: string, { fichier, neuf, unites }: Ajoutes["fichiers"][number]): string[] {
  const motifs = neuf ? [] : unites.map(({ nom }) => `--test-name-pattern=^${echapper(nom ?? "")}$`);
  return ["--test", "--test-reporter=tap", "--test-force-exit", ...motifs, relative(dossier, fichier).split("\\").join("/")];
}

// Le dossier d'où se joue un fichier de test : celui du `package.json` le plus
// proche, comme le lance le script de tests du projet — la racine sinon.
export function dossierDuTest(worktree: string, fichier: string): string {
  for (let dossier = dirname(fichier); dossier !== "." && dossier !== ""; dossier = dirname(dossier)) {
    if (existsSync(join(worktree, dossier, "package.json"))) return dossier;
  }
  return ".";
}

// Une unité rejouée, et ce qu'elle a fait de chaque côté.
export type Rejeu = Unite & { main: boolean; branche: boolean };

// Ce que la règle a établi. `exempte` : un ticket `tech`. `sansTest` : la
// livraison n'ajoute aucun test. `injouable` : les tests n'ont pas pu être
// rejoués, et pourquoi — rien n'est prouvé, rien n'est renvoyé.
export type Preuve = { exempte: true } | { sansTest: true } | { injouable: string } | { rejeux: Rejeu[] };

export type OutilsDuRejeu = {
  // Les fichiers que la livraison change, par rapport à la base.
  fichiers: readonly string[];
  // Le worktree de la branche livrée.
  branche: string;
  // Un checkout jetable de la base, et de quoi le jeter.
  base(): Promise<{ worktree: string; jeter(): void }>;
  // Joue `node <args>` dans `dossier` du worktree. Ne lève pas.
  jouer(worktree: string, dossier: string, args: string[]): Promise<Passage>;
};

const lireSiPresent = (chemin: string) => (existsSync(chemin) ? readFileSync(chemin, "utf8") : null);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Rejoue les tests que la livraison ajoute, sur la base et sur la branche.
export async function prouver(labels: readonly string[], outils: OutilsDuRejeu): Promise<Preuve> {
  if (labels.includes(TECH)) return { exempte: true };
  const lireBranche = (fichier: string) => lireSiPresent(join(outils.branche, fichier));
  // Aucun fichier de test touché : pas de checkout de la base.
  if (!outils.fichiers.some((fichier) => FICHIER_DE_TEST.test(fichier) && existsSync(join(outils.branche, fichier)))) return { sansTest: true };
  let base: { worktree: string; jeter(): void };
  try {
    base = await outils.base();
  } catch (erreur) {
    return { injouable: `no throwaway checkout of the base: ${message(erreur)}` };
  }
  try {
    const ajoutes = testsAjoutes(outils.fichiers, { base: (fichier) => lireSiPresent(join(base.worktree, fichier)), branche: lireBranche });
    if (ajoutes.fichiers.length === 0) return { sansTest: true };
    for (const fichier of ajoutes.aCopier) {
      const cible = join(base.worktree, fichier);
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, readFileSync(join(outils.branche, fichier)));
    }
    const rejeux: Rejeu[] = [];
    for (const ajoute of ajoutes.fichiers) {
      const [surLaBase, surLaBranche] = await Promise.all(
        [base.worktree, outils.branche].map((worktree) => {
          const dossier = dossierDuTest(worktree, ajoute.fichier);
          return outils.jouer(worktree, dossier, argumentsDuRejeu(dossier, ajoute));
        }),
      );
      for (const unite of ajoute.unites) rejeux.push({ ...unite, main: passe(unite, surLaBase!), branche: passe(unite, surLaBranche!) });
    }
    return { rejeux };
  } catch (erreur) {
    return { injouable: message(erreur) };
  } finally {
    base.jeter();
  }
}

export const nomDuTest = ({ fichier, nom }: Unite) => (nom === null ? `\`${fichier}\`` : `\`${nom}\` (\`${fichier}\`)`);
// Rouges sur la base, verts sur la branche : ils prouvent.
export const prouves = (preuve: Preuve): Rejeu[] => ("rejeux" in preuve ? preuve.rejeux.filter((rejeu) => !rejeu.main && rejeu.branche) : []);
// Verts sur la base : ils ne prouvent rien, et renvoient la livraison.
export const vertsSurLaBase = (preuve: Preuve): Rejeu[] => ("rejeux" in preuve ? preuve.rejeux.filter((rejeu) => rejeu.main) : []);

const pluriel = (n: number, mot: string) => `${n} ${mot}${n === 1 ? "" : "s"}`;
const REGLE = "Red on main, green on the branch";

// La ligne que la pass écrit d'une preuve : dans son résumé sur la PR.
export function ligneDeLaPreuve(preuve: Preuve, base: string): string {
  if ("exempte" in preuve) return `${REGLE}: not replayed — a \`${TECH}\` ticket is exempt.`;
  if ("sansTest" in preuve) return `${REGLE}: the delivery adds no test to replay.`;
  if ("injouable" in preuve) return `${REGLE}: the added tests could not be replayed — ${preuve.injouable}.`;
  const verts = vertsSurLaBase(preuve).length;
  const rouges = preuve.rejeux.filter((rejeu) => !rejeu.main && !rejeu.branche).length;
  return `${REGLE}: ${pluriel(preuve.rejeux.length, "added test")} replayed alone on \`${base}\` — ${prouves(preuve).length} red on \`${base}\` and green on the branch${verts === 0 ? "" : `, ${verts} already green on \`${base}\``}${rouges === 0 ? "" : `, ${rouges} not green on the branch either (not counted as proof)`}.`;
}

// Ce que la station écrit à son journal : la liste de ce qu'elle a rejoué sur
// la base, et rien de la suite. Null quand rien n'a été rejoué ni exempté.
export function journalDeLaPreuve(preuve: Preuve, base: string): string | null {
  if ("exempte" in preuve || "injouable" in preuve) return ligneDeLaPreuve(preuve, base);
  if ("sansTest" in preuve) return null;
  return `${REGLE}: only the tests this delivery adds were replayed on \`${base}\`, not the suite — ${preuve.rejeux.map((rejeu) => `${nomDuTest(rejeu)} ${rejeu.main ? "green" : "red"} on \`${base}\`, ${rejeu.branche ? "green" : "red"} on the branch`).join("; ")}`;
}

// Le motif du renvoi : chaque test déjà vert sur la base, nommé.
export function motifDuRenvoi(verts: readonly Rejeu[], base: string): string[] {
  return verts.map((rejeu) => `- **Blocking**: ${REGLE} — the added test ${nomDuTest(rejeu)} already passes on \`${base}\`: it proves nothing about this ticket. Make it fail without this delivery's change, or replace it with a test that does.`);
}

// Ce que la relecture dit d'un critère d'acceptation : les tests du diff qui le
// vérifient, et si elle l'a jugé elle-même en lisant.
export type Couverture = { tests: string[]; relecture: boolean };
export type EtatDuCritere = { etat: "test"; tests: Rejeu[] } | { etat: "relecture" } | { etat: "rien" };

// L'état d'un critère : couvert par un test rouge sur la base et vert sur la
// branche que la relecture lui rattache ; sinon jugé par la relecture seule ;
// sinon couvert par rien. Un test que la relecture nomme sans qu'il ait prouvé
// ne couvre rien.
export function etatDuCritere(couverture: Couverture | undefined, preuve: Preuve): EtatDuCritere {
  const nommes = new Set(couverture?.tests ?? []);
  const tests = prouves(preuve).filter(({ fichier, nom }) => nommes.has(nom ?? fichier));
  if (tests.length > 0) return { etat: "test", tests };
  return couverture?.relecture === true ? { etat: "relecture" } : { etat: "rien" };
}

const CRITERE_MAX = 200;
const couperCritere = (texte: string) => (texte.length <= CRITERE_MAX ? texte : `${texte.slice(0, CRITERE_MAX - 1)}…`);

// Une ligne par critère d'acceptation du ticket, dans le résumé de la pass.
// `couvertures` : ce que la relecture a dit de chacun, dans l'ordre ; nul si
// elle n'a rien dit (une livraison renvoyée avant d'être relue).
export function lignesDesCriteres(criteres: readonly string[], couvertures: readonly Couverture[] | null, preuve: Preuve, base: string): string[] {
  return criteres.map((critere, rang) => {
    const etat = etatDuCritere(couvertures?.[rang], preuve);
    const dit =
      etat.etat === "test"
        ? `covered by a test red on \`${base}\` and green on the branch: ${etat.tests.map(nomDuTest).join(", ")}`
        : etat.etat === "relecture"
          ? "judged by the review alone"
          : "covered by nothing";
    return `- ${couperCritere(critere)} — **${dit}**`;
  });
}

// Le résumé que la pass ajoute à son verdict sur la PR : la ligne de la preuve,
// puis une ligne par critère.
export function resumeDeLaPreuve(criteres: readonly string[], couvertures: readonly Couverture[] | null, preuve: Preuve, base: string): string {
  return [ligneDeLaPreuve(preuve, base), ...(criteres.length === 0 ? [] : ["", "Acceptance criteria:", ...lignesDesCriteres(criteres, couvertures, preuve, base)])].join("\n");
}
