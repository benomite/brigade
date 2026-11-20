// Un `main` rouge au hasard (un test lent sur un runner chargé, un process
// réel) gelait toute la cuisine jusqu'à ce qu'un humain relance (#2321) : la
// base retient tout merge d'une livraison qui court le même check (#2279).
// La station qui voit la base rouge relance d'abord, une fois, les jobs en
// échec ; tant que la relance est due ou tourne, ces checks se lisent en cours,
// et aucun ticket de réparation ne s'ouvre. Une relance encore rouge ouvre la
// réparation comme avant (#2323, #2339).
//
// Pendant la relance, la base n'est pas verte : ses checks relancés portent
// `relance`, et retiennent les merges comme un rouge (#3898). La relance finie,
// verte, ils ne retiennent plus rien ; rouge, la réparation s'ouvre, et elle
// seule se merge.
//
// Une fois par commit (#3898) : les runs rouges d'un commit au tour où son
// rouge est vu se relancent ensemble ; un rouge qui vient ensuite sur ce même
// commit — un autre run fini plus tard, ou la relance encore rouge — ne se
// relance pas. Une fois par run, même d'une station à l'autre et après un
// redémarrage : GitHub compte les tentatives d'un run, seul un run terminé à sa
// première tentative se relance, et un run lu relancé marque son commit. Un run
// encore en cours (un job rouge tôt, les autres qui tournent) ne se relance pas
// encore : GitHub le refuserait ; il se relance au tour où il est fini. Une
// relance que GitHub refuse se retente au tour suivant, et ses checks retiennent
// d'ici là. Un check qui n'est pas un job de GitHub Actions ne se relance pas.
import type { Check } from "./events/pass.ts";
import { jobDuCheck } from "./github.ts";
import { LimiteGitHubAtteinte } from "./limite-github.ts";

type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;
// Un check de la base tel que la relance le rend : `relance`, son run est à
// relancer ou relancé, et il se lit en cours.
export type CheckRelu = CheckDeLaBase & { relance?: true };
// Un check de la base qui retient le merge d'une livraison qui le court :
// rouge, ou relancé (#3898).
export const retientLesMerges = (check: CheckRelu): boolean => check.outcome === "red" || check.relance === true;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
// Les checks Windows (jobs de runtime-windows et app-windows : « windows tests
// (n/8) », « windows app tests ») sont informatifs (#2087) : rouges sur main, ils
// ne retiennent rien, et la station ne les relance pas (#2323) — une relance de
// plus n'ajouterait qu'un run en échec, et un mail au chef. Rien qu'eux : le job
// `windows` de publier-app, qui construit l'installeur de la release, n'en est
// pas un — pris pour l'un d'eux, son échec d'un run sur 3089298 n'a jamais été
// relancé, et a ouvert une réparation de `main` (#3796).
export const estInformatif = (check: CheckDeLaBase) => /^windows (app )?tests\b/i.test(check.name ?? "");
// Le run de GitHub Actions d'un check rouge, ou undefined.
export const runRouge = (check: CheckDeLaBase) => (check.outcome === "red" && !estInformatif(check) ? jobDuCheck({ name: check.name ?? "", outcome: "red", conclusion: "failure", url: check.url ?? null })?.run : undefined);

export type GitHubDeLaRelance = {
  // La tentative en cours d'un run (1 tant que personne ne l'a relancé), si
  // elle est finie, et le commit qu'il juge. Sans commit, le run se relance
  // une fois, sans regarder les autres runs de son commit.
  etatDuRun(run: number): Promise<{ tentative: number; termine: boolean; commit?: string }>;
  relancerLesEchecs(run: number): Promise<void>;
};

// Rend les checks de la base tels que la retenue doit les lire : les rouges
// d'un run dont la relance est due ou tourne sont en cours, et portent `relance`.
export type RelanceDeLaBase = (checks: CheckDeLaBase[]) => Promise<CheckRelu[]>;

export function relanceDeLaBase(github: GitHubDeLaRelance, avertir: (texte: string) => void, nom: string): RelanceDeLaBase {
  // Les runs relancés par cette station : jamais une seconde fois, même quand
  // GitHub dit encore la première tentative juste après la relance.
  const relances = new Set<number>();
  // Les runs lus finis après une relance, ou rouges sur un commit déjà
  // relancé : rouges, ils retiennent, sans plus d'appel.
  const juges = new Set<number>();
  // Les runs dont la relance a été refusée, dits une fois.
  const refus = new Set<number>();
  // Les commits dont un run a été relancé — par cette station, au tour noté,
  // ou lu relancé (0) : aucun autre tour n'y relance plus rien (#3898).
  const commits = new Map<string, number>();
  let tour = 0;
  // Ce que vaut un run rouge pour ce tour : en cours, ou rouge.
  const lire = async (run: number): Promise<"pending" | "red"> => {
    if (juges.has(run)) return "red";
    try {
      const { tentative, termine, commit } = await github.etatDuRun(run);
      if (termine && tentative > 1) {
        juges.add(run);
        if (commit !== undefined && !commits.has(commit)) commits.set(commit, 0);
        return "red";
      }
      // Encore en cours — sa première tentative ou sa relance —, ou relancé à
      // l'instant sans que GitHub le dise encore : la relance est due ou tourne.
      if (!termine || relances.has(run)) return "pending";
      // Un rouge de plus sur un commit déjà relancé à un autre tour ne se
      // relance pas : il ouvre la réparation.
      const relanceDuCommit = commit === undefined ? undefined : commits.get(commit);
      if (relanceDuCommit !== undefined && relanceDuCommit !== tour) {
        juges.add(run);
        avertir(`brigade : base red on ${nom} — run ${run} is red on ${(commit ?? "").slice(0, 7)}, whose failed jobs were already re-run once: not re-run again`);
        return "red";
      }
      await github.relancerLesEchecs(run);
      if (commit !== undefined) commits.set(commit, tour);
    } catch (erreur) {
      // GitHub qui limite ses appels arrête le tour, comme ailleurs.
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      if (!refus.has(run)) avertir(`brigade : base red on ${nom} — run ${run} not re-run yet, retried next turn: ${message(erreur)}`);
      refus.add(run);
      return "red";
    }
    relances.add(run);
    avertir(`brigade : base red on ${nom} — the failed jobs of run ${run} are re-run once before a repair ticket is opened; merges wait for the re-run`);
    return "pending";
  };
  // Les checks dont la relance tourne, par leur nom, avec leur run : GitHub les
  // rend en cours, souvent sans leur lien (la lecture GraphQL ne garde que
  // celui d'un rouge). Ils portent `relance` jusqu'à ce qu'ils concluent.
  const enRelance = new Map<string, number>();
  return async (checks) => {
    tour += 1;
    const lus = new Map<number, "pending" | "red">();
    for (const check of checks) {
      const run = runRouge(check);
      if (run !== undefined && !lus.has(run)) lus.set(run, await lire(run));
    }
    return checks.map((check) => {
      const run = runRouge(check);
      if (run !== undefined && lus.get(run) === "pending") {
        if (check.name !== undefined) enRelance.set(check.name, run);
        return { ...check, outcome: "pending" as const, relance: true as const };
      }
      if (check.name === undefined) return check;
      // En cours sur le run relancé, ou sans lien qui dise un autre run : la relance tourne.
      const sien = jobDuCheck({ name: check.name, outcome: check.outcome, conclusion: "", url: check.url ?? null })?.run;
      if (check.outcome === "pending" && enRelance.has(check.name) && (sien === undefined || sien === enRelance.get(check.name))) return { ...check, relance: true as const };
      enRelance.delete(check.name);
      return check;
    });
  };
}
