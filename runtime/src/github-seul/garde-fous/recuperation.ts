// Ce que les cooks partis ont laissé dans l'état de la cuisine, rendu quand la
// machine sature sans cook en vol : leurs worktrees et les flux de leurs runs.
// Seul le répertoire des worktrees du projet et le dossier `runs` de son état
// sont touchés — rien hors de la cuisine. Un worktree ou un flux modifié depuis
// moins de `GRACE_MS` reste : une relecture ou des gates peuvent encore y
// tourner sans qu'aucun cook de ticket ne soit en vol.
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const GRACE_MS = 3_600_000;

// Ce que la récupération demande au disque : les noms d'un dossier, l'heure de
// dernière modification d'un chemin, le retrait d'un chemin.
export type Fichiers = {
  lister(dossier: string): string[];
  modifie(chemin: string): number;
  retirer(chemin: string): void;
};

const fichiersReels: Fichiers = {
  lister: (dossier) => readdirSync(dossier),
  modifie: (chemin) => statSync(chemin).mtimeMs,
  retirer: (chemin) => rmSync(chemin, { recursive: true, force: true }),
};

type Recuperation = { retires: string[]; echecs: string[] };

const absent = (erreur: unknown) => (erreur as NodeJS.ErrnoException).code === "ENOENT";

// Retire ce qui traîne sous chaque dossier depuis plus de `GRACE_MS`. Un dossier
// absent ne porte rien ; tout autre échec — lecture, retrait — se dit dans
// `echecs`, sans arrêter le reste.
export function recuperer(lieux: { worktrees: string; repertoireEtat: string }, fichiers: Fichiers = fichiersReels, maintenant: () => Date = () => new Date()): Recuperation {
  const retires: string[] = [];
  const echecs: string[] = [];
  const instant = maintenant().getTime();
  for (const dossier of [lieux.worktrees, join(lieux.repertoireEtat, "runs")]) {
    let noms: string[];
    try {
      noms = fichiers.lister(dossier);
    } catch (erreur) {
      if (!absent(erreur)) echecs.push(dossier);
      continue;
    }
    for (const nom of noms) {
      const chemin = join(dossier, nom);
      try {
        if (instant - fichiers.modifie(chemin) < GRACE_MS) continue;
        fichiers.retirer(chemin);
        retires.push(chemin);
      } catch {
        echecs.push(chemin);
      }
    }
  }
  return { retires, echecs };
}
