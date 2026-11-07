// Le temps des tickets contre le max du projet (épique #2514), en fonctions
// pures : le max d'un projet, les tickets récents et leur médiane, la phase la
// plus lente d'un ticket ou d'un ensemble de tickets. Elles reçoivent ce que
// l'appelant a lu de `.claude/brigade/` ; aucune ne lit ni n'écrit de fichier.
//
// Les enregistrements sont ceux de `temps-tickets.json` (#2342), dans l'ordre
// où la station les ajoute — celui des merges —, leurs phases en secondes.
import { dureeDuTicket, type Phase, PHASES, secondesDe } from "./affichage/affichage.ts";
import { mediane } from "../temps-ticket/synthese.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";

export { dureeDuTicket, type Phase, PHASES };

// Le max d'un ticket, en minutes, sans `tempsMaxTicketMin` dans projet.json.
export const MAX_PAR_DEFAUT_MIN = 10;

// `projet` est le contenu déjà lu de projet.json : absent, illisible, mal formé
// ou sans clé valide (un nombre plus grand que 0), c'est le défaut.
export function maxDuProjet(projet: unknown): number {
  if (typeof projet !== "object" || projet === null || Array.isArray(projet)) return MAX_PAR_DEFAUT_MIN;
  const valeur = (projet as Record<string, unknown>).tempsMaxTicketMin;
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : MAX_PAR_DEFAUT_MIN;
}

// Les tickets récents : les 10 derniers mergés, et avec eux tous ceux mergés
// dans les 24 h avant le dernier — la journée entière compte, même chargée.
export const DERNIERS = 10;
export const JOURNEE_MS = 24 * 60 * 60 * 1000;

// La même fenêtre sert la qualité (`mesure-qualite.ts`, #2678) : elle ne lit que `mergedAt`.
export function ticketsRecents<T extends { mergedAt?: string }>(enregistrements: readonly T[]): T[] {
  const fin = Date.parse(enregistrements.at(-1)?.mergedAt ?? "");
  let debut = Math.max(0, enregistrements.length - DERNIERS);
  while (debut > 0 && Date.parse(enregistrements[debut - 1]?.mergedAt ?? "") >= fin - JOURNEE_MS) debut--;
  return enregistrements.slice(debut);
}

// La médiane des tickets récents, du dépôt (ou de `fire`) au merge (#2662), en secondes ; null sans ticket mesuré.
export function medianeDesRecents(enregistrements: readonly TempsTicket[]): number | null {
  const recents = ticketsRecents(enregistrements);
  return recents.length === 0 ? null : mediane(recents.map(dureeDuTicket));
}

export type PhaseLente = { phase: Phase; nom: string; secondes: number };

// La phase la plus longue d'un ticket ; à égalité, la plus tôt dans sa vie.
export function phaseLaPlusLenteDuTicket(t: TempsTicket): PhaseLente {
  return phaseLaPlusLenteDesTickets([t]);
}

// La phase où des tickets ont passé le plus de temps, en tout (`secondes`) ;
// à égalité, la plus tôt. Sans ticket, la cuisson à 0.
export function phaseLaPlusLenteDesTickets(tickets: readonly TempsTicket[]): PhaseLente & { mediane: number; part: number } {
  return totauxParPhase(tickets).reduce((lente, total) => (total.secondes > lente.secondes ? total : lente));
}

// Chaque phase sur des tickets : son temps total, sa médiane par ticket, et sa
// part (0 à 1) du temps de toutes les phases.
export function totauxParPhase(tickets: readonly TempsTicket[]): (PhaseLente & { mediane: number; part: number })[] {
  const sommes = PHASES.map(([phase]) => tickets.reduce((somme, t) => somme + secondesDe(t, phase), 0));
  const tout = sommes.reduce((a, b) => a + b, 0);
  return PHASES.map(([phase, nom], rang) => {
    const secondes = sommes[rang] ?? 0;
    return { phase, nom, secondes, mediane: mediane(tickets.map((t) => secondesDe(t, phase))), part: tout === 0 ? 0 : secondes / tout };
  });
}

// Les tickets les plus longs, du plus long au plus court ; à égalité, le premier mergé.
export function ticketsLesPlusLents(tickets: readonly TempsTicket[], combien: number): TempsTicket[] {
  return tickets
    .map((t, rang) => ({ t, rang, duree: dureeDuTicket(t) }))
    .sort((a, b) => b.duree - a.duree || a.rang - b.rang)
    .slice(0, combien)
    .map(({ t }) => t);
}
