// Un `main` rouge au hasard (un test lent sur un runner chargé, un process
// réel) gelait toute la cuisine jusqu'à ce qu'un humain relance (#2321) : la
// base retient tout merge d'une livraison qui court le même check (#2279).
// La station qui voit la base rouge relance d'abord, une fois, les jobs en
// échec de chaque run rouge ; tant que la relance est due ou tourne, ces checks
// ne retiennent rien. Une relance encore rouge retient comme avant (#2323).
//
// Une fois par run, même d'une station à l'autre et après un redémarrage :
// GitHub compte les tentatives d'un run, et seul un run terminé à sa première
// tentative se relance. Un run encore en cours (un job rouge tôt, les autres
// qui tournent) ne se relance pas encore : GitHub le refuserait ; il se relance
// au tour où il est fini. Une relance que GitHub refuse se retente au tour
// suivant, et ses checks retiennent d'ici là. Un check qui n'est pas un job de
// GitHub Actions ne se relance pas.
import type { Check } from "./events/pass.ts";
import { jobDuCheck } from "./github.ts";
import { LimiteGitHubAtteinte } from "./limite-github.ts";

type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
// Les checks Windows (jobs de runtime-windows et app-windows : « windows tests
// (n/8) », « windows app tests ») sont informatifs (#2087) : rouges sur main, ils
// ne retiennent rien, et la station ne les relance pas (#2323) — une relance de
// plus n'ajouterait qu'un run en échec, et un mail au chef.
export const estInformatif = (check: CheckDeLaBase) => /^windows\b/i.test(check.name ?? "");
// Le run de GitHub Actions d'un check rouge, ou undefined.
export const runRouge = (check: CheckDeLaBase) => (check.outcome === "red" && !estInformatif(check) ? jobDuCheck({ name: check.name ?? "", outcome: "red", conclusion: "failure", url: check.url ?? null })?.run : undefined);

export type GitHubDeLaRelance = {
  // La tentative en cours d'un run (1 tant que personne ne l'a relancé), et si
  // elle est finie.
  etatDuRun(run: number): Promise<{ tentative: number; termine: boolean }>;
  relancerLesEchecs(run: number): Promise<void>;
};

// Rend les checks de la base tels que la retenue doit les lire : les rouges
// d'un run dont la relance est due ou tourne sont en cours.
export type RelanceDeLaBase = (checks: CheckDeLaBase[]) => Promise<CheckDeLaBase[]>;

export function relanceDeLaBase(github: GitHubDeLaRelance, avertir: (texte: string) => void, nom: string): RelanceDeLaBase {
  // Les runs relancés par cette station : jamais une seconde fois, même quand
  // GitHub dit encore la première tentative juste après la relance.
  const relances = new Set<number>();
  // Les runs lus finis après une relance : rouges, ils retiennent, sans plus
  // d'appel.
  const juges = new Set<number>();
  // Les runs dont la relance a été refusée, dits une fois.
  const refus = new Set<number>();
  // Ce que vaut un run rouge pour ce tour : en cours, ou rouge.
  const lire = async (run: number): Promise<"pending" | "red"> => {
    if (juges.has(run)) return "red";
    try {
      const { tentative, termine } = await github.etatDuRun(run);
      if (termine && tentative > 1) {
        juges.add(run);
        return "red";
      }
      // Encore en cours — sa première tentative ou sa relance —, ou relancé à
      // l'instant sans que GitHub le dise encore : la relance est due ou tourne.
      if (!termine || relances.has(run)) return "pending";
      await github.relancerLesEchecs(run);
    } catch (erreur) {
      // GitHub qui limite ses appels arrête le tour, comme ailleurs.
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      if (!refus.has(run)) avertir(`brigade : base red on ${nom} — run ${run} not re-run yet, retried next turn: ${message(erreur)}`);
      refus.add(run);
      return "red";
    }
    relances.add(run);
    avertir(`brigade : base red on ${nom} — the failed jobs of run ${run} are re-run once before any merge is held`);
    return "pending";
  };
  return async (checks) => {
    const lus = new Map<number, "pending" | "red">();
    for (const check of checks) {
      const run = runRouge(check);
      if (run !== undefined && !lus.has(run)) lus.set(run, await lire(run));
    }
    return checks.map((check) => {
      const run = runRouge(check);
      return run !== undefined && lus.get(run) === "pending" ? { ...check, outcome: "pending" as const } : check;
    });
  };
}
