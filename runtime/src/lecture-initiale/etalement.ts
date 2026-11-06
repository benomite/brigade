// La première lecture GitHub des projets de la station, étalée (#2587).
//
// À son démarrage la station relit tout pour ses projets à la fois, et la
// limite secondaire de GitHub tombe quelques secondes plus tard. Chaque projet
// part donc à un décalage fixe de la fenêtre : dans l'ordre où la station les
// ouvre, à intervalles réguliers — jamais au hasard. Après sa première lecture,
// un projet reprend sa cadence habituelle (`brigade-github.ts`).

// Cinq minutes, à défaut (`BRIGADE_STATION_FENETRE_S`).
export const FENETRE_PAR_DEFAUT_MS = 300_000;

// Quand le projet de rang `rang` (0 pour le premier ouvert) lit pour la
// première fois, sur `total` projets : `rang` parts égales de la fenêtre. Le
// dernier part donc avant la fin de la fenêtre, le premier tout de suite, et
// une fenêtre de 0 les lance tous à la fois, comme avant.
export function departDuProjet(rang: number, total: number, fenetreMs: number): number {
  if (fenetreMs <= 0 || total <= 1) return 0;
  return Math.floor((Math.min(Math.max(rang, 0), total - 1) * fenetreMs) / total);
}

// La fenêtre que règle l'environnement de la station, en secondes entières
// (0 permis), ou null si la valeur n'en est pas une.
export function fenetreDe(brut: string | undefined): number | null {
  if (brut === undefined) return FENETRE_PAR_DEFAUT_MS;
  return /^\d+$/.test(brut) ? Number(brut) * 1000 : null;
}
