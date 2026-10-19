// Le « oui » ou le « non » du chef sur une correction proposée. Rien ne part
// sans lui : une proposition que personne ne tranche reste dans la file, et
// rien n'en naît — ni branche, ni PR.
//
// - « oui » (`correction.accepted`) : la correction part en PR, et la PR en
//   pass, comme une livraison (`correctif/livrer.ts`).
// - « non » (`correction.refused`) : elle quitte la file, et la même cause ne
//   revient en candidate qu'avec des échecs que le journal ne portait pas à cet
//   instant (`correctif/detecter.ts`) — le « non » les nomme, par leur run.
//
// Une proposition se tranche une fois : un second geste, le même ou l'autre,
// n'écrit rien et rend le premier.
import type { Evenement } from "../evenements.ts";
import type { Journal } from "../journal.ts";
import { parcoursDesTickets } from "../parcours-des-tickets.ts";
import { ratesDeLaCause } from "./detecter.ts";
import { lireDiff } from "./portee.ts";
import type { Proposee } from "./proposer.ts";

export type Acceptee = Extract<Evenement, { type: "correction.accepted" }>;
export type Refusee = Extract<Evenement, { type: "correction.refused" }>;

export const OUI = "yes";
export const NON = "no";
export type Reponse = typeof OUI | typeof NON;

// `tranchee` : le geste vient d'être écrit. `deja` : la proposition l'était,
// et `fait` est ce qui l'a tranchée. `inconnue` : aucune proposition montrée
// ne porte ce numéro — jamais proposée, ou écartée par la garde de portée.
export type Decision = { issue: "tranchee" | "deja"; fait: Acceptee | Refusee } | { issue: "inconnue" };

// La proposition que porte ce `seq`, si une carte la montre : une proposition
// dont la garde, relue, refuse le diff ne se tranche pas plus qu'elle ne se
// montre.
export function propositionMontree(journal: Journal, proposition: number): Proposee | null {
  const proposee = journal.duType("correction.proposed", Number.MAX_SAFE_INTEGER).find(({ seq }) => seq === proposition);
  return proposee === undefined || "refus" in lireDiff(proposee.payload.diff) ? null : proposee;
}

// Ce qui a tranché la proposition, ou null si rien ne l'a encore fait.
export function decisionDe(journal: Journal, proposition: number): Acceptee | Refusee | null {
  const tranchees = [...journal.duType("correction.accepted", Number.MAX_SAFE_INTEGER), ...journal.duType("correction.refused", Number.MAX_SAFE_INTEGER)];
  return tranchees.find(({ payload }) => payload.proposal === proposition) ?? null;
}

// Écrit le geste du chef sur la proposition `proposition` (son `seq`), d'un
// seul geste : relue, puis tranchée — la même clé d'unicité tient le « oui »
// et le « non ».
export function decider(journal: Journal, projet: string, proposition: number, reponse: Reponse): Decision {
  return journal.base.transaction((): Decision => {
    const proposee = propositionMontree(journal, proposition);
    if (proposee === null) return { issue: "inconnue" };
    const deja = decisionDe(journal, proposition);
    if (deja !== null) return { issue: "deja", fait: deja };
    const { candidate, cause, tickets } = proposee.payload;
    const commun = { project: projet, ticket: null, author: "chef", dedupKey: `correction.decision:${proposition}` } as const;
    const fait =
      reponse === OUI
        ? journal.ajouter({ ...commun, type: "correction.accepted", payload: { proposal: proposition, candidate, cause } })
        : journal.ajouter({
            ...commun,
            type: "correction.refused",
            // Tous les échecs de la cause que le journal porte, pas seulement
            // ceux de la fenêtre : aucun d'eux n'est neuf après ce « non ».
            payload: { proposal: proposition, candidate, cause, tickets, runs: ratesDeLaCause(parcoursDesTickets(journal.base), cause).map(({ run }) => run) },
          });
    if (fait === null) throw new Error(`la proposition ${proposition} est tranchée sans que le journal le dise`);
    return { issue: "tranchee", fait: fait as Acceptee | Refusee };
  });
}
