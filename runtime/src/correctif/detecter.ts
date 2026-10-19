// Le détecteur des causes qui reviennent : sur les derniers tickets servis du
// projet, les essais ratés sont rangés par cause (`causes-des-ratages.ts`), et
// une cause qui a fait rater au moins `seuil` tickets distincts devient une
// candidate à une correction, posée au journal. Rien n'y est corrigé.
//
// « autre » n'en devient jamais une : c'est ce qu'aucun signal ne tranche, pas
// une cause qu'on puisse corriger.
//
// Une récurrence est relevée une fois. Le même relevé rejoué n'écrit rien (la
// clé d'unicité porte la cause et ses tickets), et une cause déjà candidate
// pour l'un de ces tickets ne l'est pas une seconde fois : un ticket de plus
// qui rate pour elle prolonge la même récurrence, il n'en ouvre pas une autre.
import { CAUSES, essaisRates } from "../causes-des-ratages.ts";
import type { Evenement } from "../evenements.ts";
import type { Log } from "../log.ts";
import { parcoursDesTickets } from "../parcours-des-tickets.ts";
import type { Parcours } from "../renvois.ts";
import type { CandidatACorrection } from "./evenements.ts";
import type { ReglagesDuCorrectif } from "./reglages.ts";

// Les causes qui atteignent le seuil sur les `fenetre` derniers parcours, dans
// l'ordre de `CAUSES`. Une fonction pure, qui ne lit rien.
export function reperer(parcours: readonly Parcours[], { seuil, fenetre }: ReglagesDuCorrectif): CandidatACorrection[] {
  const rates = essaisRates(parcours.slice(-fenetre));
  return CAUSES.filter(({ cle }) => cle !== "autre").flatMap(({ cle, titre }) => {
    const siens = rates.filter((essai) => essai.cause === cle);
    const tickets = [...new Set(siens.map((essai) => essai.ticket))];
    return tickets.length >= seuil ? [{ cause: cle, title: titre, tickets, failures: siens.length, threshold: seuil, window: fenetre }] : [];
  });
}

type Candidat = Extract<Evenement, { type: "correction.candidate" }>;

const deja = (poses: readonly Candidat[], { cause, tickets }: CandidatACorrection) =>
  poses.some(({ payload }) => payload.cause === cause && payload.tickets.some((ticket) => tickets.includes(ticket)));

// Relève les récurrences du journal et pose celles qui n'y sont pas encore.
// Rend les candidats écrits par ce relevé — aucun s'il n'y a rien de neuf.
export function detecter(log: Log, projet: string, reglages: ReglagesDuCorrectif): Candidat[] {
  const poses = log.duType("correction.candidate", Number.MAX_SAFE_INTEGER);
  const ecrits: Candidat[] = [];
  for (const candidat of reperer(parcoursDesTickets(log.base), reglages)) {
    if (deja(poses, candidat)) continue;
    const ecrit = log.ajouter({
      project: projet,
      ticket: null,
      author: "runtime",
      type: "correction.candidate",
      payload: candidat,
      dedupKey: `correction.candidate:${candidat.cause}:${candidat.tickets.join(",")}`,
    });
    if (ecrit !== null) ecrits.push(ecrit as Candidat);
  }
  return ecrits;
}
