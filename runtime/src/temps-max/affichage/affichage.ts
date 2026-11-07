// Le temps d'un ticket et le temps qu'il perd, à l'écran (épique #2514, #2670).
// Deux sorties, pures : la ligne de `status` (temps perdu médian contre le
// seuil, en rouge quand il le dépasse) et la ligne de la partie informative de
// TODO pour un ticket qui a perdu plus de deux fois le seuil — dite dès qu'il
// est connu, sans attendre la médiane, avec sa perte la plus lourde. Le seuil
// est celui du projet (`lostTimeMaxMin`) : l'appelant le donne.
import { medianePerdueDesRecents, perteLaPlusLourde, tempsPerdu } from "../mesure.ts";
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

const dixiemes = (secondes: number) => `${Math.round(secondes / 6) / 10} min`;

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

// `3.5 min / 2 min` : le temps perdu médian des tickets récents contre le seuil ;
// rien de mesuré, pas de ligne. `rouge` : colorer quand il dépasse le seuil.
export function ligneDuTempsPerdu(enregistrements: TempsTicket[], seuilMin: number, rouge = false): string | null {
  const med = medianePerdueDesRecents(enregistrements);
  if (med === null) return null;
  const texte = `${dixiemes(med)} / ${seuilMin} min`;
  return rouge && med > seuilMin * 60 ? `${ROUGE}${texte}${FIN_ROUGE}` : texte;
}

// Une ligne par ticket mesuré (parmi les derniers) qui a perdu plus de deux fois le seuil ; à deux fois pile, aucune.
export function lignesDeTicketsQuiPerdent(enregistrements: TempsTicket[], seuilMin: number): string[] {
  return enregistrements.slice(-DERNIERS).flatMap((t) => {
    const perdu = tempsPerdu(t);
    if (perdu <= 2 * seuilMin * 60) return [];
    const lourde = perteLaPlusLourde([t]);
    return [`ticket #${t.ticket} lost ${dixiemes(perdu)}, over twice the threshold of ${seuilMin} min — mostly ${lourde?.nom} ${dixiemes(lourde?.secondes ?? 0)}`];
  });
}
