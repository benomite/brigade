// Le temps des tickets (épique #2514) et le temps qu'ils perdent (#2670), en
// fonctions pures : le seuil du temps perdu d'un projet, les tickets récents et leur médiane, la phase la
// plus lente d'un ticket ou d'un ensemble de tickets. Elles reçoivent ce que
// l'appelant a lu de `.claude/brigade/` ; aucune ne lit ni n'écrit de fichier.
//
// Les enregistrements sont ceux de `temps-tickets.json` (#2342), dans l'ordre
// où la station les ajoute — celui des merges —, leurs phases en secondes.
import { dureeDuTicket, type Phase, PHASES, secondesDe } from "./affichage/affichage.ts";
import type { Pertes } from "../temps-ticket/synthese.ts";
import { mediane } from "../temps-ticket/synthese.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";

export { dureeDuTicket, type Phase, PHASES };

// Le seuil du temps perdu (#2670), en minutes, sans `lostTimeMaxMin` dans
// projet.json. Il remplace le max d'un ticket (`tempsMaxTicketMin`, 10 min) :
// un ticket n'a pas de taille fixe, mais le temps qu'il perd est du gaspillage
// quelle que soit sa taille.
export const SEUIL_PERDU_PAR_DEFAUT_MIN = 2;

// `projet` est le contenu déjà lu de projet.json : absent, illisible, mal formé
// ou sans clé valide (un nombre plus grand que 0), c'est le défaut.
export function seuilDuProjet(projet: unknown): number {
  if (typeof projet !== "object" || projet === null || Array.isArray(projet)) return SEUIL_PERDU_PAR_DEFAUT_MIN;
  const valeur = (projet as Record<string, unknown>).lostTimeMaxMin;
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : SEUIL_PERDU_PAR_DEFAUT_MIN;
}

// Les tickets récents : les 10 derniers mergés, et avec eux tous ceux mergés
// dans les 24 h avant le dernier — la journée entière compte, même chargée.
export const DERNIERS = 10;
export const JOURNEE_MS = 24 * 60 * 60 * 1000;

export function ticketsRecents(enregistrements: readonly TempsTicket[]): TempsTicket[] {
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

// Le temps perdu d'un ticket (#2670) : tout son temps sauf le cook qui a livré
// et la pass, la CI et le merge de la livraison mergée. Il se partage en trois
// pertes : l'attente avant la prise (celle de la qualification et celles d'une
// prise), les cooks ratés, et les renvois — chaque livraison renvoyée, de son
// cook à la reprise.
export const PERTES = [
  ["attente", "waiting for a claim"],
  ["ratees", "failed cooks"],
  ["renvois", "send-backs"],
] as const;
export type Perte = (typeof PERTES)[number][0];

// Les pertes d'un ticket, en secondes : celles que la mesure a écrites
// (`perdu`) ; pour un enregistrement d'avant #2670, tirées de ses phases —
// sans les cooks et passes des livraisons renvoyées, qu'il ne distingue pas.
export function pertesDuTicket(t: TempsTicket): Pertes {
  const perdu = t.perdu;
  if (perdu !== undefined && PERTES.every(([p]) => typeof perdu[p] === "number" && Number.isFinite(perdu[p]))) return perdu;
  return { attente: (t.attenteQualification ?? 0) + (t.attentePrise ?? 0), ratees: t.cuissonsRatees ?? 0, renvois: t.renvois ?? 0 };
}

export const tempsPerdu = (t: TempsTicket): number => PERTES.reduce((somme, [p]) => somme + pertesDuTicket(t)[p], 0);

// La médiane du temps perdu des tickets récents, en secondes ; null sans ticket mesuré.
export function medianePerdueDesRecents(enregistrements: readonly TempsTicket[]): number | null {
  const recents = ticketsRecents(enregistrements);
  return recents.length === 0 ? null : mediane(recents.map(tempsPerdu));
}

export type TotalDePerte = { perte: Perte; nom: string; secondes: number; mediane: number; part: number; tickets: number };

// Chaque perte sur des tickets : son temps total, sa médiane par ticket, sa
// part (0 à 1) de tout le temps perdu, et combien de tickets l'ont subie.
export function totauxParPerte(tickets: readonly TempsTicket[]): TotalDePerte[] {
  const pertes = tickets.map(pertesDuTicket);
  const sommes = PERTES.map(([perte]) => pertes.reduce((somme, p) => somme + p[perte], 0));
  const tout = sommes.reduce((a, b) => a + b, 0);
  return PERTES.map(([perte, nom], rang) => {
    const secondes = sommes[rang] ?? 0;
    return { perte, nom, secondes, mediane: mediane(pertes.map((p) => p[perte])), part: tout === 0 ? 0 : secondes / tout, tickets: pertes.filter((p) => p[perte] > 0).length };
  });
}

// La perte qui pèse le plus sur des tickets, en tout ; à égalité, la plus tôt
// dans la vie d'un ticket. Null quand ils n'ont rien perdu.
export function perteLaPlusLourde(tickets: readonly TempsTicket[]): TotalDePerte | null {
  const lourde = totauxParPerte(tickets).reduce((a, b) => (b.secondes > a.secondes ? b : a));
  return lourde.secondes > 0 ? lourde : null;
}
