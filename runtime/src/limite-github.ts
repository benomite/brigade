// La limite d'appels que GitHub accorde au compte, tenue côté runtime : un
// budget par heure glissante, et l'attente de la fin de la fenêtre quand
// GitHub dit que la limite est atteinte. Un seul compte par machine : un seul
// limiteur par process, que le sondage des issues et le canal de la station
// partagent. Chaque process (la station, chaque projet) a le sien : le budget
// est celui d'un process, à régler en conséquence.

// Le budget visé, par heure, pour un process.
export const BUDGET_PAR_HEURE = 2_500;
const HEURE_MS = 3_600_000;
// À défaut de savoir quand la fenêtre se referme (limite secondaire, sans
// en-tête qui le dise).
const REPRISE_PAR_DEFAUT_MS = 60_000;

export type Limite = {
  // Un appel part : il est compté.
  compter(): void;
  // Les appels comptés sur l'heure écoulée.
  appels(): number;
  // Jusqu'à quel instant (ms) ne plus appeler GitHub ; null s'il n'y a pas à attendre.
  repriseA(): number | null;
  // GitHub a refusé pour limite atteinte ; `resetS` : la fin de sa fenêtre, en secondes epoch, s'il la dit.
  atteinte(resetS: number | null): void;
  // Le message qui dit l'attente, pour qui doit s'en expliquer.
  dire(): string | null;
};

const heure = (instant: number) => new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function ouvrirLimite(options: { budget?: number; maintenant?: () => number } = {}): Limite {
  const budget = options.budget ?? BUDGET_PAR_HEURE;
  const maintenant = options.maintenant ?? Date.now;
  let instants: number[] = [];
  let pause: number | null = null;

  const elaguer = () => {
    const limite = maintenant() - HEURE_MS;
    instants = instants.filter((instant) => instant > limite);
  };
  const repriseA = (): number | null => {
    const now = maintenant();
    if (pause !== null && pause <= now) pause = null;
    elaguer();
    // Budget épuisé : l'attente dure jusqu'à ce que le plus ancien appel compté sorte de l'heure.
    const budgetEpuise = instants.length >= budget ? (instants[instants.length - budget] ?? now) + HEURE_MS : null;
    const reprise = Math.max(pause ?? 0, budgetEpuise ?? 0);
    return reprise > now ? reprise : null;
  };

  return {
    compter: () => void instants.push(maintenant()),
    appels: () => (elaguer(), instants.length),
    repriseA,
    atteinte(resetS) {
      const now = maintenant();
      const fin = resetS !== null && Number.isFinite(resetS) && resetS * 1000 > now ? resetS * 1000 : now + REPRISE_PAR_DEFAUT_MS;
      pause = Math.max(pause ?? 0, fin);
    },
    dire() {
      const reprise = repriseA();
      return reprise === null ? null : `GitHub limite les appels, reprise vers ${heure(reprise)}`;
    },
  };
}

export const limiteDuCompte: Limite = ouvrirLimite();

// Cette erreur de `gh` dit-elle que la limite est atteinte ? 429, ou 403 avec
// « rate limit » (primaire ou secondaire).
export function estLimite(statut: number, texte: string): boolean {
  return statut === 429 || (statut === 403 && /rate limit|abuse/i.test(texte));
}

export class LimiteAtteinte extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimiteAtteinte";
  }
}
