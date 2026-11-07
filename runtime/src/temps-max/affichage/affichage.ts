// Le temps d'un ticket contre le max du projet, à l'écran (épique #2514).
// Deux sorties, pures : la ligne de `status` (médiane contre max, en rouge quand
// la médiane dépasse le max) et la ligne de la partie informative de TODO pour
// un ticket qui a dépassé deux fois le max — dite dès qu'il est connu, sans
// attendre la médiane, avec sa phase la plus lente. Le max est celui du projet
// (`tempsMaxTicketMin`) : l'appelant le donne.
import { mediane } from "../../temps-ticket/synthese.ts";
import type { TempsTicket } from "../../temps-ticket/ligne-status.ts";

const DERNIERS = 10;
const ROUGE = "\u001b[31m";
const FIN_ROUGE = "\u001b[0m";

// Les phases d'un ticket, dans l'ordre de sa vie, et leur nom : la seule
// liste, que lisent aussi l'alerte et le ticket de correction (`../mesure.ts`).
// `cuissonTests` est une part de `cuisson` : elle n'est pas une phase de plus.
export const PHASES = [
  ["attenteQualification", "qualification wait"],
  ["attentePrise", "claim wait"],
  ["cuissonsRatees", "failed cooks"],
  ["cuisson", "cooking"],
  ["renvois", "send-backs"],
  ["attentePasse", "pass wait"],
  ["revue", "review"],
  ["ci", "CI"],
  ["merge", "merge"],
] as const;
export type Phase = (typeof PHASES)[number][0];

// Le temps d'une phase du ticket, en secondes. Celles d'avant la prise, des
// cooks ratés et des renvois manquent aux enregistrements d'avant #2662 : 0.
export const secondesDe = (t: TempsTicket, phase: Phase): number => t[phase] ?? 0;

const minutes = (secondes: number) => `${Math.round(secondes / 60)} min`;

// Du dépôt (ou de `fire`) au merge (#2662) — de la prise au merge pour un
// enregistrement d'avant, qui n'a pas `depuis` — quand les deux dates y sont,
// sinon la somme des phases.
export function dureeDuTicket(t: TempsTicket): number {
  const de = Date.parse(t.depuis ?? t.claimedAt ?? "");
  const a = Date.parse(t.mergedAt ?? "");
  return Number.isNaN(de) || Number.isNaN(a) || a < de ? PHASES.reduce((somme, [p]) => somme + secondesDe(t, p), 0) : (a - de) / 1000;
}

export function phaseLaPlusLente(t: TempsTicket): { nom: string; secondes: number } {
  let lente: { nom: string; secondes: number } = { nom: PHASES[0][1], secondes: secondesDe(t, PHASES[0][0]) };
  for (const [p, nom] of PHASES) if (secondesDe(t, p) > lente.secondes) lente = { nom, secondes: secondesDe(t, p) };
  return lente;
}

// `18 min / 10 min` ; rien de mesuré, pas de ligne. `rouge` : colorer quand la médiane dépasse le max.
export function ligneMedianeContreMax(enregistrements: TempsTicket[], maxMin: number, rouge = false): string | null {
  const derniers = enregistrements.slice(-DERNIERS);
  if (derniers.length === 0) return null;
  const med = mediane(derniers.map(dureeDuTicket));
  const texte = `${minutes(med)} / ${maxMin} min`;
  return rouge && med > maxMin * 60 ? `${ROUGE}${texte}${FIN_ROUGE}` : texte;
}

// Une ligne par ticket mesuré (parmi les derniers) au-delà de deux fois le max ; à deux fois pile, aucune.
export function lignesDeTicketsTropLongs(enregistrements: TempsTicket[], maxMin: number): string[] {
  return enregistrements.slice(-DERNIERS).flatMap((t) => {
    const duree = dureeDuTicket(t);
    if (duree <= 2 * maxMin * 60) return [];
    const lente = phaseLaPlusLente(t);
    return [`ticket #${t.ticket} took ${minutes(duree)}, over twice the max of ${maxMin} min — slowest phase: ${lente.nom} ${minutes(lente.secondes)}`];
  });
}
