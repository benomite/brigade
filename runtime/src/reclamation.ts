// Ce que la brigade a laissé derrière ses cooks, rendu à la machine quand la
// porte de prise la voit saturée sans aucun cook vivant (#4089) : worktrees
// rangés et propres, flux de runs, répertoires temporaires privés, cache npm.
// Rien n'est touché de ce qui a moins d'une heure : un cook qui part ou une
// relecture en cours y vit peut-être. Ce qui porte du travail — worktree sale,
// ou dont la tête n'est sur aucune branche distante — reste : `git worktree
// remove` sans `--force` le refuse de lui-même.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worktreesDuProjet } from "./depot.ts";

// En deçà, un reste n'en est peut-être pas un.
const LAISSE_MS = 3_600_000;
const DELAI_MS = 120_000;
// Les worktrees jetables de la pass (`depot.ts`) ne sont pas ceux des cooks.
const ESSAIS = ".essais";
const SANS_COMMANDE = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];

export type LieuxARecuperer = {
  // Le répertoire des worktrees des cooks, et le clone dont ils dépendent.
  worktrees: string;
  clone: string;
  // Les flux des runs (`<état>/runs`).
  runs: string;
  // Les répertoires temporaires privés de la brigade : on n'y retire que les entrées anciennes.
  temporaires: string[];
  // Le cache npm : vidé par `npm cache clean`.
  cacheNpm: boolean;
};

export type OptionsDeLaReclamation = {
  maintenant?: () => number;
  // Joue une commande ; lève si elle échoue. Doublée par les tests.
  jouer?: (commande: string, args: string[], cwd: string) => string;
};

const jouerVraiment = (commande: string, args: string[], cwd: string): string =>
  execFileSync(commande, args, { cwd, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const entrees = (repertoire: string): string[] => {
  try {
    return readdirSync(repertoire);
  } catch {
    return [];
  }
};

const ancien = (chemin: string, instant: number): boolean => {
  try {
    return instant - statSync(chemin).mtimeMs >= LAISSE_MS;
  } catch {
    return false;
  }
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Rend ce que la brigade a laissé. À n'appeler que quand aucun cook ne vit.
// Rend ce qu'elle a retiré, une ligne chacun, et ce qu'elle n'a pas pu retirer
// dans `echecs` : un reste qui résiste n'arrête pas les autres.
export function reclamerLesRestes(lieux: LieuxARecuperer, options: OptionsDeLaReclamation = {}): { retires: string[]; echecs: string[] } {
  const instant = (options.maintenant ?? Date.now)();
  const jouer = options.jouer ?? jouerVraiment;
  const retires: string[] = [];
  const echecs: string[] = [];

  for (const nom of entrees(lieux.worktrees)) {
    const worktree = join(lieux.worktrees, nom);
    if (nom === ESSAIS || !ancien(worktree, instant)) continue;
    try {
      // Sa tête doit être sur une branche distante : sinon il porte du travail non poussé.
      if (jouer("git", [...SANS_COMMANDE, "branch", "-r", "--contains", "HEAD"], worktree).trim() === "") continue;
      jouer("git", [...SANS_COMMANDE, "worktree", "remove", worktree], lieux.clone);
      retires.push(`worktree ${worktree}`);
    } catch (erreur) {
      echecs.push(`worktree ${worktree} kept — ${message(erreur)}`);
    }
  }

  for (const [repertoire, filtre] of [[lieux.runs, (nom: string) => nom.endsWith(".jsonl")], ...lieux.temporaires.map((t) => [t, () => true] as const)] as const) {
    for (const nom of entrees(repertoire)) {
      const chemin = join(repertoire, nom);
      if (!filtre(nom) || !ancien(chemin, instant)) continue;
      try {
        rmSync(chemin, { recursive: true, force: true });
        retires.push(chemin);
      } catch (erreur) {
        echecs.push(`${chemin} kept — ${message(erreur)}`);
      }
    }
  }

  if (lieux.cacheNpm) {
    try {
      jouer("npm", ["cache", "clean", "--force"], lieux.clone);
      retires.push("npm cache");
    } catch (erreur) {
      echecs.push(`npm cache kept — ${message(erreur)}`);
    }
  }
  return { retires, echecs };
}

// Les lieux d'une station : ses worktrees, ses flux, le répertoire privé de
// `claude` (`claude-<uid>`, sous `CLAUDE_CODE_TMPDIR` ou `/tmp`) et le cache npm.
export function lieuxARecuperer({ env, repertoireEtat, clone }: { env: NodeJS.ProcessEnv; repertoireEtat: string; clone: string }): LieuxARecuperer {
  return {
    worktrees: worktreesDuProjet(env, repertoireEtat),
    clone,
    runs: join(repertoireEtat, "runs"),
    temporaires: [join(env.CLAUDE_CODE_TMPDIR || tmpdir(), `claude-${process.getuid?.() ?? 0}`)],
    cacheNpm: true,
  };
}
