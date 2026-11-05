// The machine's load, as a number a duration can be judged against (#2463). The 2 s rule (#2129) measures
// a test's wall clock, which a loaded machine stretches: a healthy test then trips the guard for no reason.
// The load is read from the OS run queue (`os.loadavg()` per core), which does not depend on the test's own
// work: a test that really blocks or waits past the limit on an idle machine is still caught (factor 1),
// and one that only ran slow because the machine was saturated gets the same margin the machine took from it.
import { availableParallelism, loadavg } from "node:os";

// A margin, not a pardon: past this factor the load no longer excuses a duration (a test 4× over is slow).
export const FACTEUR_MAX = 4;

export type Sonde = () => number;

// Run-queue length per core, 0 where the OS gives none (Windows): the factor is then 1, no relief.
export const sondeDeCharge: Sonde = () => loadavg()[0]! / Math.max(1, availableParallelism());

// 1 on an idle or lightly loaded machine; load per core above 1, up to FACTEUR_MAX.
export function facteurDeCharge(chargeParCoeur: number): number {
  return Number.isFinite(chargeParCoeur) ? Math.min(FACTEUR_MAX, Math.max(1, chargeParCoeur)) : 1;
}

// The duration a test owes to its own work: the measured one, minus what the load stretched.
export const dureeSansCharge = (ms: number, facteur: number): number => ms / Math.max(1, facteur);

// The worst factor seen across samples (the load can drop before the verdict, the test suffered the peak).
export class Observateur {
  private pire = 1;
  private readonly sonde: Sonde;
  constructor(sonde: Sonde = sondeDeCharge) {
    this.sonde = sonde;
  }
  echantillonne(): void {
    this.pire = Math.max(this.pire, facteurDeCharge(this.sonde()));
  }
  get facteur(): number {
    return this.pire;
  }
}
