// Une retenue que la cuisine lève seule n'alerte pas tout de suite (#2283) :
// quand le diagnostic dit « base rouge », les jobs en échec de la base sont
// relancés une fois, et la ligne de la file du chef comme l'alerte Telegram
// (toutes deux filles du fait `kitchen.held`) ne partent que si la base est
// encore rouge après cette relance. Les autres causes (disjoncteur, limite de
// GitHub, budget des écritures, inconnue) ne relancent rien.
//
// Une fois par retenue : la porte retient ce qu'elle a décidé de chaque retenue
// (sa clé de cause) tant que le détecteur la voit, et ne relance jamais une
// seconde fois. Elle ne bloque pas la boucle : la relance tourne à côté, et la
// retenue est tue d'ici là ; `surFin` réveille la boucle quand elle a rendu son
// verdict.
//
// La relance s'appuie sur le GitHub déjà là (github.ts : `relancerLesEchecs`,
// `etatDuRun`). Un check qui n'est pas un job de GitHub Actions ne se relance
// pas : la base reste rouge pour lui.
import type { Check } from "../events/pass.ts";
import { jobDuCheck } from "../github.ts";
import { cleDeCause, type Retenue } from "./retenue.ts";

type CheckLu = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

export type GitHubDeLaRelanceDeLaBase = {
  checksDeLaBase(): Promise<CheckLu[]>;
  etatDuRun(run: number): Promise<{ tentative: number; termine: boolean }>;
  relancerLesEchecs(run: number): Promise<void>;
};

export const ATTENTE_DE_LA_RELANCE_MS = 30_000;
// Au bout de ce nombre de lectures sans verdict, la relance est tenue pour
// perdue : la retenue alerte comme si la base était restée rouge.
export const LECTURES_DE_LA_RELANCE = 120;

export type OptionsRelance = {
  avertir?: (ligne: string) => void;
  // Réveille la boucle : la relance a rendu son verdict.
  surFin?: () => void;
  // Attend entre deux lectures de la relance ; le test la rend immédiate.
  pause?: (ms: number) => Promise<void>;
};

export type PorteDeLaRelance = {
  // La retenue à annoncer : celle-ci, ou null tant que la relance tourne ou
  // si elle a levé la base rouge. `brute` : ce que le diagnostic a rendu.
  filtrer(brute: Retenue | null): Retenue | null;
};

const rouges = (checks: CheckLu[]) => checks.filter(({ outcome }) => outcome === "red");
const runDe = (check: CheckLu) => jobDuCheck({ name: check.name ?? "", outcome: "red", conclusion: "failure", url: check.url ?? null })?.run;

export function relanceDeLaRetenue(github: GitHubDeLaRelanceDeLaBase, options: OptionsRelance = {}): PorteDeLaRelance {
  const avertir = options.avertir ?? (() => {});
  const pause = options.pause ?? ((ms: number) => new Promise<void>((fin) => setTimeout(fin, ms)));
  // Par retenue vue : la relance tourne, la base est restée rouge, ou elle est levée.
  const etats = new Map<string, "en-cours" | "rouge" | "levee">();

  // Relance une fois les runs rouges de la base, attend qu'ils finissent, dit
  // si la base est encore rouge.
  const relancer = async (): Promise<boolean> => {
    const encore = rouges(await github.checksDeLaBase());
    if (encore.length === 0) return false;
    const runs = [...new Set(encore.map(runDe))];
    if (runs.some((run) => run === undefined)) return true;
    const aSuivre: number[] = [];
    for (const run of runs as number[]) {
      const { termine } = await github.etatDuRun(run);
      // Un run encore en cours ne se relance pas : GitHub le refuserait.
      if (!termine) {
        aSuivre.push(run);
        continue;
      }
      await github.relancerLesEchecs(run);
      aSuivre.push(run);
    }
    avertir(`brigade : base red — the failed jobs of run ${aSuivre.join(", ")} are re-run once before the hold alerts`);
    for (let lecture = 0; lecture < LECTURES_DE_LA_RELANCE; lecture++) {
      await pause(ATTENTE_DE_LA_RELANCE_MS);
      const etats = await Promise.all(aSuivre.map((run) => github.etatDuRun(run)));
      if (etats.every(({ termine, tentative }) => termine && tentative > 1)) return rouges(await github.checksDeLaBase()).length > 0;
    }
    return true;
  };

  return {
    filtrer: (brute) => {
      if (brute === null) {
        // Le détecteur ne voit plus de retenue : la prochaine est une autre.
        etats.clear();
        return null;
      }
      if (brute.cause.kind !== "base-red") return brute;
      const cle = cleDeCause(brute.cause);
      const etat = etats.get(cle);
      if (etat === "rouge") return brute;
      if (etat !== undefined) return null;
      etats.set(cle, "en-cours");
      relancer()
        .then((rouge) => {
          if (etats.get(cle) === "en-cours") etats.set(cle, rouge ? "rouge" : "levee");
        })
        // Une relance qui échoue ne retient pas l'alerte.
        .catch((erreur) => {
          avertir(`brigade : base red — re-run failed, the hold alerts: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
          if (etats.get(cle) === "en-cours") etats.set(cle, "rouge");
        })
        .finally(() => options.surFin?.());
      return null;
    },
  };
}
