// La couverture propre de chaque test : les lignes de code qu'il fait tourner
// et qu'aucun autre test ne fait tourner. Un test dont cette liste est vide ne
// vérifie rien que d'autres ne vérifient déjà — deux tests qui couvrent la même
// chose n'en ont, ni l'un ni l'autre, en propre.
//
// La mesure fait tourner la suite du projet sous son propre lanceur, avec un
// relevé de couverture par test (`crochet.ts`), puis écrit le rapport, que la
// suite n'a plus à rejouer pour être relu :
//
//   BRIGADE_STATE_DIR=<state directory> node runtime/src/valeur-tests/couverture/mesurer-cli.ts
//
// depuis le dépôt — le rapport est alors <state directory>/test-coverage.json.
// Les options sont dans `mesurer-cli.ts`. On le relit par
// `lireCouverture(chemin).uniqueCoverage(test)`.
//
// L'identifiant d'un test est celui de l'historique des tests
// (`../historique/junit.ts`) : son fichier, relatif à la racine du dépôt, puis
// son nom complet. Un emplacement est `<fichier de code>:<ligne>`, le fichier
// relatif à la même racine. Le code est ce que `cheminDuCode` (`lignes.ts`)
// retient : ni les tests ni leurs aides.
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { idDuTest } from "../historique/junit.ts";
import type { Mesure } from "./crochet.ts";
import { reunir, type Intervalles } from "./lignes.ts";

export const FORMAT = 1;

export type TestCouvert = {
  test: string;
  file: string;
  name: string;
  // Le nombre de lignes de code qu'il fait tourner.
  covered: number;
  // Le nombre de celles qu'il est seul à faire tourner, et leur liste.
  uniqueCount: number;
  unique: string[];
};

// Une suite tuée au bout de son délai a `timedOut`, et pas de code.
export type Suite = { zone: string; code: number | null; timedOut: boolean };

export type RapportDeCouverture = {
  format: typeof FORMAT;
  // Quand la suite a été mesurée, et sur quel commit.
  date: string;
  commit: string | null;
  // Les suites jouées, et le code de chacune : un test en échec a tout de même
  // sa couverture.
  suites: Suite[];
  tests: TestCouvert[];
};

export class TestInconnu extends Error {}
export class RapportIlisible extends Error {}

export function cheminCouverture(repertoireEtat: string): string {
  return join(repertoireEtat, "test-coverage.json");
}

// Les mesures que le crochet a écrites dans le répertoire. Une ligne qui ne se
// lit pas est celle d'un process tué en l'écrivant : elle ne compte pas.
export function lireMesures(dossier: string): Mesure[] {
  return readdirSync(dossier)
    .filter((nom) => /^mesures-.*\.jsonl$/.test(nom))
    .sort()
    .flatMap((nom) =>
      readFileSync(join(dossier, nom), "utf8")
        .split("\n")
        .filter((ligne) => ligne !== "")
        .flatMap((ligne) => {
          try {
            return [JSON.parse(ligne) as Mesure];
          } catch {
            return [];
          }
        }),
    );
}

const compter = (intervalles: Intervalles) => intervalles.reduce((n, [debut, fin]) => n + fin - debut + 1, 0);

// Le rapport des mesures. Un test mesuré deux fois — deux tests de même nom
// dans un fichier, ou un fichier joué deux fois — n'en fait qu'un, qui couvre
// ce que couvrent les deux. Un fichier de tests n'est jamais du code couvert.
export function assembler(mesures: Mesure[], tour: { date: Date; commit: string | null; suites: Suite[] }): RapportDeCouverture {
  const parTest = new Map<string, { file: string; name: string; lignes: Map<string, Intervalles> }>();
  for (const mesure of mesures) {
    const id = idDuTest(mesure.file, mesure.name);
    const test = parTest.get(id) ?? { file: mesure.file, name: mesure.name, lignes: new Map<string, Intervalles>() };
    for (const [fichier, intervalles] of Object.entries(mesure.lines)) test.lignes.set(fichier, reunir(test.lignes.get(fichier) ?? [], intervalles));
    parTest.set(id, test);
  }
  const fichiersDeTests = new Set([...parTest.values()].map((t) => t.file));
  for (const test of parTest.values()) for (const fichier of fichiersDeTests) test.lignes.delete(fichier);

  // Pour chaque ligne de code, combien de tests la couvrent, et le dernier vu.
  const couvreurs = new Map<string, Map<number, { n: number; test: string }>>();
  for (const [id, test] of parTest) {
    for (const [fichier, intervalles] of test.lignes) {
      let lignes = couvreurs.get(fichier);
      if (lignes === undefined) couvreurs.set(fichier, (lignes = new Map()));
      for (const [debut, fin] of intervalles) {
        for (let ligne = debut; ligne <= fin; ligne++) {
          const vu = lignes.get(ligne);
          lignes.set(ligne, { n: (vu?.n ?? 0) + 1, test: id });
        }
      }
    }
  }

  const tests = [...parTest]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, test]): TestCouvert => {
      const unique: string[] = [];
      let covered = 0;
      for (const fichier of [...test.lignes.keys()].sort()) {
        const intervalles = test.lignes.get(fichier) ?? [];
        covered += compter(intervalles);
        const lignes = couvreurs.get(fichier);
        for (const [debut, fin] of intervalles) {
          for (let ligne = debut; ligne <= fin; ligne++) {
            const vu = lignes?.get(ligne);
            if (vu?.n === 1 && vu.test === id) unique.push(`${fichier}:${ligne}`);
          }
        }
      }
      return { test: id, file: test.file, name: test.name, covered, uniqueCount: unique.length, unique };
    });
  return { format: FORMAT, date: tour.date.toISOString(), commit: tour.commit, suites: tour.suites, tests };
}

// Écrit le rapport d'un coup : qui le relit pendant l'écriture trouve l'ancien
// en entier, jamais un morceau du nouveau.
export function ecrireRapport(chemin: string, rapport: RapportDeCouverture): void {
  const provisoire = `${chemin}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify(rapport, null, 1)}\n`);
  renameSync(provisoire, chemin);
}

export class Couverture {
  readonly rapport: RapportDeCouverture;
  #parTest: Map<string, TestCouvert>;

  constructor(rapport: RapportDeCouverture) {
    this.rapport = rapport;
    this.#parTest = new Map(rapport.tests.map((t) => [t.test, t]));
  }

  // Les tests mesurés, par identifiant.
  tests(): string[] {
    return [...this.#parTest.keys()];
  }

  // Les emplacements que ce test est seul à couvrir — vide s'il ne couvre rien
  // en propre. Un test que la mesure n'a pas vu lève `TestInconnu` : ne rien
  // savoir de lui n'est pas savoir qu'il ne couvre rien.
  uniqueCoverage(test: string): string[] {
    const couvert = this.#parTest.get(test);
    if (couvert === undefined) throw new TestInconnu(`unknown test: “${test}” is not in the coverage report (${this.#parTest.size} tests measured on ${this.rapport.date})`);
    return [...couvert.unique];
  }
}

export function lireCouverture(chemin: string): Couverture {
  let rapport: RapportDeCouverture;
  try {
    rapport = JSON.parse(readFileSync(chemin, "utf8")) as RapportDeCouverture;
  } catch (erreur) {
    throw new RapportIlisible(`the coverage report ${chemin} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  if (rapport?.format !== FORMAT || !Array.isArray(rapport.tests)) throw new RapportIlisible(`${chemin} is not a coverage report of format ${FORMAT}`);
  return new Couverture(rapport);
}
