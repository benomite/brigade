// Un `main` rouge au hasard (un test lent sur un runner chargé, un process
// réel) gelait toute la cuisine jusqu'à ce qu'un humain relance (#2321) : la
// base retient tout merge d'une livraison qui court le même check (#2279).
// La station qui voit la base rouge relance d'abord, une fois, les jobs en
// échec de chaque run rouge ; tant que la relance tourne, ces checks ne
// retiennent rien. Une relance encore rouge retient comme avant (#2323).
//
// Une fois par run, même d'une station à l'autre et après un redémarrage :
// GitHub compte les tentatives d'un run, et seul un run à sa première tentative
// se relance. Un check qui n'est pas un job de GitHub Actions ne se relance pas.
import type { Check } from "./events/pass.ts";
import { jobDuCheck } from "./github.ts";

type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
// Le run de GitHub Actions d'un check rouge, ou undefined.
const runRouge = (check: CheckDeLaBase) => (check.outcome === "red" ? jobDuCheck({ name: check.name ?? "", outcome: "red", conclusion: "failure", url: check.url ?? null })?.run : undefined);

export type GitHubDeLaRelance = {
  // La tentative en cours d'un run : 1 tant que personne ne l'a relancé.
  tentativeDuRun(run: number): Promise<number>;
  relancerLesEchecs(run: number): Promise<void>;
};

// Rend les checks de la base tels que la retenue doit les lire : les rouges
// d'un run relancé à l'instant sont en cours.
export type RelanceDeLaBase = (checks: CheckDeLaBase[]) => Promise<CheckDeLaBase[]>;

export function relanceDeLaBase(github: GitHubDeLaRelance, avertir: (texte: string) => void, nom: string): RelanceDeLaBase {
  // Les runs déjà jugés par cette station : ni relus, ni relancés.
  const vus = new Set<number>();
  return async (checks) => {
    const relances = new Set<number>();
    for (const check of checks) {
      const run = runRouge(check);
      if (run === undefined || vus.has(run)) continue;
      vus.add(run);
      try {
        if ((await github.tentativeDuRun(run)) > 1) continue;
        await github.relancerLesEchecs(run);
      } catch (erreur) {
        avertir(`brigade : base red on ${nom} — run ${run} not re-run: ${message(erreur)}`);
        continue;
      }
      relances.add(run);
      avertir(`brigade : base red on ${nom} — the failed jobs of run ${run} are re-run once before any merge is held`);
    }
    if (relances.size === 0) return checks;
    return checks.map((check) => {
      const run = runRouge(check);
      return run !== undefined && relances.has(run) ? { ...check, outcome: "pending" as const } : check;
    });
  };
}
