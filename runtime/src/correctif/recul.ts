// Ce qu'une correction mergée a fait de sa cause : la part des tickets que la
// cause a fait rater avant le merge de sa PR, et après. C'est `facts` qui le
// porte (`faits.ts`), pour la page du projet : l'app n'y déduit rien.
//
// Seuls comptent les tickets finis — mergés, ou servis sans diff. « Avant » :
// les derniers finis avant le merge. « Après » : les premiers pris, et donc
// finis, après lui — un ticket pris avant le merge et fini après a été cuisiné
// sous les consignes d'avant, il n'est ni de l'un ni de l'autre. Les deux côtés
// regardent au plus `fenetre` tickets, la fenêtre du détecteur : une fois
// pleine, la mesure ne bouge plus.
//
// Tant que la PR n'est pas mergée, rien ne se mesure ; mergée sans ticket fini
// après elle, il n'y a rien à comparer — et pas une part nulle.
import { essaisRates } from "../causes-des-ratages.ts";
import type { Journal } from "../journal.ts";
import { parcoursDesTickets } from "../parcours-des-tickets.ts";
import type { Parcours } from "../renvois.ts";
import { FENETRE_PAR_DEFAUT } from "./reglages.ts";

// Ce que la cause a fait sur un côté. `tickets` : les tickets finis regardés,
// jamais aucun. `atteints` : ceux dont elle a fait rater au moins un essai,
// dans l'ordre de leur fin. `essais` : les essais qu'elle y a fait rater.
// `part` : `atteints` sur `tickets`, entre 0 et 1.
export type Releve = { tickets: number; atteints: number[]; essais: number; part: number };

// `proposition` : le fait `correction.proposed` que le chef a accepté, par son
// `seq`. `pr` : la PR de la correction, nulle tant qu'elle n'est pas ouverte ou
// si elle ne l'a jamais été. `etat` :
// - `en-cours` : acceptée, pas encore mergée — la livraison part, ou la PR est
//   en pass. Rien ne se mesure encore ;
// - `non-mergee` : elle ne le sera pas — non livrée, ou PR fermée sans merge ;
// - `rien-a-comparer` : mergée (`mergee`, l'heure du merge), sans ticket fini
//   après elle. `avant` est nul si aucun ne l'était avant non plus ;
// - `mesuree` : les deux côtés, et `recule` — la part a baissé.
type Commun = { proposition: number; cause: string; titre: string; pr: string | null };
export type ReculDeCorrection =
  | (Commun & { etat: "en-cours" | "non-mergee" })
  | (Commun & { etat: "rien-a-comparer"; mergee: string; avant: Releve | null })
  | (Commun & { etat: "mesuree"; mergee: string; avant: Releve; apres: Releve; recule: boolean });

const fin = (un: Parcours) => Date.parse(un.end?.at ?? "");

// Ce que la cause a fait sur ces parcours finis. Nul s'il n'y en a aucun.
export function releverLaCause(parcours: readonly Parcours[], cause: string): Releve | null {
  if (parcours.length === 0) return null;
  const rates = essaisRates(parcours).filter((essai) => essai.cause === cause);
  const atteints = [...new Set(rates.map(({ ticket }) => ticket))];
  return { tickets: parcours.length, atteints, essais: rates.length, part: atteints.length / parcours.length };
}

// Avant et après `mergee` : une fonction pure, qui ne lit rien.
export function avantApres(parcours: readonly Parcours[], cause: string, mergee: string, fenetre = FENETRE_PAR_DEFAUT): { avant: Releve | null; apres: Releve | null } {
  const merge = Date.parse(mergee);
  const finis = parcours.filter((un) => un.end !== null).sort((a, b) => fin(a) - fin(b));
  const avant = finis.filter((un) => fin(un) < merge).slice(-fenetre);
  const apres = finis.filter((un) => Date.parse(un.takenAt) > merge).slice(0, fenetre);
  return { avant: releverLaCause(avant, cause), apres: releverLaCause(apres, cause) };
}

// Chaque correction acceptée, la plus ancienne d'abord, et ce qu'elle a fait
// de sa cause.
export function reculDesCorrections(journal: Journal, fenetre = FENETRE_PAR_DEFAUT): ReculDeCorrection[] {
  const tout = <T extends Parameters<Journal["duType"]>[0]>(type: T) => journal.duType(type, Number.MAX_SAFE_INTEGER);
  const proposees = tout("correction.proposed");
  const livrees = tout("correction.delivered");
  const nonLivrees = tout("correction.undelivered");
  const merges = tout("merge.done");
  const fermees = tout("pass.pr-closed");
  let parcours: Parcours[] | null = null;

  return tout("correction.accepted").flatMap(({ payload }): ReculDeCorrection[] => {
    const proposee = proposees.find(({ seq }) => seq === payload.proposal);
    if (proposee === undefined) return [];
    const livree = livrees.find((un) => un.payload.proposal === payload.proposal);
    const commun: Commun = { proposition: payload.proposal, cause: payload.cause, titre: proposee.payload.title, pr: livree?.payload.pr ?? null };
    if (livree === undefined) return [{ ...commun, etat: nonLivrees.some((un) => un.payload.proposal === payload.proposal) ? "non-mergee" : "en-cours" }];
    // La PR hors du rail est suivie sous son numéro, comme un ticket.
    const sienne = (un: { seq: number; ticket: number | null; payload: { pr: string } }) => un.seq > livree.seq && un.ticket === livree.payload.number && un.payload.pr === livree.payload.pr;
    const merge = merges.find(sienne);
    if (merge === undefined) return [{ ...commun, etat: fermees.some(sienne) ? "non-mergee" : "en-cours" }];
    parcours ??= parcoursDesTickets(journal.base);
    const { avant, apres } = avantApres(parcours, payload.cause, merge.at, fenetre);
    if (avant === null || apres === null) return [{ ...commun, etat: "rien-a-comparer", mergee: merge.at, avant }];
    return [{ ...commun, etat: "mesuree", mergee: merge.at, avant, apres, recule: apres.part < avant.part }];
  });
}
