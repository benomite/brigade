// Ce que les cooks partis ont laissé dans l'état de la cuisine, rendu quand la
// machine sature sans cook en vol : les processus de test qu'ils ont laissés
// orphelins (#4108), leur worktree, le flux de leur run et leur dossier
// temporaire privé (`<état>/tmp/<run>`), puis le cache npm de la station
// (`cacheNpm`, que npm refait au besoin). Seuls
// les runs que le journal dit finis, toutes stations confondues, sont rendus :
// le worktree d'un cook en vol d'une autre station, d'une relecture ou de gates
// que le journal ne connaît pas reste où il est. Rien hors du répertoire des
// worktrees du projet, des dossiers `runs` et `tmp` de son état et du cache npm
// nommé n'est touché.
import { execFileSync } from "../../sans-invite.ts";
import { readdirSync, readlinkSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join, sep } from "node:path";

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

// Ce que la récupération demande aux processus : ceux de la machine, avec leur
// dossier de travail (null s'il ne se lit pas), et l'arrêt de l'un d'eux.
export type Processus = {
  lister(): { pid: number; cwd: string | null }[];
  tuer(pid: number): void;
};

// Lire le dossier de travail d'un processus passe par `/proc` : ailleurs, aucun n'est vu.
const processusReels: Processus = {
  lister: () => {
    let noms: string[];
    try {
      noms = readdirSync("/proc");
    } catch {
      return [];
    }
    return noms
      .filter((nom) => /^\d+$/.test(nom))
      .map((nom) => {
        try {
          return { pid: Number(nom), cwd: readlinkSync(`/proc/${nom}/cwd`) };
        } catch {
          return { pid: Number(nom), cwd: null };
        }
      });
  },
  tuer: (pid) => {
    try {
      process.kill(pid, "SIGKILL");
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== "ESRCH") throw erreur;
    }
  },
};

type Recuperation = { retires: string[]; echecs: string[]; tues: number[] };

const NOMS_DU_CACHE = [".npm", "_cacache"];

const absent = (erreur: unknown) => (erreur as NodeJS.ErrnoException).code === "ENOENT";

// Arrête d'abord les processus dont le dossier de travail est dans le worktree
// d'un run fini : un cook en vol n'y figure pas, un processus d'ailleurs non plus.
// Retire ensuite le worktree `<run>`, le flux `<run>.jsonl` et le dossier `tmp/<run>`
// de chaque run fini, puis fait oublier au clone ses worktrees disparus (sinon leur
// branche resterait prise). Un dossier absent ne porte rien ; tout autre échec —
// lecture, retrait — se dit dans `echecs`, sans arrêter le reste.
export function recuperer(lieux: { worktrees: string; repertoireEtat: string; clone?: string; finis: string[]; cacheNpm?: string }, fichiers: Fichiers = fichiersReels, processus: Processus = processusReels): Recuperation {
  const retires: string[] = [];
  const echecs: string[] = [];
  const tues: number[] = [];
  const finis = new Set(lieux.finis);
  const orphelins = [...finis].map((run) => join(lieux.worktrees, run));
  try {
    for (const { pid, cwd } of processus.lister()) {
      if (pid === process.pid || cwd === null || !orphelins.some((dossier) => cwd === dossier || cwd.startsWith(dossier + sep))) continue;
      try {
        processus.tuer(pid);
        tues.push(pid);
      } catch {
        echecs.push(`pid ${pid}`);
      }
    }
  } catch {
    echecs.push("processes");
  }
  for (const [dossier, nomDe] of [
    [lieux.worktrees, (run: string) => run],
    [join(lieux.repertoireEtat, "runs"), (run: string) => `${run}.jsonl`],
    [join(lieux.repertoireEtat, "tmp"), (run: string) => run],
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
  // Le cache npm : un chemin absolu nommé `.npm` ou `_cacache`, retiré s'il existe ;
  // un réglage qui pointe ailleurs (`/home`, `/tmp`) n'est jamais touché.
  const cache = lieux.cacheNpm;
  if (cache !== undefined && isAbsolute(cache) && NOMS_DU_CACHE.includes(basename(cache))) {
    try {
      if (fichiers.lister(dirname(cache)).includes(basename(cache))) {
        fichiers.retirer(cache);
        retires.push(cache);
      }
    } catch (erreur) {
      if (!absent(erreur)) echecs.push(cache);
    }
  }
  if (lieux.clone !== undefined && retires.length > 0) {
    try {
      fichiers.elaguer(lieux.clone);
    } catch {
      echecs.push(lieux.clone);
    }
  }
  return { retires, echecs, tues };
}
