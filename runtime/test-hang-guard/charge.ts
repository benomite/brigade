// What machine load took from a test, as a number its duration can be judged against (#2463). The 2 s rule (#2129)
// measures a test's wall clock, which a saturated machine stretches: a healthy test then trips the guard for no reason.
// The signal is local to the test's own time window: a timer in the runner process is armed every PAS_MS, and how
// late it fires says how long the scheduler kept this machine from running us. A test that blocks or waits past the
// limit on a quiet machine sees on-time timers (factor 1) and is still caught; one that overlapped a real saturation
// sees late timers and is excused by what they measured, over its own window only, never by a run-wide worst case.
import { performance } from "node:perf_hooks";

export const PAS_MS = 50;
// A margin, not a pardon: past this factor the load no longer excuses a duration (a test 4× over is slow).
export const FACTEUR_MAX = 4;

// The stretch of one timer tick: elapsed time over the expected one, 1 when on time.
export const etirement = (ecoule: number, attendu: number = PAS_MS): number =>
  Number.isFinite(ecoule) && ecoule > attendu ? ecoule / attendu : 1;

export const facteurBorne = (f: number): number => (Number.isFinite(f) ? Math.min(FACTEUR_MAX, Math.max(1, f)) : 1);

// The duration a test owes to its own work: the measured one, minus what the load stretched.
export const dureeSansCharge = (ms: number, facteur: number): number => ms / Math.max(1, facteur);

// Ticks recorded with their end time; `facteurSur` averages the stretch of the ticks that ended in a window.
export class Releve {
  private readonly ticks: { fin: number; etirement: number }[] = [];
  private timer: NodeJS.Timeout | undefined;
  private readonly horloge: () => number;
  constructor(horloge: () => number = () => performance.now()) {
    this.horloge = horloge;
  }
  enregistre(fin: number, etirementDuTick: number): void {
    this.ticks.push({ fin, etirement: etirementDuTick });
  }
  // The mean stretch over the `dernieresMs` ending now; 1 with no tick in the window (no evidence, no relief).
  facteurSur(dernieresMs: number): number {
    const fin = this.horloge();
    const dans = this.ticks.filter((t) => t.fin > fin - dernieresMs && t.fin <= fin);
    if (dans.length === 0) return 1;
    return facteurBorne(dans.reduce((s, t) => s + t.etirement, 0) / dans.length);
  }
  demarre(): void {
    let dernier = this.horloge();
    this.timer = setInterval(() => {
      const maintenant = this.horloge();
      this.enregistre(maintenant, etirement(maintenant - dernier));
      dernier = maintenant;
    }, PAS_MS);
    this.timer.unref();
  }
  arrete(): void {
    clearInterval(this.timer);
  }
}
