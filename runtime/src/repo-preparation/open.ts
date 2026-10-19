// Ouvre le ticket de préparation du dépôt d'un projet, une fois : la station
// le crée sur GitHub quand le chef ajoute le projet depuis l'app, avant
// d'écrire sa ligne — la cuisine qui s'ouvre ensuite sait déjà qu'elle
// l'attend. Son numéro se garde dans l'état du projet, qui survit au retrait
// du projet : rajouté, il ne s'en ouvre pas un second.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DE_CONFIANCE } from "../alimenter.ts";
import type { GitHub } from "../github.ts";
import { corps, dejaSurLaBase, LABELS, MARQUEUR, TITRE } from "./ticket.ts";

// Dans le répertoire d'état du projet.
export const FICHIER = "preparation-depot.json";

export type Preparation = { ticket: number; ouvertLe: string };

// Le ticket de préparation que la station a ouvert pour ce projet, ou null.
// Illisible, il n'en est pas un : la cuisine ne retient rien sur un fichier
// qu'elle ne comprend pas.
export function lirePreparation(repertoireEtat: string): Preparation | null {
  try {
    const lu = JSON.parse(readFileSync(join(repertoireEtat, FICHIER), "utf8")) as Partial<Preparation>;
    return Number.isSafeInteger(lu.ticket) && (lu.ticket ?? 0) > 0 && typeof lu.ouvertLe === "string" ? { ticket: lu.ticket as number, ouvertLe: lu.ouvertLe } : null;
  } catch {
    return null;
  }
}

function noter(repertoireEtat: string, preparation: Preparation): void {
  mkdirSync(repertoireEtat, { recursive: true });
  const fichier = join(repertoireEtat, FICHIER);
  writeFileSync(`${fichier}.ecriture`, `${JSON.stringify(preparation)}\n`);
  renameSync(`${fichier}.ecriture`, fichier);
}

export type OptionsOuverture = {
  repertoireEtat: string;
  projet: string;
  depot: string;
  base: string;
  // Le clone du projet : ce que sa branche d'intégration porte déjà se dit dans le ticket.
  clone: string;
  github: Pick<GitHub, "ouvertes" | "creerIssue">;
  maintenant?: () => Date;
};

// Rend le numéro du ticket, et s'il vient d'être ouvert. Déjà noté, rien ne
// part vers GitHub. Créé sans avoir pu être noté (la station s'est arrêtée
// entre les deux), il se retrouve parmi les issues ouvertes par son marqueur —
// posé par quelqu'un qui a la main sur le dépôt : n'importe qui peut ouvrir une
// issue sur un dépôt public, et ce ticket retient tout le rail.
export async function ouvrirLaPreparation(options: OptionsOuverture): Promise<{ ticket: number; ouvert: boolean }> {
  const { repertoireEtat } = options;
  const notee = lirePreparation(repertoireEtat);
  if (notee !== null) return { ticket: notee.ticket, ouvert: false };
  const ouvertLe = (options.maintenant ?? (() => new Date()))().toISOString();
  const sondage = await options.github.ouvertes();
  const existante = sondage.inchange ? undefined : sondage.issues.find((issue) => issue.body.includes(MARQUEUR) && DE_CONFIANCE.includes(issue.association));
  if (existante !== undefined) {
    noter(repertoireEtat, { ticket: existante.number, ouvertLe });
    return { ticket: existante.number, ouvert: false };
  }
  const { projet, depot, base, clone } = options;
  const ticket = await options.github.creerIssue({ titre: TITRE, corps: corps({ projet, depot, base, presents: dejaSurLaBase(clone, base) }), labels: LABELS });
  noter(repertoireEtat, { ticket, ouvertLe });
  return { ticket, ouvert: true };
}
