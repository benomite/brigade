// Le rejeu d'un ticket depuis son historique GitHub enregistré, pour les tests
// du temps des tickets (#2662) : la station ne rejoue rien, elle mesure en
// direct (`chronometre`). Le rejeu passe par la même mesure (`mesurer`) et la
// même règle du cook raté (`rater`) que la station.
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { faitsDePrise } from "../../src/github-etat/prise.ts";
import { type DepotDuTicket, type Etape, type Marque, mesurer, type Parcours, rater } from "../../src/temps-ticket/mesure.ts";
import type { EnregistrementTemps } from "../../src/temps-ticket/synthese.ts";

// L'historique d'un ticket tel que GitHub le garde, enregistré : l'issue
// (son dépôt, ses labels d'aujourd'hui), les poses et retraits de ses labels,
// les commentaires de l'issue et de sa PR, et le merge de sa PR (absent, il
// n'a pas été servi).
export type Historique = {
  ticket: number;
  createdAt: string;
  labels: string[];
  mergedAt?: string | null;
  evenements: { event: "labeled" | "unlabeled"; label: string; createdAt: string }[];
  commentaires: { body: string; createdAt: string }[];
};

export const LABEL_EPIQUE = "epic";

// Les marques que la station a laissées sur GitHub, dans l'ordre : sa prise
// (`brigade:prise`) ouvre une cuisson, son échec (`brigade:echec`) ou son
// lâcher sans livraison (`brigade:lache`, un arrêt que le cook n'a pas causé
// compris) en fait un cook raté, `in-pass` posé ouvre l'attente de la pass, le verdict qui approuve
// (`brigade:verdict … approve`) ouvre la CI, le renvoi (`brigade:renvoi`)
// l'attente du cook suivant. La pass ne dit pas sur GitHub quand sa relecture
// commence : elle compte dans l'attente de la pass.
export function parcoursDeLHistorique(h: Historique): { parcours: Parcours; depot: DepotDuTicket; mergedAt: string } | null {
  if (h.mergedAt === undefined || h.mergedAt === null || Number.isNaN(Date.parse(h.mergedAt))) return null;
  if (h.labels.includes(LABEL_EPIQUE) || h.evenements.some((e) => e.label === LABEL_EPIQUE)) return null;
  // Les prises, les rendus et les renvois se lisent comme la station les lit au merge (`faitsDePrise`, #2954).
  const faits = [
    ...h.evenements.map((e) => ({ at: e.createdAt, quoi: e.event === "labeled" && e.label === LABEL_IN_PASS ? "passe" : "" })),
    ...faitsDePrise(
      h.commentaires.map((c) => ({ ...c, association: "OWNER" })),
      new Date(0).toISOString(),
    ),
    ...h.commentaires.map((c) => ({ at: c.createdAt, quoi: /^<!-- brigade:verdict [^>]*verdict=approve /.test(c.body) ? "approuve" : "" })),
  ]
    .filter((f) => f.quoi !== "" && !Number.isNaN(Date.parse(f.at)))
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const marques: Marque[] = [];
  const marquer = (etape: Etape, at: string) => {
    if (marques.at(-1)?.etape !== etape) marques.push({ etape, at });
  };
  for (const { at, quoi } of faits) {
    if (quoi === "prise") marquer("cuisson", at);
    else if (quoi === "rendu") rater(marques, at);
    else if (quoi === "passe") marquer("attentePasse", at);
    else if (quoi === "approuve") marquer("ci", at);
    else if (quoi === "renvoi") marquer("renvoi", at);
  }
  const fireAt = h.evenements.find((e) => e.event === "labeled" && e.label === "fire")?.createdAt ?? null;
  return { parcours: { ticket: h.ticket, marques, testsMs: 0 }, depot: { deposeAt: h.createdAt, fireAt }, mergedAt: h.mergedAt };
}

// Les temps de tickets rejoués de leur historique : les tickets servis, sans les épiques.
export function rejouer(historiques: readonly Historique[]): EnregistrementTemps[] {
  return historiques
    .map(parcoursDeLHistorique)
    .filter((lu) => lu !== null)
    .map(({ parcours, depot, mergedAt }) => mesurer(parcours, mergedAt, depot))
    .sort((x, y) => Date.parse(x.mergedAt) - Date.parse(y.mergedAt));
}
