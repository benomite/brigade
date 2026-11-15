// La mise en veille de l'ordinateur, vue du runtime (#3643). Un Mac qui dort
// dix minutes en pleine cuisson ne dit rien au process : au réveil, ses
// minuteries tombent toutes en retard, et la minuterie d'inactivité d'un cook
// croit qu'il s'est tu dix minutes (`guard.tripped reason idle observed
// 619537`, le 2026-11-15). Le sommeil n'est pas un silence du cook : c'est une
// pause, que les garde-fous retranchent de ce qu'ils mesurent.
//
// Le sommeil se voit à une minuterie courte qui arrive en retard : entre deux
// coups, l'horloge murale (et, selon la machine, l'horloge monotone) a avancé
// bien plus que la période. Tout l'intervalle depuis le coup d'avant est tenu
// pour du sommeil : il déborde d'une période au plus, et une inactivité réelle
// n'en est retardée que d'autant.
//
// Rien n'est écrit ici : ceux qui écoutent le réveil le disent au journal.

// Les deux horloges du process. `mono` : celle que mesurent les garde-fous
// (`performance.now()`) ; `mur` : l'heure murale (`Date.now()`).
type Horloges = { mono(): number; mur(): number };

// Un sommeil : où il commence et finit, à chacune des horloges, et sa durée,
// la plus longue des deux.
type Sommeil = { debutMono: number; finMono: number; debutMur: number; finMur: number; gapMs: number };

export type VeilleMachine = {
  // L'instant, à l'horloge monotone : celle dont les autres mesures partent.
  maintenant(): number;
  // Regarde sur-le-champ si la machine a dormi depuis le dernier coup — sans
  // attendre le prochain : une minuterie en retard peut tomber avant lui.
  regarder(): void;
  // Le temps dormi depuis `depuis` (horloge monotone), jusqu'à maintenant.
  dormiDepuis(depuis: number): number;
  // Le sommeil qui a coupé la vie d'un process né à `depuis`, si la machine
  // s'en est réveillée il y a moins de `fenetreMs` : ce qui en meurt est mort
  // en dormant. Null sinon.
  reveilRecent(depuis: number, fenetreMs: number): Sommeil | null;
  // Appelé à chaque réveil, une fois le sommeil noté.
  surReveil(ecouter: (sommeil: Sommeil) => void): () => void;
  arreter(): void;
};

// La période de la minuterie qui guette le sommeil, et le retard au-delà
// duquel la machine a dormi : bien plus qu'un tour de boucle chargé, bien
// moins que l'inactivité permise à un cook (dix minutes par défaut).
const PERIODE_MS = 5_000;
const SEUIL_MS = 60_000;
// Ce qu'on garde des sommeils passés : un cook ne vit pas davantage.
const GARDES = 64;

export function veilleMachine(options: { periodeMs?: number; seuilMs?: number; horloges?: Horloges } = {}): VeilleMachine {
  const periodeMs = options.periodeMs ?? PERIODE_MS;
  const seuilMs = options.seuilMs ?? SEUIL_MS;
  const horloges = options.horloges ?? { mono: () => performance.now(), mur: () => Date.now() };
  const sommeils: Sommeil[] = [];
  const ecouteurs = new Set<(sommeil: Sommeil) => void>();
  let dernierMono = horloges.mono();
  let dernierMur = horloges.mur();

  const regarder = () => {
    const mono = horloges.mono();
    const mur = horloges.mur();
    const ecouleMono = mono - dernierMono;
    const ecouleMur = mur - dernierMur;
    const sommeil: Sommeil = { debutMono: dernierMono, finMono: mono, debutMur: dernierMur, finMur: mur, gapMs: Math.max(ecouleMono, ecouleMur) };
    dernierMono = mono;
    dernierMur = mur;
    if (Math.max(ecouleMono, ecouleMur) - periodeMs <= seuilMs) return;
    sommeils.push(sommeil);
    if (sommeils.length > GARDES) sommeils.shift();
    for (const ecouter of [...ecouteurs]) {
      try {
        ecouter(sommeil);
      } catch (erreur) {
        console.error(`brigade : réveil de la machine non traité — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
  };

  const coup = setInterval(regarder, periodeMs);
  coup.unref();

  return {
    maintenant: () => horloges.mono(),
    regarder,
    dormiDepuis(depuis) {
      regarder();
      return sommeils.reduce((total, { debutMono, finMono }) => total + Math.max(0, finMono - Math.max(debutMono, depuis)), 0);
    },
    reveilRecent(depuis, fenetreMs) {
      regarder();
      const mono = horloges.mono();
      for (let i = sommeils.length - 1; i >= 0; i--) {
        const sommeil = sommeils[i] as Sommeil;
        if (mono - sommeil.finMono > fenetreMs) return null;
        if (sommeil.finMono > depuis) return sommeil;
      }
      return null;
    },
    surReveil(ecouter) {
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter() {
      clearInterval(coup);
      ecouteurs.clear();
    },
  };
}

// La minuterie d'inactivité d'un cook, armée à `veille.maintenant()` : au bout
// de `idleMs`, elle appelle `surSilence` avec le silence observé — sauf si la
// machine a dormi entre-temps et que le silence, sommeil retranché, n'atteint
// pas `idleMs` : elle se réarme alors pour ce qui en manque.
export function guetterLeSilence(veille: VeilleMachine, idleMs: number, surSilence: (silence: number) => void): { annuler(): void } {
  const depuis = veille.maintenant();
  let minuterie: NodeJS.Timeout | undefined;
  const armer = (attente: number) => {
    minuterie = setTimeout(() => {
      const dormi = veille.dormiDepuis(depuis);
      const silence = veille.maintenant() - depuis - dormi;
      if (dormi > 0 && silence < idleMs) return armer(idleMs - silence);
      surSilence(silence);
    }, attente);
  };
  armer(idleMs);
  return { annuler: () => clearTimeout(minuterie) };
}
