// Les gestes git de la station sur le dépôt du projet. Son clone ne sert que
// de souche : elle y rapatrie la base et y accroche des worktrees, jamais elle
// n'y change de branche ni n'y écrit un fichier. Seul module qui lance `git`.
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { ConfigInvalide } from "./runtime.ts";

export type Depot = {
  // Rapatrie la base depuis l'origine et crée le worktree du run, sur une
  // branche neuve qui en part.
  preparer(run: string): Promise<{ worktree: string; branche: string }>;
  // Défait ce que `preparer` a fait : le worktree et sa branche. Pour un
  // worktree où aucun cook n'est entré.
  retirer(worktree: string, branche: string): void;
  // Le nombre de commits que le worktree porte en plus de la base.
  commits(worktree: string): number;
  // Pousse la branche du cook sur l'origine. Bloquant : c'est de son succès
  // que dépend la fin du cook.
  pousser(branche: string): void;
  // Vrai si le worktree est encore là. Il peut ne plus l'être : une
  // restauration ne rend pas les worktrees, et un `git worktree remove` à la
  // main l'emporte.
  present(worktree: string): boolean;
  // Le commit sur lequel le worktree est posé.
  tete(worktree: string): string;
  // Vrai si aucun fichier suivi n'y est modifié : ce qui s'y joue est alors ce
  // qui est commité.
  propre(worktree: string): boolean;
  // Vrai s'il ne porte rien d'autre que ce qui est commité : ni fichier suivi
  // modifié, ni fichier neuf que le projet n'ignore pas. C'est ce qui sépare
  // un ticket sans diff d'un travail que le cook a oublié de commiter.
  intact(worktree: string): boolean;
  // Les fichiers que le worktree change par rapport à la base.
  changes(worktree: string): string[];
  // Le diff de ce que le worktree a commité par rapport à la base : ce que le
  // reviewer relit.
  diff(worktree: string): string;
  // Ce que le worktree porte à cet instant, réduit à une chaîne : elle ne
  // change que s'il a progressé — un commit, un fichier touché. Ce que le
  // projet ignore (dépendances, logs, builds) n'y entre pas.
  empreinte(worktree: string): string;
  // Les fichiers suivis de la base, telle que le clone la connaît depuis son
  // dernier rapatriement.
  fichiers(): string[];
};

export type OptionsDepot = {
  // Le clone du dépôt du projet, réservé à la station.
  clone: string;
  // La branche d'intégration : d'où partent les worktrees.
  base: string;
  // Le répertoire où vivent les worktrees des cooks.
  worktrees: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
};

const DELAI_MS = 120_000;

// Le poids et la date d'un fichier : réécrire un fichier déjà modifié ne change
// pas sa ligne de statut, mais c'est un progrès.
const trace = (chemin: string): string => {
  try {
    const { size, mtimeMs } = lstatSync(chemin);
    return `${size}@${mtimeMs}`;
  } catch {
    return "absent";
  }
};

const motif = (geste: string, erreur: unknown): Error => {
  const { stderr, message } = erreur as { stderr?: string | Buffer; message?: string };
  return new Error(`${geste} : ${String(stderr ?? "").trim() || message || "échec"}`);
};

export function ouvrirDepot(options: OptionsDepot): Depot {
  const { clone, base } = options;
  // `git` tourne dans le clone : un chemin relatif s'y résoudrait contre lui,
  // alors que le runtime — qui lance le cook dans ce worktree — le lit depuis
  // son propre répertoire.
  const worktrees = resolve(options.worktrees);
  const reglages = { cwd: clone, env: options.env, timeout: DELAI_MS, encoding: "utf8" } as const;
  const git = (...args: string[]): string => execFileSync("git", args, { ...reglages, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const gitAsync = (...args: string[]) =>
    new Promise<void>((resoudre, rejeter) => {
      execFile("git", args, reglages, (erreur, _stdout, stderr) => (erreur ? rejeter(motif(`git ${args[0]}`, { stderr, message: erreur.message })) : resoudre()));
    });

  try {
    git("rev-parse", "--git-dir");
  } catch {
    throw new ConfigInvalide(`BRIGADE_REPO_DIR invalide : « ${clone} » n'est pas un dépôt git — attendu un clone du dépôt du projet, réservé à la station`);
  }

  // Un seul clone pour tous les cooks : deux rapatriements de la même base, ou
  // deux `git worktree add`, s'y disputent les mêmes verrous. Les préparations
  // passent une par une.
  let file: Promise<unknown> = Promise.resolve();
  const aSonTour = <T>(faire: () => Promise<T>): Promise<T> => {
    const tour = file.then(faire, faire);
    file = tour.catch(() => {});
    return tour;
  };

  return {
    preparer: (run) =>
      aSonTour(async () => {
        const worktree = join(worktrees, run);
        const branche = `cook/${run}`;
        await gitAsync("fetch", "--quiet", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`);
        await gitAsync("worktree", "add", "--quiet", "-b", branche, worktree, `origin/${base}`);
        return { worktree, branche };
      }),
    retirer(worktree, branche) {
      git("worktree", "remove", "--force", worktree);
      git("branch", "--quiet", "-D", branche);
    },
    commits(worktree) {
      return Number(git("-C", worktree, "rev-list", "--count", `origin/${base}..HEAD`));
    },
    pousser(branche) {
      try {
        // Forcé : la branche d'un cook n'appartient qu'à la station, et un
        // renvoi peut l'avoir rebasée sur la base.
        git("push", "--quiet", "origin", `+refs/heads/${branche}:refs/heads/${branche}`);
      } catch (erreur) {
        throw motif("git push", erreur);
      }
    },
    // Un worktree se reconnaît à son `.git` : un répertoire resté vide après
    // un retrait n'en est pas un.
    present: (worktree) => existsSync(join(worktree, ".git")),
    tete: (worktree) => git("-C", worktree, "rev-parse", "HEAD"),
    propre: (worktree) => git("-C", worktree, "status", "--porcelain", "--untracked-files=no") === "",
    intact: (worktree) => git("-C", worktree, "status", "--porcelain", "--untracked-files=normal") === "",
    // Sans détection des renommages : un fichier déplacé doit se lire aussi à
    // son ancien chemin, sinon sortir un juge de son répertoire passerait
    // pour ne pas y avoir touché.
    // `-z` : un chemin non ASCII tel qu'il s'écrit, pas entre guillemets et
    // en octal — il se compare à une zone.
    changes: (worktree) => git("-C", worktree, "diff", "--name-only", "--no-renames", "-z", `origin/${base}...HEAD`).split("\0").filter(Boolean),
    // Sans plafond de sortie : c'est le reviewer qui borne ce qu'il en lit.
    diff: (worktree) =>
      execFileSync("git", ["-C", worktree, "diff", "--no-renames", "--no-color", "--no-ext-diff", `origin/${base}...HEAD`], {
        ...reglages,
        maxBuffer: Infinity,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    // Sans plafond de sortie, et `-z` : un grand dépôt se lit en entier, et un
    // chemin non ASCII tel qu'il s'écrit.
    fichiers: () =>
      execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", `origin/${base}`], { ...reglages, maxBuffer: Infinity, stdio: ["ignore", "pipe", "pipe"] })
        .split("\0")
        .filter(Boolean),
    empreinte(worktree) {
      // Sans verrou : un `status` ordinaire rafraîchit l'index, et le cook qui
      // commiterait au même instant buterait sur `index.lock`. Sans plafond de
      // sortie : un worktree chargé de fichiers neufs (des dépendances pas
      // encore ignorées) est celui d'un cook qui écrit, pas un worktree illisible.
      const statut = execFileSync("git", ["--no-optional-locks", "-C", worktree, "status", "--porcelain", "-z", "--untracked-files=all"], {
        ...reglages,
        maxBuffer: Infinity,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const empreinte = createHash("sha256").update(git("-C", worktree, "rev-parse", "HEAD")).update(statut);
      const lignes = statut.split("\0");
      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i] ?? "";
        if (ligne === "") continue;
        empreinte.update(trace(join(worktree, ligne.slice(3))));
        // Un renommage tient sur deux entrées : la seconde est l'ancien chemin.
        if ("RC".includes(ligne.charAt(0))) i++;
      }
      return empreinte.digest("hex");
    },
  };
}
