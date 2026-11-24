// Ce que les cooks partis ont laissé dans l'état de la cuisine, rendu quand la
// machine sature sans cook en vol : leur worktree et le flux de leur run. Seuls
// les runs que le journal dit finis, toutes stations confondues, sont rendus :
// le worktree d'un cook en vol d'une autre station, d'une relecture ou de gates
// que le journal ne connaît pas reste où il est. Rien hors du répertoire des
// worktrees du projet et du dossier `runs` de son état n'est touché.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// Ce que la récupération demande au disque : les noms d'un dossier, le retrait
// d'un chemin, et l'oubli par le clone des worktrees disparus.
export type Fichiers = {
  lister(dossier: string): string[];
  retirer(chemin: string): void;
  elaguer(clone: string): void;
};

const fichiersReels: Fichiers = {
  lister: (dossier) => readdirSync(dossier),
  retirer: (chemin) => rmSync(chemin, { recursive: true, force: true }),
  elaguer: (clone) => void execFileSync("git", ["worktree", "prune"], { cwd: clone, stdio: "ignore" }),
};

type Recuperation = { retires: string[]; echecs: string[] };

const absent = (erreur: unknown) => (erreur as NodeJS.ErrnoException).code === "ENOENT";

// Retire le worktree `<run>` et le flux `<run>.jsonl` de chaque run fini, puis fait
// oublier au clone ses worktrees disparus (sinon leur branche resterait prise). Un
// dossier absent ne porte rien ; tout autre échec — lecture, retrait — se dit dans
// `echecs`, sans arrêter le reste.
export function recuperer(lieux: { worktrees: string; repertoireEtat: string; clone?: string; finis: string[] }, fichiers: Fichiers = fichiersReels): Recuperation {
  const retires: string[] = [];
  const echecs: string[] = [];
  const finis = new Set(lieux.finis);
  for (const [dossier, nomDe] of [
    [lieux.worktrees, (run: string) => run],
    [join(lieux.repertoireEtat, "runs"), (run: string) => `${run}.jsonl`],
  ] as const) {
    let noms: string[];
    try {
      noms = fichiers.lister(dossier);
    } catch (erreur) {
      if (!absent(erreur)) echecs.push(dossier);
      continue;
    }
    const rendables = new Set([...finis].map(nomDe));
    for (const nom of noms.filter((n) => rendables.has(n))) {
      const chemin = join(dossier, nom);
      try {
        fichiers.retirer(chemin);
        retires.push(chemin);
      } catch {
        echecs.push(chemin);
      }
    }
  }
  if (lieux.clone !== undefined && retires.length > 0) {
    try {
      fichiers.elaguer(lieux.clone);
    } catch {
      echecs.push(lieux.clone);
    }
  }
  return { retires, echecs };
}
