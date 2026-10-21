// Les tests que le chef a refusé de retirer : à ne plus lui proposer. Un test
// s'y inscrit sous son identifiant (`idDuTest` : fichier, puis nom complet),
// avec la date du refus et, si on la donne, sa raison — dans
// <répertoire d'état>/refused-tests.json, à côté de l'historique. Le fichier
// est du JSON indenté, une entrée par test dans l'ordre des refus, pour que le
// chef le relise (et le corrige) à la main.
//
// Refuser deux fois le même test n'en fait qu'une entrée : la première date,
// la première raison restent. Chaque appel relit le fichier : deux process se
// voient, et un redémarrage ne perd rien.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Refus = {
  test: string;
  // Quand le chef a refusé (ISO 8601).
  refused_at: string;
  reason?: string;
};

type Fichier = { version: 1; refused: Refus[] };

export function cheminDesRefus(repertoireEtat: string): string {
  return join(repertoireEtat, "refused-tests.json");
}

export type RegistreDesRefus = {
  refuse(testId: string, reason?: string): void;
  isRefused(testId: string): boolean;
  listRefused(): Refus[];
  filterProposable(testIds: string[]): string[];
};

function lire(fichier: string): Refus[] {
  if (!existsSync(fichier)) return [];
  let contenu: unknown;
  try {
    contenu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new Error(`${fichier} is not valid JSON: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  const liste = (contenu as Partial<Fichier> | null)?.refused;
  if (!Array.isArray(liste)) throw new Error(`${fichier} has no “refused” list`);
  return liste as Refus[];
}

export function ouvrirRefus(repertoireEtat: string, maintenant: () => Date = () => new Date()): RegistreDesRefus {
  const fichier = cheminDesRefus(repertoireEtat);
  return {
    refuse(testId, reason) {
      if (testId === "") throw new Error("a test id cannot be empty");
      const refus = lire(fichier);
      if (refus.some((r) => r.test === testId)) return;
      refus.push({ test: testId, refused_at: maintenant().toISOString(), ...(reason === undefined || reason === "" ? {} : { reason }) });
      mkdirSync(dirname(fichier), { recursive: true });
      const provisoire = `${fichier}.${process.pid}.tmp`;
      writeFileSync(provisoire, `${JSON.stringify({ version: 1, refused: refus } satisfies Fichier, null, 2)}\n`);
      renameSync(provisoire, fichier);
    },
    isRefused: (testId) => lire(fichier).some((r) => r.test === testId),
    listRefused: () => lire(fichier),
    filterProposable(testIds) {
      const refuses = new Set(lire(fichier).map((r) => r.test));
      return testIds.filter((id) => !refuses.has(id));
    },
  };
}
