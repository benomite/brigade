// La synthèse des derniers tickets servis (#2343, épique #2336), tirée des
// enregistrements de `.claude/brigade/temps-tickets.json`. Fonctions pures : ce
// module ne lit ni n'écrit le fichier, il reçoit son contenu.
import type { QualiteDuTicket } from "../mesure-qualite.ts";

export const PHASES = ["cuisson", "cuissonTests", "attentePasse", "revue", "ci", "merge"] as const;
export type Phase = (typeof PHASES)[number];

// Depuis #2662, un enregistrement part aussi de `depuis` (le dépôt de l'issue,
// ou `fire`) et porte les phases d'avant la prise et des cooks ratés ou
// renvoyés, en secondes, et `phases` : chaque phase dans l'ordre de la vie du
// ticket, en minutes. Ceux d'avant n'en ont pas : ils vont de la prise au merge.
export type EnregistrementTemps = { ticket: number; claimedAt: string; mergedAt: string } & Record<Phase, number> & {
    depuis?: string;
    attenteQualification?: number;
    attentePrise?: number;
    cuissonsRatees?: number;
    renvois?: number;
    phases?: { nom: string; minutes: number }[];
    // Depuis #2670, son temps perdu, en secondes (`temps-max/mesure.ts`).
    perdu?: Pertes;
    // Depuis #2707, sa qualité, lue sur GitHub au merge (`qualite-github.ts`).
    qualite?: QualiteDuTicket;
    // Depuis #2734, sa première prise lue sur GitHub au merge (#2732), null sans
    // prise lisible ; absente, il a été mesuré avant, et la station la rattrape.
    priseAt?: string | null;
  };

// Le temps perdu d'un ticket, en secondes : l'attente avant sa prise, ses
// cooks ratés, ses renvois (les livraisons renvoyées, de leur cook à la reprise).
export type Pertes = { attente: number; ratees: number; renvois: number };

export type SyntheseTemps = {
  mediane: number;
  plusLent: { ticket: number; total: number };
  medianeParPhase: Record<Phase, number>;
  phaseDominante: Phase;
  depasseLeMax: boolean;
};

export const NOMBRE_DE_TICKETS_RECENTS = 10;

export function totalDuTicket(e: EnregistrementTemps): number {
  return PHASES.reduce((somme, phase) => somme + e[phase], 0) + (e.attenteQualification ?? 0) + (e.attentePrise ?? 0) + (e.cuissonsRatees ?? 0) + (e.renvois ?? 0);
}

export function mediane(valeurs: number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = triees.length >> 1;
  const bas = triees[milieu - 1] ?? 0;
  const haut = triees[milieu] ?? 0;
  return triees.length % 2 === 1 ? haut : (bas + haut) / 2;
}

// Le contenu du fichier des enregistrements : un tableau (avant #2662) ou
// `tickets` de son objet, sinon rien. Les entrées qui n'ont pas la forme
// attendue sont écartées.
export function enregistrementsDuTexte(texte: string | undefined): EnregistrementTemps[] {
  if (texte === undefined) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return [];
  }
  if (Array.isArray(brut)) return brut.filter(estUnEnregistrement);
  const tickets = typeof brut === "object" && brut !== null ? (brut as { tickets?: unknown }).tickets : undefined;
  return Array.isArray(tickets) ? tickets.filter(estUnEnregistrement) : [];
}

function estUnEnregistrement(x: unknown): x is EnregistrementTemps {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.ticket === "number" &&
    typeof e.claimedAt === "string" &&
    typeof e.mergedAt === "string" &&
    !Number.isNaN(Date.parse(e.mergedAt)) &&
    PHASES.every((p) => typeof e[p] === "number" && Number.isFinite(e[p]))
  );
}

// Les 10 derniers par `mergedAt`, sur `maxMin` minutes de plafond. Sans
// enregistrement : pas de synthèse (undefined), pas d'erreur.
export function synthese(enregistrements: EnregistrementTemps[], maxMin: number): SyntheseTemps | undefined {
  const recents = [...enregistrements]
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, NOMBRE_DE_TICKETS_RECENTS);
  const premier = recents[0];
  if (!premier) return undefined;
  const totaux = recents.map(totalDuTicket);
  let plusLent = { ticket: premier.ticket, total: totaux[0] ?? 0 };
  recents.forEach((e, i) => {
    const total = totaux[i] ?? 0;
    if (total > plusLent.total) plusLent = { ticket: e.ticket, total };
  });
  const medianeParPhase = Object.fromEntries(PHASES.map((p) => [p, mediane(recents.map((e) => e[p]))])) as Record<Phase, number>;
  let phaseDominante: Phase = PHASES[0];
  for (const p of PHASES) if (medianeParPhase[p] > medianeParPhase[phaseDominante]) phaseDominante = p;
  const medianeTotale = mediane(totaux);
  return { mediane: medianeTotale, plusLent, medianeParPhase, phaseDominante, depasseLeMax: medianeTotale > maxMin * 60 };
}
