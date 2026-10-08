// Les gestes git de la station sur le dépôt du projet. Son clone ne sert que
// de souche : elle y rapatrie la base et y accroche des worktrees, jamais elle
// n'y change de branche ni n'y écrit un fichier. Seul module qui lance `git`.
import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { ConfigInvalide } from "./runtime.ts";

export type Depot = {
  // Rapatrie la base depuis l'origine et crée le worktree du run, sur une
  // branche neuve qui en part.
  preparer(run: string): Promise<{ worktree: string; branche: string }>;
  // Le nombre de commits que le worktree porte en plus de la base.
  commits(worktree: string): number;
  // Pousse la branche du cook sur l'origine. Bloquant : c'est de son succès
  // que dépend la fin du cook.
  pousser(branche: string): void;
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

const motif = (geste: string, erreur: unknown): Error => {
  const { stderr, message } = erreur as { stderr?: string | Buffer; message?: string };
  return new Error(`${geste} : ${String(stderr ?? "").trim() || message || "échec"}`);
};

export function ouvrirDepot(options: OptionsDepot): Depot {
  const { clone, base, worktrees } = options;
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

  return {
    async preparer(run) {
      const worktree = join(worktrees, run);
      const branche = `cook/${run}`;
      await gitAsync("fetch", "--quiet", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`);
      await gitAsync("worktree", "add", "--quiet", "-b", branche, worktree, `origin/${base}`);
      return { worktree, branche };
    },
    commits(worktree) {
      return Number(git("-C", worktree, "rev-list", "--count", `origin/${base}..HEAD`));
    },
    pousser(branche) {
      try {
        git("push", "--quiet", "origin", `refs/heads/${branche}:refs/heads/${branche}`);
      } catch (erreur) {
        throw motif("git push", erreur);
      }
    },
  };
}
