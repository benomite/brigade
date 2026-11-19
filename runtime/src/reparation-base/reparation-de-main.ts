// La réparation de main tenue sans attendre personne (#3815) : le 2026-11-17,
// main est restée rouge 26 h, la cuisine retenue sur la base rouge, sans
// réparation sur le rail — #3680 avait été mise de côté après ses échecs, et
// la marque de son commit faisait taire le rouge.
//
// Ce module se pose sur l'ouverture et la fermeture des réparations de la base
// (`base-rouge/`), sans les doubler :
// - Rouge, une réparation `repair-main` vivante sur le rail est la réparation :
//   rien ne s'ouvre. Sans elle, l'ouverture crée le ticket, au titre
//   `Repair main: <test en échec>`, au label `repair-main`, et son corps dit le
//   test et son erreur.
// - Une réparation mise de côté ne compte plus : elle ne fait plus taire son
//   commit, et une nouvelle naît du dernier commit rouge de main, dont le corps
//   nomme celle qui a été mise de côté.
// - Verte, une réparation `repair-main` qu'aucun cook ne tient se ferme ; celle
//   qu'un cook ou la pass tient finit.
// Le tour la place avant tout autre ticket, et la base rouge ne retient pas son merge.
import { LABEL_IN_PASS, LABEL_REPARATION_DE_MAIN, LABEL_TAKEN, PREFIXE_DE_LA_REPARATION, etatDeLaBase } from "../github-etat/etats.ts";
import { estMisDeCote, type Issue } from "../github.ts";
import { lireTenant, type GitHubDeLaPrise } from "../github-etat/prise.ts";
import { PRIO_REPARATION } from "../reparation.ts";
import { commentaireDeLaFermeture, fermeReparation, type GitHubDeLaFermeture, type TicketDeLaFermeture } from "../base-rouge/ferme-reparation.ts";
import { LABEL_CAUSE_CORRIGEE, ouvreReparation, sortieDErreur, viseLaCause, type CheckDeLaBase, type GitHubDeLaReparation, type OuvertureDeLaReparation } from "../base-rouge/ouvre-reparation.ts";

// La convention partagée avec les autres tickets de #3812 (`github-etat/etats.ts`, que l'app lit aussi).
export { LABEL_REPARATION_DE_MAIN, PREFIXE_DE_LA_REPARATION };

export const estUneReparationDeMain = (labels: readonly string[]): boolean => labels.includes(LABEL_REPARATION_DE_MAIN);

// Le rang d'un ticket devant le rail : une réparation de main passe avant tout autre.
export const avantLeRail = (labels: readonly string[]): number => (estUneReparationDeMain(labels) ? 0 : 1);

// Le test en échec qu'un journal nomme, le premier, et la première erreur qui
// le suit : `not ok N - <nom>` (TAP) ou `✖ <nom> (12ms)` (le rapport `spec`).
type TestEnEchec = { nom: string; erreur: string | null };
const NOT_OK = /^\s*not ok \d+ - (.+?)\s*(?:#.*)?$/;
const CROIX = /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?m?s\))?\s*$/;
const ERREUR = /\b\w*Error\b|^\s*error:/;
function testEnEchec(journal: string): TestEnEchec | null {
  const lignes = sortieDErreur(journal, Number.POSITIVE_INFINITY).split("\n");
  for (const [rang, ligne] of lignes.entries()) {
    const nom = (NOT_OK.exec(ligne) ?? CROIX.exec(ligne))?.[1]?.trim();
    // `✖ failing tests:`, l'entête du récapitulatif, n'est pas un test.
    if (nom === undefined || nom === "" || nom.endsWith(":")) continue;
    const erreur = lignes.slice(rang + 1).find((suivante) => ERREUR.test(suivante) && !NOT_OK.test(suivante) && !CROIX.test(suivante));
    return { nom, erreur: erreur === undefined ? null : erreur.trim().replace(/^error:\s*/, "").replace(/^['"|-]+\s*|['"]$/g, "") };
  }
  return null;
}

const TITRE_MAX = 200;
const titreDeLaReparationDeMain = (nom: string): string => {
  const titre = `${PREFIXE_DE_LA_REPARATION} ${nom}`;
  return titre.length > TITRE_MAX ? `${titre.slice(0, TITRE_MAX - 1)}…` : titre;
};

// Le corps de l'ouverture (`corpsDeLaReparation`), avec le test en échec et les
// réparations mises de côté qu'elle reprend, avant ses critères d'acceptation.
function corpsDeLaReparationDeMain(corps: string, base: string, test: TestEnEchec | null, misesDeCote: readonly number[]): string {
  const ajout = [
    ...(test === null ? [] : ["## Failing test", "", `- Test: \`${test.nom}\``, `- Error: ${test.erreur === null ? "_not found in the job log_" : `\`${test.erreur}\``}`, ""]),
    ...(misesDeCote.length === 0
      ? []
      : ["## Set-aside repair", "", `This ticket restarts the repair of \`${base}\` from its latest red commit: ${misesDeCote.map((numero) => `#${numero}`).join(", ")} ${misesDeCote.length === 1 ? "was" : "were"} set aside. Read ${misesDeCote.length === 1 ? "its" : "their"} comments before starting.`, ""]),
  ];
  if (ajout.length === 0) return corps;
  // `corpsDeLaReparation` tient toujours ses critères ; la fonction garde un `$` du journal tel quel.
  return corps.replace("## Acceptance criteria", (criteres) => `${ajout.join("\n")}\n${criteres}`);
}

// Ce que la réparation de main lit de GitHub : l'ouverture, et le rail.
export type GitHubDeLaReparationDeMain = GitHubDeLaReparation & {
  fires(): Promise<Pick<Issue, "number" | "labels" | "state">[]>;
};

export type OptionsDeLaReparationDeMain = { github: GitHubDeLaReparationDeMain; base: string; maintenant?: () => Date };

export function reparationDeMain(options: OptionsDeLaReparationDeMain) {
  const { github, base } = options;
  // Ce que le rail dit à l'appel en cours : la réparation vivante, et celles
  // mises de côté ; et les journaux des checks rouges que l'ouverture y a lus.
  let vivante: number | null = null;
  let misesDeCote: number[] = [];
  let journaux: string[] = [];
  const enveloppe: GitHubDeLaReparationDeMain = {
    ...github,
    // Une réparation mise de côté ne fait plus taire son commit rouge, ni ne se
    // reprend pour le regrouper (#3614).
    issuesDepuis: async (instant) => (await github.issuesDepuis(instant)).filter((issue) => !misesDeCote.includes(issue.number)),
    // La réparation vivante du rail est celle de ce rouge : rien ne se crée, et
    // un autre commit rouge s'y consigne (#3614). Elle ne porte pas la marque
    // de ce rouge : l'ouverture ne la ferme jamais comme un doublon.
    creerIssue: async ({ corps, labels }) => {
      if (vivante !== null) return vivante;
      const test = journaux.map(testEnEchec).find((lu) => lu !== null) ?? null;
      return github.creerIssue({
        titre: titreDeLaReparationDeMain(test?.nom ?? ([...corps.matchAll(/^- `(.+)`$/gm)][0]?.[1] ?? "checks")),
        corps: corpsDeLaReparationDeMain(corps, base, test, misesDeCote),
        labels: [...labels, LABEL_REPARATION_DE_MAIN],
      });
    },
    journalDuCheck: async (check) => {
      const journal = (await github.journalDuCheck?.(check)) ?? null;
      if (journal !== null) journaux.push(journal);
      return journal;
    },
  };
  const nouvelle = () => ouvreReparation({ ...options, github: enveloppe });
  let ouvrir = nouvelle();

  // Les checks de la base, tels que la relance les rend. Rouges, le rail est lu
  // d'abord ; illisible, rien ne s'ouvre, l'erreur est rendue et le tour
  // suivant réessaie.
  return async (checks: CheckDeLaBase[]): Promise<OuvertureDeLaReparation> => {
    if (etatDeLaBase(checks) !== "red") return { sha: null, reparation: null };
    let rail: Awaited<ReturnType<GitHubDeLaReparationDeMain["fires"]>>;
    try {
      rail = await github.fires();
    } catch (erreur) {
      return { sha: null, reparation: null, erreur: `the rail is unreadable: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
    }
    // Une réparation d'avant #3815 (`prio:0`) mise de côté ne fait pas plus taire le rouge.
    const reparations = rail.filter(({ state, labels }) => state === "open" && (estUneReparationDeMain(labels) || labels.includes(PRIO_REPARATION)));
    vivante = reparations.find(({ labels }) => estUneReparationDeMain(labels) && !estMisDeCote(labels))?.number ?? null;
    misesDeCote = reparations.filter(({ labels }) => estMisDeCote(labels)).map(({ number }) => number);
    journaux = [];
    let ouverture = await ouvrir(checks);
    // Le cache de l'ouverture tient encore la réparation mise de côté depuis : il repart de GitHub.
    if (ouverture.reparation !== null && misesDeCote.includes(ouverture.reparation)) {
      ouvrir = nouvelle();
      journaux = [];
      ouverture = await ouvrir(checks);
    }
    return ouverture;
  };
}

// La fermeture des réparations de la base (`fermeReparation`), puis, verte,
// chaque réparation de main encore ouverte qu'aucun cook ni la pass ne tient :
// celle qu'ils tiennent finit. Un `taken` qu'aucune prise ne tient (#2056) ne
// tient rien : la purge du tour le retire. Rendu : les numéros fermés.
export function fermeReparationDeMain({ github, base }: { github: GitHubDeLaFermeture & GitHubDeLaPrise; base: string }) {
  const fermer = fermeReparation({ github, base });
  return async (checks: CheckDeLaBase[], tickets: TicketDeLaFermeture[]): Promise<number[]> => {
    const fermees = await fermer(checks, tickets);
    if (etatDeLaBase(checks) !== "green") return fermees;
    for (const { number, labels, state } of tickets) {
      if (state !== "open" || fermees.includes(number) || !estUneReparationDeMain(labels)) continue;
      if (labels.includes(LABEL_IN_PASS)) continue;
      if (labels.includes(LABEL_TAKEN) && (await lireTenant(number, github, labels)) !== null) continue;
      // Une réparation qui vise la cause (#3614) ne se ferme qu'avec la cause corrigée.
      if (viseLaCause(await github.corpsDuTicket(number)) && !labels.includes(LABEL_CAUSE_CORRIGEE)) continue;
      await github.commenter(number, commentaireDeLaFermeture(base));
      await github.fermerIssue(number);
      fermees.push(number);
    }
    return fermees;
  };
}
