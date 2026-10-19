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
//
// Sauf si le chef a dit « non » à sa correction (`correction.refused`) : la
// cause revient alors en candidate dès qu'elle fait rater un essai que le
// journal ne portait pas au moment du « non » — et qu'elle atteint encore le
// seuil. Les mêmes échecs, relevés à nouveau, n'en refont pas une.
import { CAUSES, essaisRates } from "../causes-des-ratages.ts";
import type { Evenement } from "../evenements.ts";
import type { Journal } from "../journal.ts";
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

// Les essais que la cause a fait rater, par ticket et par run. `essaisRates`
// rend les essais ratés d'un parcours dans l'ordre de ses essais, le dernier
// seul pouvant manquer : le rang de l'un est celui de l'autre.
export function ratesDeLaCause(parcours: readonly Parcours[], cause: string): Array<{ ticket: number; run: string }> {
  return parcours.flatMap((un) => essaisRates([un]).flatMap((essai, i) => (essai.cause === cause && un.attempts[i] ? [{ ticket: un.ticket, run: un.attempts[i].run }] : [])));
}

type Candidat = Extract<Evenement, { type: "correction.candidate" }>;
type Refus = Extract<Evenement, { type: "correction.refused" }>;

// Ce qui retient une récurrence d'être posée : `true`, une candidate de la même
// cause sur l'un de ces tickets que rien n'a refusée, ou un « non » qu'aucun
// échec neuf n'a suivi. Sinon `false`, ou le dernier « non » qu'elle dépasse :
// c'est lui que sa clé d'unicité nomme.
function retenue(poses: readonly Candidat[], refus: readonly Refus[], candidat: CandidatACorrection, rates: Array<{ run: string }>): boolean | Refus {
  const recouvertes = poses.filter(({ payload }) => payload.cause === candidat.cause && payload.tickets.some((ticket) => candidat.tickets.includes(ticket)));
  if (recouvertes.length === 0) return false;
  const refusees = recouvertes.flatMap(({ seq }) => refus.filter(({ payload }) => payload.candidate === seq));
  if (refusees.length < recouvertes.length) return true;
  const vus = new Set(refusees.flatMap(({ payload }) => payload.runs));
  if (rates.every(({ run }) => vus.has(run))) return true;
  return refusees.reduce((dernier, un) => (un.seq > dernier.seq ? un : dernier));
}

// Relève les récurrences du journal et pose celles qui n'y sont pas encore.
// Rend les candidats écrits par ce relevé — aucun s'il n'y a rien de neuf.
export function detecter(journal: Journal, projet: string, reglages: ReglagesDuCorrectif): Candidat[] {
  const poses = journal.duType("correction.candidate", Number.MAX_SAFE_INTEGER);
  const refus = journal.duType("correction.refused", Number.MAX_SAFE_INTEGER);
  const parcours = parcoursDesTickets(journal.base);
  const ecrits: Candidat[] = [];
  for (const candidat of reperer(parcours, reglages)) {
    const motif = retenue(poses, refus, candidat, ratesDeLaCause(parcours.slice(-reglages.fenetre), candidat.cause));
    if (motif === true) continue;
    const ecrit = journal.ajouter({
      project: projet,
      ticket: null,
      author: "runtime",
      type: "correction.candidate",
      payload: candidat,
      dedupKey: `correction.candidate:${candidat.cause}:${candidat.tickets.join(",")}${motif === false ? "" : `:after:${motif.seq}`}`,
    });
    if (ecrit !== null) ecrits.push(ecrit as Candidat);
  }
  return ecrits;
}
